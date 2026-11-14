/**
 * Command-line entry point for a local run on a JSON file of business records.
 *
 *   npm run run -- path/to/businesses.json
 *
 * This does not call any external API. Verification facts come from the
 * `verify` function, which here returns "unknown" facts so that every
 * lead is reported as needing manual verification until a real checker is connected.
 */
import { readFileSync } from 'node:fs';
import { DEFAULT_SETTINGS } from './config/config';
import { validateCandidates } from './discovery/manual-import';
import { runPipeline } from './workflow/pipeline';
import type { VerificationInput } from './domain/types';

function unknownFacts(): VerificationInput {
  return {
    listingChecked: false,
    searchChecked: false,
    searchDomains: [],
    socialChecked: false,
    socialLinkedDomains: [],
    domainBelongsToBusiness: null,
    domainReachable: null,
    evidence: [],
  };
}

async function main(): Promise<void> {
  const file = process.argv[2];
  if (!file) {
    console.error('Usage: npm run run -- <businesses.json>');
    process.exit(1);
  }
  const nowIso = new Date().toISOString();
  const raw = JSON.parse(readFileSync(file, 'utf8')) as unknown;
  const { valid, rejected } = validateCandidates(raw, nowIso);

  const report = await runPipeline(valid, {
    settings: DEFAULT_SETTINGS,
    nowIso,
    verify: () => unknownFacts(),
  });

  console.log(
    JSON.stringify(
      {
        imported: valid.length,
        rejectedRecords: rejected,
        ...report,
      },
      null,
      2,
    ),
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
