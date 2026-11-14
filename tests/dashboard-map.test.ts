import { describe, expect, it } from 'vitest';
import { mapLead, mapSettings, type BusinessRow } from '../dashboard/src/mapLead';

const row: BusinessRow = {
  id: 'b1', name: 'Sample Salon', category: 'Beauty salon', city: 'Accra',
  phone: '024', email: null, discovered_at: '2026-11-14T09:30:00Z', client_status: 'Qualified',
  website_verifications: [
    { status: 'uncertain', confidence: '0.40', verified_at: '2026-11-01T00:00:00Z' },
    { status: 'no_official_website_identified', confidence: '0.85', verified_at: '2026-11-14T00:00:00Z' },
  ],
  lead_scores: [{ total: 70, scored_at: '2026-11-01T00:00:00Z' }, { total: 91, scored_at: '2026-11-14T00:00:00Z' }],
  generated_demos: [],
};
const demo = (dep: BusinessRow['generated_demos'][0]['deployments'][0]) =>
  mapLead({ ...row, generated_demos: [{ status: 'built', created_at: '2026-11-14T00:00:00Z', deployments: [dep] }] });

describe('mapLead', () => {
  it('uses the latest verification and score', () => {
    const l = mapLead(row);
    expect(l).toMatchObject({ websiteStatus: 'No official website identified', confidence: 85, score: 91, contact: 'Phone', demo: 'None', stage: 'Qualified', discovered: '2026-11-14' });
  });

  it('shows blanks, not invented numbers, when nothing is verified or scored', () => {
    const l = mapLead({ ...row, website_verifications: [], lead_scores: [], phone: null });
    expect(l).toMatchObject({ websiteStatus: 'Not verified yet', confidence: null, score: null, contact: 'None' });
  });

  it('only exposes a demo link for a ready, reachable https deployment', () => {
    const base = { created_at: '2026-11-14T00:00:00Z' };
    expect(demo({ ...base, status: 'ready', deployment_url: 'https://x.vercel.app', url_reachable: true }).demoUrl).toBe('https://x.vercel.app');
    expect(demo({ ...base, status: 'pending', deployment_url: 'https://x.vercel.app', url_reachable: null }).demoUrl).toBeUndefined();
    expect(demo({ ...base, status: 'ready', deployment_url: 'https://x.vercel.app', url_reachable: false }).demoUrl).toBeUndefined();
    expect(demo({ ...base, status: 'ready', deployment_url: 'javascript:alert(1)', url_reachable: true }).demoUrl).toBeUndefined();
  });
});

describe('mapSettings', () => {
  it('reads settings and shows the schedule as switched off', () => {
    const s = mapSettings(
      [{ key: 'cities', value: ['Accra', 'Tema'] }, { key: 'daily_demo_limit', value: 2 }, { key: 'image_source', value: 'generated' }, { key: 'max_generated_images_per_day', value: 8 }],
      [{ cron: '30 9 * * *', timezone: 'Africa/Accra', enabled: false }], [],
    );
    expect(s.cities).toEqual(['Accra', 'Tema']);
    expect(s.schedule).toBe('30 9 * * * (Africa/Accra), switched off');
    expect(s.imageSource).toBe('AI-generated (daily cap 8)');
    expect(s.minScore).toBe('Not set');
  });
});
