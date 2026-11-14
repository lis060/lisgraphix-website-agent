import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../src/config/config';
import { validateCandidates } from '../src/discovery/manual-import';
import { runPipeline } from '../src/workflow/pipeline';
import type { BusinessCandidate, VerificationInput } from '../src/domain/types';

const NOW = '2026-11-14T09:30:00Z';

function candidate(i: number, overrides: Partial<BusinessCandidate> = {}): BusinessCandidate {
  return {
    name: `Business ${i}`,
    category: 'Restaurant',
    city: 'Accra',
    address: 'Some street, Accra',
    phone: `024${String(i).padStart(7, '0')}`,
    description: 'A family restaurant serving local dishes and fresh juices daily.',
    socialUrls: [],
    operational: true,
    sourceUrls: [],
    discoveredAt: '2026-11-12T00:00:00Z',
    ...overrides,
  };
}

// Verification facts that look like "no website after three checks".
const noWebsiteFacts: VerificationInput = {
  listingChecked: true,
  searchChecked: true,
  searchDomains: [],
  socialChecked: true,
  socialLinkedDomains: [],
  domainBelongsToBusiness: null,
  domainReachable: null,
  evidence: [],
};

describe('runPipeline', () => {
  it('prioritizes clear no-website leads and respects the shortlist and demo limits', async () => {
    const many = Array.from({ length: 12 }, (_, i) => candidate(i + 1));
    const report = await runPipeline(many, {
      settings: DEFAULT_SETTINGS,
      nowIso: NOW,
      verify: () => noWebsiteFacts,
    });
    expect(report.qualifiedOpportunities).toBeGreaterThan(0);
    expect(report.shortlisted.length).toBeLessThanOrEqual(DEFAULT_SETTINGS.shortlistLimit);
    expect(report.demoSelections.length).toBeLessThanOrEqual(DEFAULT_SETTINGS.dailyDemoLimit);
  });

  it('applies the daily discovery limit', async () => {
    const settings = { ...DEFAULT_SETTINGS, dailyDiscoveryLimit: 3 };
    const many = Array.from({ length: 10 }, (_, i) => candidate(i + 1));
    const report = await runPipeline(many, { settings, nowIso: NOW, verify: () => noWebsiteFacts });
    expect(report.verified).toBe(3);
    expect(report.skippedOverDiscoveryLimit).toBe(7);
  });

  it('skips businesses in disabled categories or unconfigured cities', async () => {
    const batch = [
      candidate(1),
      candidate(2, { category: 'Unknown category' }),
      candidate(3, { city: 'Takoradi' }),
    ];
    const report = await runPipeline(batch, {
      settings: DEFAULT_SETTINGS,
      nowIso: NOW,
      verify: () => noWebsiteFacts,
    });
    expect(report.skippedDisabledCategoryOrCity).toBe(2);
    expect(report.verified).toBe(1);
  });

  it('records verification failures without stopping the run', async () => {
    const batch = [candidate(1), candidate(2)];
    const report = await runPipeline(batch, {
      settings: DEFAULT_SETTINGS,
      nowIso: NOW,
      verify: (c) => {
        if (c.name === 'Business 1') throw new Error('listing timed out');
        return noWebsiteFacts;
      },
    });
    expect(report.failures).toEqual([{ name: 'Business 1', step: 'verify', message: 'listing timed out' }]);
    expect(report.verified).toBe(1);
  });

  it('does not invent demo selections when no lead qualifies', async () => {
    const report = await runPipeline([candidate(1)], {
      settings: DEFAULT_SETTINGS,
      nowIso: NOW,
      verify: () => ({ ...noWebsiteFacts, listingWebsiteUrl: 'https://real-site.example', domainBelongsToBusiness: true, domainReachable: true }),
    });
    expect(report.demoSelections).toEqual([]);
  });
});

describe('validateCandidates', () => {
  it('accepts valid records and rejects incomplete ones', () => {
    const { valid, rejected } = validateCandidates(
      [
        { name: ' Good Salon ', category: 'Beauty salon', city: 'Kumasi', websiteUrl: 'javascript:alert(1)' },
        { name: 'No City', category: 'Restaurant' },
        'not an object',
      ],
      NOW,
    );
    expect(valid).toHaveLength(1);
    expect(valid[0]?.name).toBe('Good Salon');
    expect(valid[0]?.websiteUrl).toBeUndefined();
    expect(rejected.map((r) => r.index)).toEqual([1, 2]);
  });

  it('does not invent missing details', () => {
    const { valid } = validateCandidates([{ name: 'Plain', category: 'Cleaning service', city: 'Tema' }], NOW);
    expect(valid[0]?.phone).toBeUndefined();
    expect(valid[0]?.email).toBeUndefined();
    expect(valid[0]?.operational).toBeNull();
  });

  it('rejects input that is not an array', () => {
    expect(validateCandidates({ name: 'x' }, NOW).rejected[0]?.reason).toMatch(/array/);
  });
});
