import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../src/config/config';
import { buildQueries, createPlacesSource, FIELD_MASK, isSocialUrl } from '../src/discovery/google-places';
import { checkReachable, isPublicHttpUrl } from '../src/verification/reachability';
import { classifyWebsiteStatus } from '../src/verification/website-status';

const NOW = '2026-11-14T09:30:00Z';
const q = { category: 'Beauty salon', city: 'Accra', textQuery: 'Beauty salon in Accra, Ghana' };
const res = (status: number, body: unknown = {}) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
const noSleep = async () => {};

function fakeFetch(responses: Array<ReturnType<typeof res> | Error>) {
  const calls: { url: string; init: RequestInit }[] = [];
  const impl = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    const next = responses.shift();
    if (next instanceof Error) throw next;
    return next;
  }) as unknown as typeof fetch;
  return { impl, calls };
}

describe('buildQueries', () => {
  it('stays within the daily cap and rotates so every combination gets a turn', () => {
    const day0 = buildQueries(DEFAULT_SETTINGS, 0);
    expect(day0).toHaveLength(10);
    expect(day0[0]!.textQuery).toBe('Restaurant in Accra, Ghana');
    const seen = new Set<string>();
    for (let d = 0; d < 3; d++) buildQueries(DEFAULT_SETTINGS, d).forEach((x) => seen.add(x.textQuery));
    expect(seen.size).toBe(27);
  });

  it('skips disabled categories and returns nothing when the cap is zero', () => {
    const s = { ...DEFAULT_SETTINGS, categories: DEFAULT_SETTINGS.categories.map((c) => ({ ...c, enabled: c.name === 'Furniture' })) };
    expect(buildQueries(s, 0).map((x) => x.category)).toEqual(['Furniture', 'Furniture', 'Furniture']);
    expect(buildQueries({ ...DEFAULT_SETTINGS, maxPlacesCallsPerDay: 0 }, 0)).toEqual([]);
  });
});

describe('createPlacesSource', () => {
  const places = [
    { id: 'p1', displayName: { text: 'Glow Salon' }, formattedAddress: 'Osu, Accra', businessStatus: 'OPERATIONAL',
      googleMapsUri: 'https://maps.google.com/?cid=1', internationalPhoneNumber: '+233 24 123 4567' },
    { id: 'p2', displayName: { text: 'Site Salon' }, websiteUri: 'https://sitesalon.example', businessStatus: 'CLOSED_TEMPORARILY' },
    { id: 'p3', displayName: { text: 'Insta Salon' }, websiteUri: 'https://www.instagram.com/instasalon' },
    { id: 'p4', displayName: { text: '  ' } },
    { id: 'p5', displayName: { text: 'Bad Link Salon' }, websiteUri: 'javascript:alert(1)' },
  ];

  it('sends the key only in a header, with the cost-limited field mask', async () => {
    const f = fakeFetch([res(200, { places })]);
    await createPlacesSource({ apiKey: 'SECRET', budget: { remaining: 5 }, nowIso: NOW, fetchImpl: f.impl }).search(q);
    const { url, init } = f.calls[0]!;
    expect(url).toBe('https://places.googleapis.com/v1/places:searchText');
    expect(url).not.toContain('SECRET');
    expect(String(init.body)).not.toContain('SECRET');
    expect((init.headers as Record<string, string>)['X-Goog-FieldMask']).toBe(FIELD_MASK);
    expect(FIELD_MASK).not.toMatch(/review|rating|photo|editorialSummary/i);
  });

  it('maps places without inventing details', async () => {
    const f = fakeFetch([res(200, { places })]);
    const out = await createPlacesSource({ apiKey: 'k', budget: { remaining: 5 }, nowIso: NOW, fetchImpl: f.impl }).search(q);
    expect(out.map((d) => d.candidate.name)).toEqual(['Glow Salon', 'Site Salon', 'Insta Salon', 'Bad Link Salon']);
    const glow = out[0]!.candidate;
    expect(glow).toMatchObject({ externalId: 'p1', category: 'Beauty salon', city: 'Accra', operational: true, phone: '+233 24 123 4567' });
    expect(glow.description).toBeUndefined();
    expect(glow.email).toBeUndefined();
    expect(glow.sourceUrls).toEqual(['https://maps.google.com/?cid=1']);
    expect(out[1]!.candidate.operational).toBe(false);
    expect(out[3]!.candidate.websiteUrl).toBeUndefined();
  });

  it('treats a social media link as social, not as a website', async () => {
    const f = fakeFetch([res(200, { places })]);
    const out = await createPlacesSource({ apiKey: 'k', budget: { remaining: 5 }, nowIso: NOW, fetchImpl: f.impl }).search(q);
    const insta = out[2]!;
    expect(insta.candidate.websiteUrl).toBeUndefined();
    expect(insta.candidate.socialUrls).toEqual(['https://www.instagram.com/instasalon']);
    expect(isSocialUrl('https://facebook.com/x')).toBe(true);
    expect(isSocialUrl('https://notfacebook.com.example')).toBe(false);
  });

  it('never calls a listing with no website a confirmed gap on its own', async () => {
    const f = fakeFetch([res(200, { places })]);
    const out = await createPlacesSource({ apiKey: 'k', budget: { remaining: 5 }, nowIso: NOW, fetchImpl: f.impl }).search(q);
    const status = classifyWebsiteStatus(out[0]!.listingFacts);
    expect(status.status).toBe('uncertain');
    expect(status.evidence[0]!.detail).toMatch(/no website/);
  });

  it('retries on 429 and server errors with backoff, counting each call', async () => {
    const waits: number[] = [];
    const f = fakeFetch([res(429), new Error('net'), res(200, { places: [] })]);
    const budget = { remaining: 5 };
    const src = createPlacesSource({ apiKey: 'k', budget, nowIso: NOW, fetchImpl: f.impl, sleep: async (ms) => { waits.push(ms); } });
    expect(await src.search(q)).toEqual([]);
    expect(waits).toEqual([500, 1000]);
    expect(src.callsMade()).toBe(3);
    expect(budget.remaining).toBe(2);
  });

  it('does not retry a bad-key error and never leaks the key', async () => {
    const f = fakeFetch([res(403)]);
    const src = createPlacesSource({ apiKey: 'SECRET', budget: { remaining: 5 }, nowIso: NOW, fetchImpl: f.impl, sleep: noSleep });
    const err = await src.search(q).catch((e: Error) => e);
    expect((err as Error).message).toBe('Google Places returned HTTP 403 for "Beauty salon in Accra, Ghana".');
    expect(f.calls).toHaveLength(1);
  });

  it('stops when the daily budget is used up', async () => {
    const f = fakeFetch([]);
    const src = createPlacesSource({ apiKey: 'k', budget: { remaining: 0 }, nowIso: NOW, fetchImpl: f.impl });
    await expect(src.search(q)).rejects.toThrow(/budget used up/);
    expect(f.calls).toHaveLength(0);
  });
});

describe('reachability', () => {
  it('refuses private, local and non-web addresses without fetching', async () => {
    let fetched = 0;
    const impl = (async () => { fetched++; return res(200); }) as unknown as typeof fetch;
    for (const u of ['http://localhost:3000', 'http://127.0.0.1', 'http://192.168.1.1/admin', 'http://169.254.169.254/latest', 'ftp://x.example', 'https://user:pw@x.example', 'http://intranet', 'http://[::1]/']) {
      expect(isPublicHttpUrl(u)).toBe(false);
      expect((await checkReachable(u, { fetchImpl: impl })).reachable).toBe(false);
    }
    expect(fetched).toBe(0);
  });

  it('reports reachable sites, error statuses and no response', async () => {
    const ok = (async () => res(200)) as unknown as typeof fetch;
    const gone = (async () => res(404)) as unknown as typeof fetch;
    const dead = (async () => { throw new Error('x'); }) as unknown as typeof fetch;
    expect(await checkReachable('https://shop.example', { fetchImpl: ok })).toEqual({ reachable: true, status: 200 });
    expect((await checkReachable('https://shop.example', { fetchImpl: gone })).reason).toBe('HTTP 404');
    expect((await checkReachable('https://shop.example', { fetchImpl: dead })).reason).toBe('No response.');
  });
});
