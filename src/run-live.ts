import { writeFileSync, mkdirSync } from 'node:fs';
import { DEFAULT_SETTINGS } from './config/config';
import { discoverPlaces } from './discovery/google-places';
import { runPipeline } from './workflow/pipeline';
import type { BusinessCandidate, VerificationInput } from './domain/types';

/** This first live connector checks Google's listing field only. It deliberately
 * does not claim a business has no website without independent verification. */
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
        ? 'Google Places listing supplies a website URL; ownership and reachability unverified.'
        : 'Google Places listing contains no official website field; further checks required.',
      sourceUrl: candidate.mapsUrl,
      observedAt: new Date().toISOString(),
    }],
  };
}

async function main() {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) throw new Error('Missing GOOGLE_PLACES_API_KEY (set in GitHub Actions Secrets)');
  const candidates = await discoverPlaces(apiKey);
  const report = await runPipeline(candidates, {
    settings: DEFAULT_SETTINGS,
    nowIso: new Date().toISOString(),
    verify: listingFacts,
  });
  mkdirSync('reports', { recursive: true });
  const date = new Date().toISOString().slice(0, 10);
  const path = 'reports/prospects-' + date + '.json';
  writeFileSync(path, JSON.stringify({
    notice: 'Listing-only checks. Website absence is NOT verified. No demos deployed.',
    source: 'Google Places API (New)',
    ...report,
    candidates,
  }, null, 2));
  console.log('Wrote ' + path + '; discovered ' + candidates.length + ' businesses.');
  console.log('Independent web verification and demos are not connected yet.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
