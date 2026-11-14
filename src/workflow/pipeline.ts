import type { AutomationSettings } from '../config/config';
import { isCategoryEnabled } from '../config/config';
import type { BusinessCandidate, RankedLead, VerificationInput, VerificationResult } from '../domain/types';
import { dedupeBatch } from '../dedupe/dedupe';
import { classifyWebsiteStatus } from '../verification/website-status';
import { scoreLead } from '../scoring/score';
import { websiteFitFor } from '../config/config';

export interface PipelineOptions {
  settings: AutomationSettings;
  nowIso: string;
  /**
   * Supplies verification facts for a candidate. In production this calls
   * listing, search and HTTP checks. It may throw; failures are recorded,
   * not hidden.
   */
  verify: (candidate: BusinessCandidate) => VerificationInput | Promise<VerificationInput>;
}

export interface PipelineFailure {
  name: string;
  step: 'verify';
  message: string;
}

export interface PipelineReport {
  generatedAt: string;
  discovered: number;
  duplicatesDropped: { name: string; matchedName: string }[];
  duplicatesFlagged: { name: string; matchedName: string }[];
  skippedDisabledCategoryOrCity: number;
  skippedOverDiscoveryLimit: number;
  verified: number;
  qualifiedOpportunities: number;
  shortlisted: RankedLead[];
  demoSelections: RankedLead[];
  failures: PipelineFailure[];
}

export async function runPipeline(
  candidates: BusinessCandidate[],
  opts: PipelineOptions,
): Promise<PipelineReport> {
  const { settings, nowIso } = opts;

  // 1. Duplicates within the batch.
  const { kept, dropped, flagged } = dedupeBatch(candidates);

  // 2. Only enabled categories and configured cities.
  const configuredCities = new Set(settings.cities.map((c) => c.trim().toLowerCase()));
  let skippedDisabled = 0;
  const inScope = kept.filter((c) => {
    const ok =
      isCategoryEnabled(settings, c.category) &&
      configuredCities.has(c.city.trim().toLowerCase());
    if (!ok) skippedDisabled++;
    return ok;
  });

  // 3. Daily discovery limit. Prioritize quality over quantity.
  const withinLimit = inScope.slice(0, settings.dailyDiscoveryLimit);
  const skippedOverLimit = inScope.length - withinLimit.length;

  // 4. Verify and score each candidate. Failures are recorded and do not stop the run.
  const ranked: RankedLead[] = [];
  const failures: PipelineFailure[] = [];
  for (const candidate of withinLimit) {
    try {
      const facts = await opts.verify(candidate);
      const verification: VerificationResult = classifyWebsiteStatus(facts);
      const score = scoreLead(candidate, verification, {
        websiteFit: websiteFitFor(settings, candidate.category),
        nowIso,
        minOpportunityScore: settings.minOpportunityScore,
      });
      ranked.push({ candidate, verification, score });
    } catch (err) {
      failures.push({
        name: candidate.name,
        step: 'verify',
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // 5. Highest scores first. Only prioritized leads reach the shortlist.
  ranked.sort((a, b) => b.score.total - a.score.total);
  const prioritized = ranked.filter((r) => r.score.prioritized);
  const shortlisted = prioritized.slice(0, settings.shortlistLimit);
  const demoSelections = shortlisted.slice(0, settings.dailyDemoLimit);

  return {
    generatedAt: nowIso,
    discovered: candidates.length,
    duplicatesDropped: dropped,
    duplicatesFlagged: flagged,
    skippedDisabledCategoryOrCity: skippedDisabled,
    skippedOverDiscoveryLimit: skippedOverLimit,
    verified: ranked.length,
    qualifiedOpportunities: prioritized.length,
    shortlisted,
    demoSelections,
    failures,
  };
}
