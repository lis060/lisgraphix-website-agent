/**
 * Live discovery test run:  npm run discover
 *
 * Calls Google Places with your key, checks listed websites, scores the
 * results and prints the daily report. It does not build demos, deploy
 * anything or contact anyone.
 *
 * By default nothing is saved. Add --save (npm run discover -- --save) with
 * DATABASE_URL set to store the run. Google records are stored by place ID
 * only, with our own status and score.
 */
import { DEFAULT_SETTINGS } from './config/config';
import { buildQueries, createPlacesSource, type DiscoveredBusiness } from './discovery/google-places';
import { buildDailyReport, renderReportText } from './reports/daily-report';
import { checkReachable } from './verification/reachability';
import { providerFromEnv } from './verification/search-providers';
import { mergeFacts, searchForWebsite } from './verification/web-search';
import { runPipeline } from './workflow/pipeline';
import { connect } from './storage/pg';
import { RunInProgressError, saveRun, startExecution } from './storage/save-run';

async function main(): Promise<void> {
  try { process.loadEnvFile(); } catch { /* no .env file: use the environment as it is */ }
  const save = process.argv.includes('--save');
  const databaseUrl = process.env.DATABASE_URL;
  if (save && !databaseUrl) {
    console.error('--save needs DATABASE_URL in your .env file.');
    process.exit(1);
  }
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) {
    console.error('GOOGLE_PLACES_API_KEY is not set. Add it to your environment, then run again.');
    process.exit(1);
  }
  const settings = DEFAULT_SETTINGS;
  const now = new Date();
  const nowIso = now.toISOString();
  const budget = { remaining: settings.maxPlacesCallsPerDay };
  const source = createPlacesSource({ apiKey, budget, nowIso });

  const db = save ? await connect(databaseUrl!) : null;
  let executionId: string | null = null;
  if (db) {
    try {
      executionId = await startExecution(db, 'manual');
    } catch (err) {
      await db.close();
      if (err instanceof RunInProgressError) { console.error(err.message); process.exit(1); }
      throw err;
    }
  }

  const found = new Map<string, DiscoveredBusiness>();
  const failures: string[] = [];
  for (const q of buildQueries(settings, Math.floor(now.getTime() / 86_400_000))) {
    try {
      for (const d of await source.search(q)) found.set(`${d.candidate.name}|${d.candidate.city}`, d);
    } catch (err) {
      failures.push(err instanceof Error ? err.message : String(err));
    }
  }

  const searchProvider = providerFromEnv(process.env);
  const searchBudget = { remaining: settings.maxSearchCallsPerDay };
  const all = [...found.values()];
  const run = await runPipeline(all.map((d) => d.candidate), {
    settings, nowIso,
    verify: async (c) => {
      const facts = found.get(`${c.name}|${c.city}`)!.listingFacts;
      if (facts.listingWebsiteUrl) {
        const r = await checkReachable(facts.listingWebsiteUrl);
        return { ...facts, domainReachable: r.reachable };
      }
      if (!searchProvider) return facts;
      // No website on the listing: run the second check through web search.
      const merged = mergeFacts(facts, await searchForWebsite(c, searchProvider, searchBudget, nowIso));
      const site = merged.searchDomains[0];
      return site ? { ...merged, domainReachable: (await checkReachable(site)).reachable } : merged;
    },
  });

  console.log(renderReportText(buildDailyReport(run)));
  console.log(`\nGoogle Places calls used: ${source.callsMade()} of ${settings.maxPlacesCallsPerDay}`);
  if (failures.length) console.log(`Search failures:\n- ${failures.join('\n- ')}`);
  if (db && executionId) {
    const result = await saveRun(db, executionId, run, {
      apiUsage: { googlePlacesCalls: source.callsMade() }, extraFailures: failures.length,
    });
    await db.close();
    console.log(`\nSaved ${result.businessesSaved} businesses (place ID only). Run status: ${result.status}.`);
  } else {
    console.log('\nNothing was saved. Add --save to store this run.');
  }
  console.log(searchProvider
    ? `Web searches used (${searchProvider.name}): ${settings.maxSearchCallsPerDay - searchBudget.remaining} of ${settings.maxSearchCallsPerDay}`
    : '\nNo web search key is set, so no lead can be prioritized yet. Add BRAVE_SEARCH_API_KEY or SERPER_API_KEY to .env.');
}

main().catch((err) => { console.error(err instanceof Error ? err.message : err); process.exit(1); });
