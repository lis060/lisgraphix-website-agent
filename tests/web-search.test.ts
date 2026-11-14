import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../src/config/config';
import { scoreLead } from '../src/scoring/score';
import { braveProvider, providerFromEnv, serperProvider } from '../src/verification/search-providers';
import { matchDomain, mergeFacts, searchForWebsite, type SearchProvider, type SearchResult } from '../src/verification/web-search';
import { classifyWebsiteStatus } from '../src/verification/website-status';
import type { BusinessCandidate, VerificationInput } from '../src/domain/types';

const NOW = '2026-11-14T09:30:00Z';
const biz: BusinessCandidate = {
  name: 'Glow Salon', category: 'Beauty salon', city: 'Accra', address: 'Osu', phone: '+233 24 123 4567',
  socialUrls: [], operational: true, sourceUrls: [], discoveredAt: NOW,
};
const listing: VerificationInput = {
  listingChecked: true, searchChecked: false, searchDomains: [], socialChecked: false, socialLinkedDomains: [],
  domainBelongsToBusiness: null, domainReachable: null,
  evidence: [{ kind: 'listing_website', detail: 'Google listing shows no website.', observedAt: NOW }],
};
const provider = (results: SearchResult[], log: string[] = []): SearchProvider => ({
  name: 'Test', search: async (q) => { log.push(q); return results; },
});
const run = (results: SearchResult[]) => searchForWebsite(biz, provider(results), { remaining: 5 }, NOW);

describe('matchDomain', () => {
  it('is strong when the domain contains the business name', () => {
    expect(matchDomain('Glow Salon', { url: 'https://www.glowsalon.com.gh/', title: 'Home' })).toBe('strong');
    expect(matchDomain('Glow Salon', { url: 'https://glow-salon-accra.com', title: '' })).toBe('strong');
  });
  it('is weak when only the page title names the business', () => {
    expect(matchDomain('Glow Salon', { url: 'https://beautyhub.example/p/1', title: 'Glow Salon | Beauty Hub' })).toBe('weak');
  });
  it('is none for unrelated sites, including partial word overlaps', () => {
    expect(matchDomain('Glow Salon', { url: 'https://salonsupplies.example', title: 'Salon chairs' })).toBe('none');
    expect(matchDomain('Glow Salon', { url: 'not a url', title: 'Glow Salon' })).toBe('none');
  });
});

describe('searchForWebsite', () => {
  it('quotes the name, adds the city, and uses one search from the budget', async () => {
    const log: string[] = [];
    const budget = { remaining: 2 };
    await searchForWebsite({ name: 'Glow "Best" Salon', city: 'Accra' }, provider([], log), budget, NOW);
    expect(log).toEqual(['"Glow Best Salon" Accra Ghana']);
    expect(budget.remaining).toBe(1);
  });

  it('ignores directories and social pages, so a business with only those has no site found', async () => {
    const f = await run([
      { url: 'https://www.facebook.com/glowsalon', title: 'Glow Salon' },
      { url: 'https://www.tripadvisor.com/x', title: 'Glow Salon' },
      { url: 'https://www.businessghana.com/glow-salon', title: 'Glow Salon' },
      { url: 'https://maps.google.com/?q=glow', title: 'Glow Salon' },
    ]);
    expect(f).toMatchObject({ searchChecked: true, searchDomains: [], domainBelongsToBusiness: null });
    expect(f.evidence.map((e) => e.detail).join(' ')).toMatch(/no site of its own.*1 social media page/);
  });

  it('reports a strong match as the business\'s own site', async () => {
    const f = await run([{ url: 'https://glowsalon.com.gh/about', title: 'About us' }]);
    expect(f.searchDomains).toEqual(['https://glowsalon.com.gh']);
    expect(f.domainBelongsToBusiness).toBe(true);
  });

  it('leaves ownership unconfirmed for a weak match', async () => {
    const f = await run([{ url: 'https://beautyhub.example/glow', title: 'Glow Salon - Beauty Hub' }]);
    expect(f.searchDomains).toEqual(['https://beautyhub.example']);
    expect(f.domainBelongsToBusiness).toBeNull();
  });

  it('does not search when the daily budget is used up', async () => {
    const log: string[] = [];
    const f = await searchForWebsite(biz, provider([], log), { remaining: 0 }, NOW);
    expect(f.searchChecked).toBe(false);
    expect(log).toEqual([]);
  });
});

describe('listing + search together', () => {
  const ctx = { websiteFit: 15, nowIso: NOW, minOpportunityScore: DEFAULT_SETTINGS.minOpportunityScore };

  it('two clean checks give "no official website identified" and the lead can be prioritized', async () => {
    const v = classifyWebsiteStatus(mergeFacts(listing, await run([{ url: 'https://www.facebook.com/glowsalon', title: 'Glow Salon' }])));
    expect(v.status).toBe('no_official_website_identified');
    expect(v.confidence).toBe(0.75);
    expect(v.evidence).toHaveLength(3);
    expect(scoreLead(biz, v, ctx).prioritized).toBe(true);
  });

  it('the listing alone is still not enough', () => {
    const v = classifyWebsiteStatus(listing);
    expect(v.status).toBe('uncertain');
    expect(scoreLead(biz, v, ctx).prioritized).toBe(false);
  });

  it('a site found by search and reachable means the business has a website', async () => {
    const merged = mergeFacts(listing, await run([{ url: 'https://glowsalon.com.gh', title: 'Glow Salon' }]));
    const v = classifyWebsiteStatus({ ...merged, domainReachable: true });
    expect(v.status).toBe('website_exists');
    expect(scoreLead(biz, v, ctx).prioritized).toBe(false);
  });

  it('a weak match goes to manual review, not to the priority list', async () => {
    const merged = mergeFacts(listing, await run([{ url: 'https://beautyhub.example/glow', title: 'Glow Salon' }]));
    const v = classifyWebsiteStatus({ ...merged, domainReachable: true });
    expect(v.status).toBe('needs_manual_verification');
    expect(scoreLead(biz, v, ctx).prioritized).toBe(false);
  });
});

describe('search providers', () => {
  const fake = (body: unknown, status = 200) => {
    const calls: { url: string; init?: RequestInit }[] = [];
    const impl = (async (url: string, init?: RequestInit) => { calls.push({ url, init }); return { ok: status < 300, status, json: async () => body }; }) as unknown as typeof fetch;
    return { impl, calls };
  };

  it('Brave: key in a header only, results mapped', async () => {
    const f = fake({ web: { results: [{ url: 'https://a.example', title: 'A' }, { title: 'no url' }] } });
    expect(await braveProvider('SECRET', f.impl).search('glow salon')).toEqual([{ url: 'https://a.example', title: 'A' }]);
    expect(f.calls[0]!.url).toBe('https://api.search.brave.com/res/v1/web/search?count=10&q=glow%20salon');
    expect(f.calls[0]!.url).not.toContain('SECRET');
  });

  it('Serper: Ghana results, key in a header only', async () => {
    const f = fake({ organic: [{ link: 'https://b.example', title: 'B' }] });
    expect(await serperProvider('SECRET', f.impl).search('q')).toEqual([{ url: 'https://b.example', title: 'B' }]);
    expect(JSON.parse(String(f.calls[0]!.init!.body))).toEqual({ q: 'q', gl: 'gh', num: 10 });
    expect(String(f.calls[0]!.init!.body)).not.toContain('SECRET');
  });

  it('reports errors without the key, and picks a provider from the environment', async () => {
    await expect(braveProvider('SECRET', fake({}, 401).impl).search('q')).rejects.toThrow('Brave search returned HTTP 401.');
    expect(providerFromEnv({})).toBeNull();
    expect(providerFromEnv({ BRAVE_SEARCH_API_KEY: 'x' })!.name).toBe('Brave');
    expect(providerFromEnv({ SERPER_API_KEY: 'x' })!.name).toBe('Serper');
  });
});
