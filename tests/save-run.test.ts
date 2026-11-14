import { readFileSync, readdirSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../src/config/config';
import { createPlacesSource } from '../src/discovery/google-places';
import { RunInProgressError, saveRun, startExecution } from '../src/storage/save-run';
import { runPipeline, type PipelineReport } from '../src/workflow/pipeline';
import { mapLead } from '../dashboard/src/mapLead';
import type { BusinessCandidate } from '../src/domain/types';

const NOW = '2026-11-14T09:30:00Z';
const STUB = `create role authenticated nologin; create role anon nologin; create role service_role nologin; create schema auth;
  create function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;`;
const MIGRATIONS = readdirSync('supabase/migrations').sort().map((f) => readFileSync(`supabase/migrations/${f}`, 'utf8'));

let db: PGlite;
beforeEach(async () => {
  db = new PGlite();
  await db.exec(STUB);
  for (const m of MIGRATIONS) await db.exec(m);
});

const places = [
  { id: 'place-A', displayName: { text: 'Glow Salon' }, formattedAddress: '12 Osu Street, Accra', businessStatus: 'OPERATIONAL',
    googleMapsUri: 'https://maps.google.com/?cid=1', internationalPhoneNumber: '+233 24 123 4567' },
  { id: 'place-B', displayName: { text: 'Site Salon' }, websiteUri: 'https://sitesalon.example', businessStatus: 'OPERATIONAL' },
];

async function googleRun(failName?: string): Promise<PipelineReport> {
  const fetchImpl = (async () => ({ ok: true, status: 200, json: async () => ({ places }) })) as unknown as typeof fetch;
  const found = await createPlacesSource({ apiKey: 'k', budget: { remaining: 5 }, nowIso: NOW, fetchImpl })
    .search({ category: 'Beauty salon', city: 'Accra', textQuery: 'Beauty salon in Accra, Ghana' });
  const facts = new Map(found.map((d) => [d.candidate.name, d.listingFacts]));
  return runPipeline(found.map((d) => d.candidate), {
    settings: DEFAULT_SETTINGS, nowIso: NOW,
    verify: (c) => { if (c.name === failName) throw new Error('timeout'); return { ...facts.get(c.name)!, domainReachable: true }; },
  });
}

describe('saving a Google run (place ID only)', () => {
  it('stores the place ID and our results, and none of Google\'s content', async () => {
    const id = await startExecution(db, 'manual');
    const result = await saveRun(db, id, await googleRun(), { apiUsage: { googlePlacesCalls: 1 } });
    expect(result).toEqual({ status: 'succeeded', businessesSaved: 2 });

    const rows = (await db.query<Record<string, unknown>>(`select * from businesses order by external_id`)).rows;
    expect(rows.map((r) => r.external_id)).toEqual(['place-A', 'place-B']);
    for (const r of rows) {
      expect(r).toMatchObject({ source: 'google_places', category: 'Beauty salon', city: 'Accra', name: null, address: null, phone: null, website_url: null, maps_url: null, operational: null });
    }
    const dump = JSON.stringify([
      rows,
      (await db.query('select * from website_verifications')).rows,
      (await db.query('select * from lead_scores')).rows,
      (await db.query('select * from daily_reports')).rows,
      (await db.query('select * from automation_executions')).rows,
    ]);
    for (const secret of ['Glow Salon', 'Site Salon', 'Osu Street', '123 4567', 'sitesalon.example', 'maps.google.com']) {
      expect(dump).not.toContain(secret);
    }
    const v = (await db.query<{ status: string }>(`select v.status from website_verifications v join businesses b on b.id = v.business_id order by b.external_id`)).rows;
    expect(v.map((x) => x.status)).toEqual(['uncertain', 'website_exists']);
  });

  it('is refused by the database if code ever tries to store a Google name', async () => {
    await expect(db.query(
      `insert into businesses (source, external_id, name, normalized_name, category, city) values ('google_places','p','Glow Salon','glow salon','Beauty salon','Accra')`,
    )).rejects.toThrow(/businesses_source_rules/);
    await expect(db.query(
      `insert into businesses (source, category, city) values ('google_places','Beauty salon','Accra')`,
    )).rejects.toThrow(/businesses_source_rules/);
  });

  it('does not duplicate a place on a second run, and keeps the history', async () => {
    await saveRun(db, await startExecution(db, 'manual'), await googleRun());
    await saveRun(db, await startExecution(db, 'schedule'), await googleRun());
    const n = async (t: string) => ((await db.query<{ n: number }>(`select count(*)::int as n from ${t}`)).rows[0]!.n);
    expect(await n('businesses')).toBe(2);
    expect(await n('website_verifications')).toBe(4);
    expect(await n('daily_reports')).toBe(2);
  });

  it('marks the run partial when something failed, and records usage', async () => {
    const id = await startExecution(db, 'manual');
    const result = await saveRun(db, id, await googleRun('Glow Salon'), { apiUsage: { googlePlacesCalls: 3 } });
    expect(result.status).toBe('partial');
    const e = (await db.query<{ status: string; api_usage: { googlePlacesCalls: number }; finished_at: string | null }>(`select * from automation_executions`)).rows[0]!;
    expect(e.status).toBe('partial');
    expect(e.api_usage.googlePlacesCalls).toBe(3);
    expect(e.finished_at).not.toBeNull();
  });
});

describe('run locking', () => {
  it('refuses a second run while one is in progress', async () => {
    await startExecution(db, 'manual');
    await expect(startExecution(db, 'schedule')).rejects.toBeInstanceOf(RunInProgressError);
  });

  it('closes a crashed run after two hours so the next one can start', async () => {
    await startExecution(db, 'manual');
    await db.query(`update automation_executions set started_at = now() - interval '3 hours'`);
    await startExecution(db, 'schedule');
    const s = (await db.query<{ status: string }>(`select status from automation_executions order by started_at`)).rows.map((r) => r.status);
    expect(s).toEqual(['failed', 'running']);
  });

  it('rolls back and marks the run failed if saving breaks', async () => {
    const id = await startExecution(db, 'manual');
    const run = await googleRun();
    run.ranked[1]!.score.total = 500; // violates the 0-100 rule
    await expect(saveRun(db, id, run)).rejects.toThrow();
    expect((await db.query('select 1 from businesses')).rows).toEqual([]);
    expect((await db.query<{ status: string }>('select status from automation_executions')).rows[0]!.status).toBe('failed');
  });
});

describe('manual records and dashboard view', () => {
  it('still saves manually entered businesses with their details', async () => {
    const c: BusinessCandidate = {
      name: 'Mama Efua Kitchen', category: 'Restaurant', city: 'Kumasi', phone: '024 111 2222',
      socialUrls: [], operational: true, sourceUrls: [], discoveredAt: NOW,
    };
    const run = await runPipeline([c], { settings: DEFAULT_SETTINGS, nowIso: NOW, verify: () => ({
      listingChecked: true, searchChecked: true, searchDomains: [], socialChecked: true, socialLinkedDomains: [],
      domainBelongsToBusiness: null, domainReachable: null, evidence: [] }) });
    await saveRun(db, await startExecution(db, 'manual'), run);
    const r = (await db.query<Record<string, unknown>>('select * from businesses')).rows[0]!;
    expect(r).toMatchObject({ source: 'manual', name: 'Mama Efua Kitchen', phone_key: '241112222' });
  });

  it('shows a Google lead as a Maps link built from the place ID', () => {
    const lead = mapLead({
      id: 'b1', name: null, source: 'google_places', external_id: 'place-A', category: 'Beauty salon', city: 'Accra',
      phone: null, email: null, discovered_at: NOW, client_status: 'New Lead',
      website_verifications: [], lead_scores: [], generated_demos: [],
    });
    expect(lead.name).toBe('Google listing');
    expect(lead.mapsUrl).toBe('https://www.google.com/maps/search/?api=1&query=Beauty%20salon%20Accra&query_place_id=place-A');
  });
});
