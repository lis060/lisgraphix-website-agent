/**
 * Live discovery test run:  npm run discover
 *
 * Calls Google Places with your key, checks listed websites, scores the
 * results and prints the daily report. It does NOT write to the database,
 * build demos, deploy anything or contact anyone.
 */
import { DEFAULT_SETTINGS } from './config/config';
import { buildQueries, createPlacesSource, type DiscoveredBusiness } from './discovery/google-places';
import { buildDailyReport, renderReportText } from './reports/daily-report';
import { checkReachable } from './verification/reachability';
import { runPipeline } from './workflow/pipeline';

async function main(): Promise<void> {
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

  const found = new Map<string, DiscoveredBusiness>();
  const failures: string[] = [];
  for (const q of buildQueries(settings, Math.floor(now.getTime() / 86_400_000))) {
    try {
      for (const d of await source.search(q)) found.set(`${d.candidate.name}|${d.candidate.city}`, d);
    } catch (err) {
      failures.push(err instanceof Error ? err.message : String(err));
    }
  }

  const all = [...found.values()];
  const run = await runPipeline(all.map((d) => d.candidate), {
    settings, nowIso,
    verify: async (c) => {
      const facts = found.get(`${c.name}|${c.city}`)!.listingFacts;
      if (!facts.listingWebsiteUrl) return facts;
      const r = await checkReachable(facts.listingWebsiteUrl);
      return { ...facts, domainReachable: r.reachable };
    },
  });

  console.log(renderReportText(buildDailyReport(run)));
  console.log(`\nGoogle Places calls used: ${source.callsMade()} of ${settings.maxPlacesCallsPerDay}`);
  if (failures.length) console.log(`Search failures:\n- ${failures.join('\n- ')}`);
  console.log('\nNote: leads are not prioritized from the listing alone. A web search check is still needed.');
}

main().catch((err) => { console.error(err instanceof Error ? err.message : err); process.exit(1); });
