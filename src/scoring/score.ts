import type {
  BusinessCandidate,
  LeadScore,
  ScoreFactor,
  VerificationResult,
} from '../domain/types';

export interface ScoreContext {
  /** Website-fit points for the category, 0 to 15. */
  websiteFit: number;
  /** "Now" as ISO string, injected so tests are deterministic. */
  nowIso: string;
  minOpportunityScore: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function daysBetween(fromIso: string, toIso: string): number {
  return (new Date(toIso).getTime() - new Date(fromIso).getTime()) / DAY_MS;
}

function websiteGapFactor(v: VerificationResult): ScoreFactor {
  const maxPoints = 35;
  let points = 0;
  let reason: string;
  switch (v.status) {
    case 'no_official_website_identified':
      points = Math.round(v.confidence * maxPoints);
      reason = `No official website identified (confidence ${Math.round(v.confidence * 100)}%).`;
      break;
    case 'social_media_only':
      points = Math.round(v.confidence * 25);
      reason = 'Only social media found; no official website.';
      break;
    case 'website_broken_or_outdated':
      points = 15;
      reason = 'Website appears broken or outdated, so a refresh may add value.';
      break;
    default:
      points = 0;
      reason = `Status "${v.status}" does not show a website gap.`;
  }
  return { label: 'Website gap', points, maxPoints, reason };
}

function infoQualityFactor(c: BusinessCandidate): ScoreFactor {
  const fields = [c.name, c.category, c.city, c.address, c.description];
  const filled = fields.filter((f) => f && f.trim().length > 0).length;
  const points = Math.round((filled / fields.length) * 15);
  return {
    label: 'Information quality',
    points,
    maxPoints: 15,
    reason: `${filled} of ${fields.length} key details present (name, category, city, address, description).`,
  };
}

function activeFactor(c: BusinessCandidate): ScoreFactor {
  if (c.operational === true) {
    return { label: 'Active business', points: 10, maxPoints: 10, reason: 'Source shows the business operating.' };
  }
  if (c.operational === null) {
    return { label: 'Active business', points: 4, maxPoints: 10, reason: 'Operating status unknown.' };
  }
  return { label: 'Active business', points: 0, maxPoints: 10, reason: 'Source shows the business closed.' };
}

function websiteValueFactor(websiteFit: number): ScoreFactor {
  return {
    label: 'Website value',
    points: websiteFit,
    maxPoints: 15,
    reason: 'Category fit for a simple showcase website.',
  };
}

function contactFactor(c: BusinessCandidate): ScoreFactor {
  const phone = c.phone && c.phone.trim() ? 6 : 0;
  const email = c.email && c.email.trim() ? 4 : 0;
  const parts = [phone && 'phone', email && 'email'].filter(Boolean);
  return {
    label: 'Public contact',
    points: phone + email,
    maxPoints: 10,
    reason: parts.length ? `Public ${parts.join(' and ')} available.` : 'No public contact details found.',
  };
}

function demoSuitabilityFactor(c: BusinessCandidate): ScoreFactor {
  const hasDescription = !!c.description && c.description.trim().length >= 20;
  const hasAddress = !!c.address && c.address.trim().length > 0;
  const points = (hasDescription ? 5 : 0) + (hasAddress ? 5 : 0);
  return {
    label: 'Demo suitability',
    points,
    maxPoints: 10,
    reason: `${hasDescription ? 'Has a usable description' : 'No usable description'}; ${
      hasAddress ? 'has an address' : 'no address'
    }.`,
  };
}

function freshnessFactor(c: BusinessCandidate, nowIso: string): ScoreFactor {
  const reference = c.lastVerifiedAt ?? c.discoveredAt;
  const age = daysBetween(reference, nowIso);
  let points = 0;
  if (age <= 30) points = 5;
  else if (age <= 90) points = 3;
  return {
    label: 'Freshness',
    points,
    maxPoints: 5,
    reason: `Information is ${Math.max(0, Math.floor(age))} days old.`,
  };
}

function recommendation(c: BusinessCandidate, v: VerificationResult): string {
  if (v.status === 'website_broken_or_outdated') return 'Website refresh and mobile-friendly rebuild';
  const cat = c.category.toLowerCase();
  if (/restaurant|food/.test(cat)) return 'Menu, location and WhatsApp enquiry page';
  if (/salon|barber/.test(cat)) return 'Service showcase and appointment enquiries';
  if (/boutique|fashion/.test(cat)) return 'Collections showcase and WhatsApp shopping enquiries';
  if (/guesthouse|hotel/.test(cat)) return 'Room showcase, facilities and booking enquiries';
  return 'Service showcase and contact enquiries';
}

/**
 * Explainable 0 to 100 opportunity score. Each factor is listed with its
 * points and reason so the score can be audited.
 *
 * The score does not estimate revenue or ability to pay.
 */
export function scoreLead(
  candidate: BusinessCandidate,
  verification: VerificationResult,
  ctx: ScoreContext,
): LeadScore {
  const factors: ScoreFactor[] = [
    websiteGapFactor(verification),
    infoQualityFactor(candidate),
    activeFactor(candidate),
    websiteValueFactor(ctx.websiteFit),
    contactFactor(candidate),
    demoSuitabilityFactor(candidate),
    freshnessFactor(candidate, ctx.nowIso),
  ];
  const total = Math.min(100, factors.reduce((sum, f) => sum + f.points, 0));

  // Gates: a lead is only prioritized when it is clearly open, has a website gap
  // identified with reasonable confidence, and meets the minimum score.
  let prioritized = false;
  let decisionReason: string;
  if (candidate.operational === false) {
    decisionReason = 'Not prioritized: the business appears closed.';
  } else if (verification.status !== 'no_official_website_identified' || verification.confidence < 0.6) {
    decisionReason = `Not prioritized: website status is "${verification.status}" at ${Math.round(
      verification.confidence * 100,
    )}% confidence. Only clear website gaps are prioritized.`;
  } else if (total < ctx.minOpportunityScore) {
    decisionReason = `Not prioritized: score ${total} is below the minimum of ${ctx.minOpportunityScore}.`;
  } else {
    prioritized = true;
    decisionReason = `Prioritized: score ${total} with a website gap identified at ${Math.round(
      verification.confidence * 100,
    )}% confidence.`;
  }

  return {
    total,
    factors,
    prioritized,
    decisionReason,
    websiteRecommendation: recommendation(candidate, verification),
  };
}
