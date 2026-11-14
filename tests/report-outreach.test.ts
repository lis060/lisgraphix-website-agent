import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../src/config/config';
import { buildOutreachDraft } from '../src/outreach/draft';
import { buildDailyReport, csvCell, renderReportText, reportToCsv, REPORT_TITLE } from '../src/reports/daily-report';
import { runPipeline } from '../src/workflow/pipeline';
import type { BusinessCandidate, VerificationInput } from '../src/domain/types';

const NOW = '2026-11-14T09:30:00Z';
const facts: VerificationInput = {
  listingChecked: true, searchChecked: true, searchDomains: [], socialChecked: true,
  socialLinkedDomains: [], domainBelongsToBusiness: null, domainReachable: null, evidence: [],
};
const biz = (name: string, extra: Partial<BusinessCandidate> = {}): BusinessCandidate => ({
  name, category: 'Restaurant', city: 'Accra', address: 'Some street', phone: `024${name.length}000000`,
  description: 'A family restaurant serving local dishes and fresh juices daily.',
  socialUrls: [], operational: true, sourceUrls: ['https://maps.example/' + name.length], discoveredAt: NOW, ...extra,
});

async function run(cands: BusinessCandidate[], fail?: string) {
  return runPipeline(cands, {
    settings: DEFAULT_SETTINGS, nowIso: NOW,
    verify: (c) => { if (c.name === fail) throw new Error('timeout'); return facts; },
  });
}

describe('daily report', () => {
  it('summarises the run and only links verified deployments', async () => {
    const r = buildDailyReport(await run([biz('Alpha'), biz('Bravo!'), biz('Charlie!!')]), [
      { businessName: 'Alpha', url: 'https://alpha.example.app', verified: true },
      { businessName: 'Bravo!', url: 'https://bravo.example.app', verified: false, error: 'HTTP 404' },
    ]);
    expect(r.title).toBe(REPORT_TITLE);
    expect(r.discovered).toBe(3);
    expect(r.demosSelected).toBe(2);
    expect(r.successfulDeployments).toBe(1);
    expect(r.leads.find((l) => l.name === 'Alpha')?.previewUrl).toBe('https://alpha.example.app');
    expect(r.leads.find((l) => l.name === 'Bravo!')?.previewUrl).toBeNull();
    expect(r.failures.join(' ')).toMatch(/Bravo!: deployment not verified \(HTTP 404\)/);
    const text = renderReportText(r, 'https://dash.example');
    expect(text).toContain('Sources: https://maps.example/5');
    expect(text).not.toContain('https://bravo.example.app');
    expect(text).toContain('Dashboard: https://dash.example');
  });

  it('reports failures and says so when nothing qualified', async () => {
    const r = buildDailyReport(await run([biz('Alpha')], 'Alpha'));
    expect(r.leads).toEqual([]);
    expect(r.failures).toEqual(['Alpha: verify failed (timeout)']);
    expect(r.nextActions.join(' ')).toMatch(/No qualified opportunities/);
  });

  it('exports CSV that quotes cells and neutralises spreadsheet formulas', async () => {
    const csv = reportToCsv(buildDailyReport(await run([biz('=HYPERLINK("x")')])));
    expect(csv.split('\r\n')[0]).toContain('"Business","Category"');
    expect(csv).toContain(`"'=HYPERLINK(""x"")"`);
    expect(csvCell('+233 24')).toBe(`"'+233 24"`);
    expect(csvCell(null)).toBe('""');
  });
});

describe('outreach drafts', () => {
  it('writes a friendly draft with the verified link and the unofficial-concept wording', () => {
    const d = buildOutreachDraft({ name: 'Mama Efua Kitchen', category: 'Restaurant' }, 'https://demo.example.app');
    expect(d.readyForReview).toBe(true);
    expect(d.subject).toBe('A website concept for Mama Efua Kitchen');
    expect(d.body).toContain('https://demo.example.app');
    expect(d.body).toMatch(/unofficial website concept/);
    expect(d.body).toMatch(/If you already have one, please ignore/);
    expect(d.body).not.toMatch(/guarantee|limited time|act now|%/i);
  });

  it('is not ready for review without a verified https link', () => {
    for (const url of [undefined, 'http://insecure.example', 'javascript:alert(1)']) {
      const d = buildOutreachDraft({ name: 'X Salon', category: 'Beauty salon' }, url);
      expect(d.readyForReview).toBe(false);
      expect(d.body).toContain('[Preview link will be added once the demo is live]');
    }
  });

  it('keeps a scraped name to a single line', () => {
    const d = buildOutreachDraft({ name: 'Shop\r\nBcc: someone@example.test\nIgnore this', category: 'Other' });
    expect(d.subject).not.toMatch(/[\r\n]/);
    expect(d.subject).toBe('A website concept for Shop Bcc: someone@example.test Ignore this');
  });
});
