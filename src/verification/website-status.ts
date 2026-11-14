import type {
  Evidence,
  VerificationInput,
  VerificationResult,
  WebsiteStatus,
} from '../domain/types';

/**
 * Website absence verification.
 *
 * Important: "no website identified" means we looked and found nothing with
 * reasonable confidence. It is never presented as proof that no website exists.
 * Confidence is capped below 1 for that reason.
 */

const NO_WEBSITE_CONFIDENCE_CAP = 0.85;

function countChecks(input: VerificationInput): number {
  return [input.listingChecked, input.searchChecked, input.socialChecked].filter(Boolean).length;
}

function classifyFoundDomain(
  websiteUrl: string,
  input: VerificationInput,
  evidence: Evidence[],
): VerificationResult {
  const notes: string[] = [];

  if (input.domainReachable === false) {
    notes.push('The website address did not respond when checked.');
    return { status: 'website_broken_or_outdated', confidence: 0.7, websiteUrl, evidence, notes };
  }
  if (input.domainBelongsToBusiness === false) {
    notes.push('The website appears to belong to a different business or is unrelated.');
    return { status: 'needs_manual_verification', confidence: 0.5, websiteUrl, evidence, notes };
  }
  if (input.domainBelongsToBusiness === true && input.domainReachable === true) {
    return { status: 'website_exists', confidence: 0.9, websiteUrl, evidence, notes };
  }
  notes.push('Ownership or reachability of the website could not be fully confirmed.');
  return { status: 'needs_manual_verification', confidence: 0.5, websiteUrl, evidence, notes };
}

export function classifyWebsiteStatus(input: VerificationInput): VerificationResult {
  const evidence = [...input.evidence];

  // 1. A website on the listing or linked from social profiles is the strongest signal.
  if (input.listingWebsiteUrl) {
    return classifyFoundDomain(input.listingWebsiteUrl, input, evidence);
  }
  const firstDomain = [...input.searchDomains, ...input.socialLinkedDomains][0];
  if (firstDomain) {
    return classifyFoundDomain(firstDomain, input, evidence);
  }

  // 2. Social profiles exist but no official site was found.
  const checks = countChecks(input);
  if (checks === 0) {
    return {
      status: 'uncertain',
      confidence: 0.1,
      evidence,
      notes: ['No checks have been run yet, so no website status can be given.'],
    };
  }

  const hasSocial = input.evidence.some((e) => e.kind === 'social_link');
  if (hasSocial && input.socialChecked) {
    return {
      status: 'social_media_only',
      confidence: 0.6,
      evidence,
      notes: ['Social media profiles were found, but none linked to an official website.'],
    };
  }

  // 3. Nothing found. Confidence grows with the number of independent checks,
  //    but is capped because absence is never absolute proof.
  const status: WebsiteStatus = checks >= 2 ? 'no_official_website_identified' : 'uncertain';
  const confidence = Math.min(NO_WEBSITE_CONFIDENCE_CAP, 0.35 + 0.2 * checks);
  return {
    status,
    confidence: status === 'uncertain' ? Math.min(confidence, 0.4) : confidence,
    evidence,
    notes:
      status === 'no_official_website_identified'
        ? [`No official website found in ${checks} of 3 checks. This is not proof that none exists.`]
        : ['Only one check was run, so the result is inconclusive.'],
  };
}
