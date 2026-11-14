import { readFileSync, readdirSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { beforeAll, describe, expect, it } from 'vitest';
import { DAILY_CAP, fieldMaskFor, mapPlace, parseRequest, placeUrl, usageServiceFor } from '../supabase/functions/place-details/logic.ts';

const ID = '11111111-1111-4111-8111-111111111111';
const ID2 = '22222222-2222-4222-8222-222222222222';

describe('place-details request checks', () => {
  it('accepts a list of business ids and removes repeats', () => {
    expect(parseRequest({ ids: [ID, ID2, ID] })).toEqual({ ok: true, ids: [ID, ID2], detail: false });
    expect(parseRequest({ ids: [ID], detail: true })).toMatchObject({ ok: true, detail: true });
  });

  it('rejects anything else, including raw Google place ids and oversized lists', () => {
    for (const bad of [null, 'x', {}, { ids: [] }, { ids: 'x' }, { ids: ['ChIJabc123'] }, { ids: [ID, 5] },
      { ids: Array.from({ length: 26 }, () => ID) }]) {
      expect(parseRequest(bad).ok).toBe(false);
    }
  });

  it('asks Google for the name only unless full details are requested', () => {
    expect(fieldMaskFor(false)).toBe('displayName');
    expect(fieldMaskFor(true)).toContain('internationalPhoneNumber');
    expect(usageServiceFor(false).cap).toBe(DAILY_CAP.names);
    expect(usageServiceFor(true).cap).toBe(DAILY_CAP.details);
    expect(usageServiceFor(true).service).not.toBe(usageServiceFor(false).service);
  });

  it('keeps plain text only from Google\'s reply', () => {
    expect(mapPlace({ displayName: { text: '  Glow\n Salon ' }, formattedAddress: 'Osu' }, false)).toEqual({ name: 'Glow Salon' });
    expect(mapPlace({ displayName: { text: 'G' }, formattedAddress: 'Osu, Accra', internationalPhoneNumber: '+233 24 123 4567',
      googleMapsUri: 'https://maps.google.com/?cid=1' }, true))
      .toEqual({ name: 'G', address: 'Osu, Accra', phone: '+233 24 123 4567', mapsUrl: 'https://maps.google.com/?cid=1' });
    expect(mapPlace({ displayName: { text: 5 }, googleMapsUri: 'javascript:alert(1)' }, true)).toEqual({ name: null, address: undefined, phone: undefined });
    expect(mapPlace(null, false)).toEqual({ name: null });
    expect(mapPlace({ displayName: { text: 'x'.repeat(500) } }, false).name).toHaveLength(120);
  });

  it('encodes the place id into the Google URL', () => {
    expect(placeUrl('ChIJ/../x?y')).toBe('https://places.googleapis.com/v1/places/ChIJ%2F..%2Fx%3Fy');
  });
});

describe('daily usage cap in the database', () => {
  let db: PGlite;
  const bump = async (service: string, calls: number, cap: number) =>
    (await db.query<{ ok: boolean }>('select bump_api_usage($1, $2, $3) as ok', [service, calls, cap])).rows[0]!.ok;

  beforeAll(async () => {
    db = new PGlite();
    await db.exec(`create role authenticated nologin; create role anon nologin; create role service_role nologin; create schema auth;
      create function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;`);
    for (const f of readdirSync('supabase/migrations').sort()) await db.exec(readFileSync(`supabase/migrations/${f}`, 'utf8'));
  });

  it('allows calls up to the cap and refuses the one that would pass it', async () => {
    expect(await bump('names', 20, 50)).toBe(true);
    expect(await bump('names', 25, 50)).toBe(true);
    expect(await bump('names', 10, 50)).toBe(false);
    expect(await bump('names', 5, 50)).toBe(true);
    expect(await bump('names', 1, 50)).toBe(false);
    const total = (await db.query<{ calls: number }>(`select calls from api_usage_daily where service = 'names'`)).rows[0]!.calls;
    expect(total).toBe(50);
  });

  it('counts each service separately and refuses a batch larger than the cap', async () => {
    expect(await bump('details', 3, 30)).toBe(true);
    expect(await bump('big', 31, 30)).toBe(false);
    expect(await bump('big', 0, 30)).toBe(true);
  });

  it('cannot be called by dashboard users or visitors', async () => {
    for (const role of ['authenticated', 'anon']) {
      await db.exec(`set role ${role}`);
      await expect(db.query(`select bump_api_usage('x', 1, 10)`)).rejects.toThrow(/permission denied/);
      await db.exec('reset role');
    }
  });
});
