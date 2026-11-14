import type {
  BusinessCandidate,
  LeadScore,
  LeadSignals,
  ScoreFactor,
  VerificationResult,
} from '../domain/types';

export interface ScoreContext {
  /** Website-fit points for the category, 0 to 15. */
  websiteFit: number;
  /** "Now" as ISO string, injected so tests are deterministic. */
  nowIso: string;
  minOpportunityScore: number;
  /** Signals gathered during the run. Missing signals get a neutral middle value. */
  signals?: LeadSignals;
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

function activityFactor(signals: LeadSignals | undefined): ScoreFactor {
  const maxPoints = 12;
  const n = signals?.ratingCount;
  // Reasons use bands, not exact numbers, so no figure from a listing is stored.
  if (n === undefined) return { label: 'Customer activity', points: 6, maxPoints, reason: 'Customer activity not known.' };
  if (n >= 50) return { label: 'Customer activity', points: 12, maxPoints, reason: 'Many customers have rated the business, so it is busy.' };
  if (n >= 10) return { label: 'Customer activity', points: 9, maxPoints, reason: 'A fair number of customers have rated the business.' };
  if (n >= 1) return { label: 'Customer activity', points: 5, maxPoints, reason: 'A few customers have rated the business.' };
  return { label: 'Customer activity', points: 2, maxPoints, reason: 'No customer ratings yet, so activity is unclear.' };
}

function onlinePresenceFactor(c: BusinessCandidate, signals: LeadSignals | undefined): ScoreFactor {
  const maxPoints = 10;
  const known = signals?.socialPagesFound !== undefined || c.socialUrls.length > 0;
  const pages = (signals?.socialPagesFound ?? 0) + c.socialUrls.length;
  if (!known) return { label: 'Online presence', points: 5, maxPoints, reason: 'Social media presence not checked.' };
  if (pages > 0) return { label: 'Online presence', points: 10, maxPoints, reason: 'Already promotes itself on social media, but has no website of its own.' };
  return { label: 'Online presence', points: 3, maxPoints, reason: 'No social media pages found.' };
}

function categoryFactor(signals: LeadSignals | undefined): ScoreFactor {
  const maxPoints = 5;
  if (signals?.categoryMatch === 'match') return { label: 'Category certainty', points: 5, maxPoints, reason: 'The listing type fits the category searched.' };
  if (signals?.categoryMatch === 'mismatch') return { label: 'Category certainty', points: 0, maxPoints, reason: 'The listing type does not fit the category.' };
  return { label: 'Category certainty', points: 3, maxPoints, reason: 'The listing type is unclear.' };
}

function activeFactor(c: BusinessCandidate): ScoreFactor {
  const maxPoints = 5;
  if (c.operational === true) return { label: 'Active business', points: 5, maxPoints, reason: 'Source shows the business operating.' };
  if (c.operational === null) return { label: 'Active business', points: 2, maxPoints, reason: 'Operating status unknown.' };
  return { label: 'Active business', points: 0, maxPoints, reason: 'Source shows the business closed.' };
}

function websiteValueFactor(websiteFit: number): ScoreFactor {
  return { label: 'Website value', points: Math.max(0, Math.min(15, websiteFit)), maxPoints: 15, reason: 'Category fit for a simple showcase website.' };
}

function contactFactor(c: BusinessCandidate): ScoreFactor {
  const phone = c.phone && c.phone.trim() ? 6 : 0;
  const email = c.email && c.email.trim() ? 2 : 0;
  const parts = [phone && 'phone', email && 'email'].filter(Boolean);
  return {
    label: 'Public contact', points: phone + email, maxPoints: 8,
    reason: parts.length ? `Public ${parts.join(' and ')} available.` : 'No public contact details found.',
  };
}

function demoInfoFactor(c: BusinessCandidate): ScoreFactor {
  const hasAddress = !!c.address && c.address.trim().length > 0;
  const hasDescription = !!c.description && c.description.trim().length >= 20;
  return {
    label: 'Information for a demo', points: (hasAddress ? 3 : 0) + (hasDescription ? 2 : 0), maxPoints: 5,
    reason: `${hasAddress ? 'Has an address' : 'No address'}; ${hasDescription ? 'has a usable description' : 'no description'}.`,
  };
}

function freshnessFactor(c: BusinessCandidate, nowIso: string): ScoreFactor {
  const age = daysBetween(c.lastVerifiedAt ?? c.discoveredAt, nowIso);
  const points = age <= 30 ? 5 : age <= 90 ? 3 : 0;
  return { label: 'Freshness', points, maxPoints: 5, reason: `Information is ${Math.max(0, Math.floor(age))} days old.` };
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
 * points and reason so the score can be audited. The nine factors add up to
 * exactly 100: website gap 35, customer activity 12, online presence 10,
 * category certainty 5, website value 15, public contact 8, information for a
 * demo 5, active business 5, freshness 5.
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
    activityFactor(ctx.signals),
    onlinePresenceFactor(candidate, ctx.signals),
    categoryFactor(ctx.signals),
    websiteValueFactor(ctx.websiteFit),
    contactFactor(candidate),
    demoInfoFactor(candidate),
    activeFactor(candidate),
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
