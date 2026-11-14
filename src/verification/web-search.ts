import { normalizeBusinessName } from '../dedupe/dedupe';
import type { BusinessCandidate, Evidence, VerificationInput } from '../domain/types';
import { isSocialUrl } from '../discovery/google-places';

/**
 * Second website check: search the web for the business and look for a site
 * that appears to be its own.
 *
 * Search results are untrusted text. They are only compared and counted here,
 * never executed or followed as instructions.
 */

export interface SearchResult { url: string; title: string }
export interface SearchProvider {
  name: string;
  search(query: string): Promise<SearchResult[]>;
}
export interface SearchBudget { remaining: number }

/** Listing, directory and marketplace sites. A page there is not the business's own website. */
const DIRECTORY_HOSTS = /(^|\.)(google\.[a-z.]+|bing\.com|yahoo\.com|duckduckgo\.com|wikipedia\.org|tripadvisor\.[a-z.]+|booking\.com|expedia\.com|hotels\.com|airbnb\.[a-z.]+|agoda\.com|trivago\.[a-z.]+|yelp\.com|foursquare\.com|yellowpages\.[a-z.]+|businessghana\.com|ghanayello\.com|ghanabusinessweb\.com|ghanaweb\.com|yen\.com\.gh|jiji\.com\.gh|tonaton\.com|jumia\.com\.gh|glovoapp\.com|bolt\.eu|ubereats\.com|cybo\.com|waze\.com|mapquest\.com|africabizinfo\.com|infoisinfo-gh\.com|vymaps\.com|findglocal\.com|restaurantguru\.com|wanderlog\.com|pinterest\.[a-z.]+|medium\.com|blogspot\.com|wordpress\.com|wixsite\.com|business\.site)$/i;

const STOP_WORDS = new Set(['the', 'and', 'of', 'in', 'at', 'gh', 'ghana', 'accra', 'tema', 'kumasi', 'shop', 'store', 'services', 'service', 'enterprise', 'ventures', 'ltd']);

function nameTokens(name: string): string[] {
  return normalizeBusinessName(name).split(' ').filter((t) => t.length >= 3 && !STOP_WORDS.has(t));
}

function hostOf(url: string): string | null {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.hostname.toLowerCase().replace(/^www\./, '') : null;
  } catch {
    return null;
  }
}

export type DomainMatch = 'strong' | 'weak' | 'none';

/**
 * strong: the domain itself contains the business name (glowsalon.com for "Glow Salon").
 * weak:   the page title names the business, but the domain does not.
 */
export function matchDomain(businessName: string, result: SearchResult): DomainMatch {
  const host = hostOf(result.url);
  const tokens = nameTokens(businessName);
  if (!host || tokens.length === 0) return 'none';
  const label = host.split('.')[0]!.replace(/[^a-z0-9]/g, '');
  const joined = tokens.join('');
  const inHost = tokens.filter((t) => label.includes(t)).length;
  if (label.includes(joined) || (tokens.length >= 2 && inHost === tokens.length)) return 'strong';
  const title = normalizeBusinessName(result.title);
  if (title.includes(normalizeBusinessName(businessName))) return 'weak';
  return 'none';
}

export interface SearchFacts {
  searchChecked: boolean;
  searchDomains: string[];
  domainBelongsToBusiness: boolean | null;
  evidence: Evidence[];
  /** Social media pages seen in the results. Undefined when no search ran. */
  socialPagesFound?: number;
}

export async function searchForWebsite(
  candidate: Pick<BusinessCandidate, 'name' | 'city'>,
  provider: SearchProvider,
  budget: SearchBudget,
  nowIso: string,
): Promise<SearchFacts> {
  const none: SearchFacts = { searchChecked: false, searchDomains: [], domainBelongsToBusiness: null, evidence: [] };
  if (budget.remaining <= 0) return none;
  budget.remaining -= 1;

  const query = `"${candidate.name.replace(/"/g, '')}" ${candidate.city} Ghana`;
  const results = await provider.search(query);

  const evidence: Evidence[] = [];
  let strong: string | undefined;
  let weak: string | undefined;
  let social = 0;
  for (const r of results.slice(0, 10)) {
    const host = hostOf(r.url);
    if (!host) continue;
    if (isSocialUrl(r.url)) { social += 1; continue; }
    if (DIRECTORY_HOSTS.test(host)) continue;
    const m = matchDomain(candidate.name, r);
    if (m === 'strong') strong ??= `https://${host}`;
    else if (m === 'weak') weak ??= `https://${host}`;
  }

  const found = strong ?? weak;
  if (found) {
    evidence.push({
      kind: 'search_result', sourceUrl: found, observedAt: nowIso,
      detail: strong
        ? `Web search (${provider.name}) found a site whose address matches the business name.`
        : `Web search (${provider.name}) found a page that names the business. Ownership is unconfirmed.`,
    });
  } else {
    evidence.push({
      kind: 'search_result', observedAt: nowIso,
      detail: `Web search (${provider.name}) found no site of its own in the top results.`,
    });
  }
  if (social > 0) {
    evidence.push({ kind: 'search_result', observedAt: nowIso, detail: `Web search found ${social} social media page(s).` });
  }
  return {
    searchChecked: true,
    searchDomains: found ? [found] : [],
    domainBelongsToBusiness: strong ? true : null,
    evidence,
    socialPagesFound: social,
  };
}

/** Combines what the listing told us with what the web search found. */
export function mergeFacts(listing: VerificationInput, search: SearchFacts): VerificationInput {
  return {
    ...listing,
    searchChecked: listing.searchChecked || search.searchChecked,
    searchDomains: [...listing.searchDomains, ...search.searchDomains],
    domainBelongsToBusiness: listing.listingWebsiteUrl ? listing.domainBelongsToBusiness : search.domainBelongsToBusiness,
    evidence: [...listing.evidence, ...search.evidence],
    socialPagesFound: search.socialPagesFound,
  };
}
