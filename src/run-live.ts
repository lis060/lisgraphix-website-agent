import { writeFileSync, mkdirSync } from 'node:fs';
import { DEFAULT_SETTINGS } from './config/config';
import { discoverPlaces } from './discovery/google-places';
import { runPipeline } from './workflow/pipeline';
import type { BusinessCandidate, VerificationInput } from './domain/types';

/** Listing-only check. Do not claim a missing website without independent checks. */
function listingFacts(candidate: BusinessCandidate): VerificationInput {
  return {
    listingWebsiteUrl: candidate.websiteUrl,
    listingChecked: true,
    searchChecked: false,
    searchDomains: [],
    socialChecked: false,
    socialLinkedDomains: [],
    domainBelongsToBusiness: null,
    domainReachable: null,
    evidence: [{
      kind: 'manual',
      detail: candidate.websiteUrl
        ? 'Listing provides a website; ownership and reachability are unverified.'
        : 'No website listed by Google Places; an independent search is still needed.',
      sourceUrl: candidate.mapsUrl,
      observedAt: new Date().toISOString(),
    }],
  };
}

async function main() {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) throw new Error('Missing GOOGLE_PLACES_API_KEY (set in GitHub Actions Secrets)');
  const discovery = await discoverPlaces(apiKey);
  const report = await runPipeline(discovery.candidates, {
    settings: DEFAULT_SETTINGS,
    nowIso: new Date().toISOString(),
    verify: listingFacts,
  });
  mkdirSync('reports', { recursive: true });
  const date = new Date().toISOString().slice(0, 10);
  const path = 'reports/prospects-' + date + '.json';
  writeFileSync(path, JSON.stringify({
    notice: 'Listing-only checks. Missing websites are NOT independently verified. No demos deployed.',
    source: 'Google Places API (New)',
    requestsAttempted: discovery.requestsAttempted,
    quotaExhausted: discovery.quotaExhausted,
    warnings: discovery.warnings,
    ...report,
    candidates: discovery.candidates,
  }, null, 2));
  console.log('Wrote ' + path + '; discovered ' + discovery.candidates.length + ' businesses.');
  for (const warning of discovery.warnings) console.warn(warning);
  if (discovery.quotaExhausted) {
    console.warn('Quota exhausted: report was saved without retrying the API. Fix the limit/billing before expecting real results.');
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
