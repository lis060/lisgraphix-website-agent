import type { AutomationSettings } from '../config/config';
import type { BusinessCandidate, Evidence, VerificationInput } from '../domain/types';
import { matchCategory, type CategoryMatch } from './category-match';
import { validateCandidates } from './manual-import';

/**
 * Business discovery through Google Places API (New), Text Search.
 * NOT yet verified against the live API: it needs your API key.
 *
 * Cost control:
 * - The field mask below includes phone numbers and website, which bills each
 *   search at the "Text Search Enterprise" rate. The type fields used for the
 *   category check belong to a lower-priced group, so they add no cost. No review, rating or photo
 *   fields are requested, which would cost more.
 * - A daily call budget caps usage. Retries count against it.
 *
 * Storage terms: Google's Places policies do not allow storing or caching
 * Places content, with the place ID as the exception. Results from this
 * adapter are used in memory during a run. When a run is saved, only the place
 * ID and our own work are stored (see storage/save-run.ts), and the database
 * refuses anything else for Google records.
 *
 * Safety: everything Google returns is treated as untrusted text and passes
 * through the same validation as any other import. The API key is only ever
 * sent in a request header and never appears in errors or logs.
 */

const ENDPOINT = 'https://places.googleapis.com/v1/places:searchText';
export const FIELD_MASK = [
  'places.id', 'places.displayName', 'places.formattedAddress', 'places.businessStatus',
  'places.googleMapsUri', 'places.websiteUri', 'places.nationalPhoneNumber', 'places.internationalPhoneNumber',
  'places.types', 'places.primaryType', 'places.userRatingCount',
].join(',');

const SOCIAL_HOSTS = /(^|\.)(facebook\.com|fb\.com|instagram\.com|tiktok\.com|x\.com|twitter\.com|linkedin\.com|youtube\.com|wa\.me|whatsapp\.com|linktr\.ee)$/i;

export interface PlacesQuery { category: string; city: string; textQuery: string }
export interface CallBudget { remaining: number }
export interface DiscoveredBusiness {
  candidate: BusinessCandidate;
  /** What the listing itself tells us. One check only, so never conclusive alone. */
  listingFacts: VerificationInput;
  /** Whether Google's own type labels agree with the category we searched for. */
  categoryMatch: CategoryMatch;
}

/**
 * One query per enabled category and city. When there are more queries than
 * the daily cap allows, the starting point rotates each day so every
 * combination gets its turn.
 */
export function buildQueries(settings: AutomationSettings, dayIndex: number): PlacesQuery[] {
  const all: PlacesQuery[] = [];
  for (const cat of settings.categories.filter((c) => c.enabled)) {
    for (const city of settings.cities) {
      all.push({ category: cat.name, city, textQuery: `${cat.name} in ${city}, Ghana` });
    }
  }
  const take = Math.min(all.length, Math.max(0, settings.maxPlacesCallsPerDay));
  if (all.length === 0 || take === 0) return [];
  const start = (((dayIndex * take) % all.length) + all.length) % all.length;
  return Array.from({ length: take }, (_, i) => all[(start + i) % all.length]!);
}

export function isSocialUrl(url: string): boolean {
  try { return SOCIAL_HOSTS.test(new URL(url).hostname); } catch { return false; }
}

interface RawPlace {
  id?: unknown; displayName?: { text?: unknown }; formattedAddress?: unknown; businessStatus?: unknown;
  googleMapsUri?: unknown; websiteUri?: unknown; nationalPhoneNumber?: unknown; internationalPhoneNumber?: unknown;
  types?: unknown; primaryType?: unknown; userRatingCount?: unknown;
}

function toDiscovered(place: RawPlace, q: PlacesQuery, nowIso: string): DiscoveredBusiness | null {
  const website = typeof place.websiteUri === 'string' ? place.websiteUri : undefined;
  const social = website && isSocialUrl(website);
  const status = place.businessStatus;
  const maps = typeof place.googleMapsUri === 'string' ? place.googleMapsUri : undefined;

  const { valid } = validateCandidates([{
    externalId: place.id,
    name: place.displayName?.text,
    category: q.category, city: q.city,
    address: place.formattedAddress,
    phone: place.internationalPhoneNumber ?? place.nationalPhoneNumber,
    socialUrls: social ? [website] : [],
    mapsUrl: maps,
    websiteUrl: social ? undefined : website,
    operational: status === 'OPERATIONAL' ? true : status === 'CLOSED_PERMANENTLY' || status === 'CLOSED_TEMPORARILY' ? false : null,
    sourceUrls: maps ? [maps] : [],
    discoveredAt: nowIso, lastVerifiedAt: nowIso,
  }], nowIso);
  const candidate = valid[0];
  if (!candidate || !candidate.externalId) return null;
  candidate.source = 'google_places';

  const evidence: Evidence[] = [];
  if (candidate.websiteUrl) {
    evidence.push({ kind: 'listing_website', detail: 'Google listing shows a website.', sourceUrl: candidate.mapsUrl, observedAt: nowIso });
  } else if (candidate.socialUrls.length > 0) {
    evidence.push({ kind: 'social_link', detail: 'Google listing links to a social media page, not a website.', sourceUrl: candidate.socialUrls[0], observedAt: nowIso });
  } else {
    evidence.push({ kind: 'listing_website', detail: 'Google listing shows no website.', sourceUrl: candidate.mapsUrl, observedAt: nowIso });
  }
  const types = Array.isArray(place.types) ? place.types.filter((t): t is string => typeof t === 'string').slice(0, 30) : [];
  const primary = typeof place.primaryType === 'string' ? place.primaryType : undefined;
  const categoryMatch = matchCategory(q.category, types, primary);
  const ratings = typeof place.userRatingCount === 'number' && place.userRatingCount >= 0 ? Math.floor(place.userRatingCount) : 0;
  // Scoring signals stay in memory for this run and are not stored.
  candidate.signals = { ratingCount: ratings, categoryMatch };
  return {
    candidate,
    categoryMatch,
    listingFacts: {
      listingWebsiteUrl: candidate.websiteUrl, listingChecked: true,
      searchChecked: false, searchDomains: [],
      socialChecked: false, socialLinkedDomains: [],
      domainBelongsToBusiness: candidate.websiteUrl ? true : null,
      domainReachable: null, evidence,
    },
  };
}

export interface PlacesSourceOptions {
  apiKey: string;
  budget: CallBudget;
  nowIso: string;
  fetchImpl?: typeof fetch;
  /** Injected so tests do not wait. */
  sleep?: (ms: number) => Promise<void>;
  maxAttempts?: number;
}

export function createPlacesSource(opts: PlacesSourceOptions) {
  const doFetch = opts.fetchImpl ?? fetch;
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const maxAttempts = opts.maxAttempts ?? 3;
  let calls = 0;

  async function search(q: PlacesQuery): Promise<DiscoveredBusiness[]> {
    for (let attempt = 1; ; attempt++) {
      if (opts.budget.remaining <= 0) throw new Error('Daily Google Places call budget used up.');
      opts.budget.remaining -= 1;
      calls += 1;
      let res: Response;
      try {
        res = await doFetch(ENDPOINT, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': opts.apiKey, 'X-Goog-FieldMask': FIELD_MASK },
          body: JSON.stringify({ textQuery: q.textQuery, regionCode: 'GH', languageCode: 'en', pageSize: 20 }),
        });
      } catch {
        if (attempt >= maxAttempts) throw new Error(`Google Places request failed (network) for "${q.textQuery}".`);
        await sleep(500 * 2 ** (attempt - 1));
        continue;
      }
      if (res.ok) {
        const json = (await res.json()) as { places?: RawPlace[] };
        return (Array.isArray(json.places) ? json.places : [])
          .map((p) => toDiscovered(p, q, opts.nowIso))
          .filter((d): d is DiscoveredBusiness => d !== null);
      }
      const retryable = res.status === 429 || res.status >= 500;
      if (!retryable || attempt >= maxAttempts) {
        throw new Error(`Google Places returned HTTP ${res.status} for "${q.textQuery}".`);
      }
      await sleep(500 * 2 ** (attempt - 1));
    }
  }

  return { search, callsMade: () => calls };
}

/**
 * Takes one result from each search in turn, so the daily limit is spread
 * across categories and cities and does not all go to the first search.
 * A business returned by more than one search is kept once.
 */
export function interleave(groups: DiscoveredBusiness[][]): DiscoveredBusiness[] {
  const out: DiscoveredBusiness[] = [];
  const seen = new Set<string>();
  const longest = Math.max(0, ...groups.map((g) => g.length));
  for (let i = 0; i < longest; i++) {
    for (const group of groups) {
      const d = group[i];
      if (!d) continue;
      const key = d.candidate.externalId ?? `${d.candidate.name}|${d.candidate.city}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(d);
    }
  }
  return out;
}

/** Drops results whose Google type clearly belongs to a different kind of business. */
export function dropCategoryMismatches(list: DiscoveredBusiness[]): { kept: DiscoveredBusiness[]; dropped: number } {
  const kept = list.filter((d) => d.categoryMatch !== 'mismatch');
  return { kept, dropped: list.length - kept.length };
}
