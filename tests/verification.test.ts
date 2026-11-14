import { describe, expect, it } from 'vitest';
import { classifyWebsiteStatus } from '../src/verification/website-status';
import type { VerificationInput } from '../src/domain/types';

const base: VerificationInput = {
  listingChecked: true,
  searchChecked: true,
  searchDomains: [],
  socialChecked: true,
  socialLinkedDomains: [],
  domainBelongsToBusiness: null,
  domainReachable: null,
  evidence: [],
};

describe('classifyWebsiteStatus', () => {
  it('reports an existing website when it belongs to the business and responds', () => {
    const r = classifyWebsiteStatus({
      ...base,
      listingWebsiteUrl: 'https://example-salon.com',
      domainBelongsToBusiness: true,
      domainReachable: true,
    });
    expect(r.status).toBe('website_exists');
    expect(r.websiteUrl).toBe('https://example-salon.com');
  });

  it('flags a listed website that does not respond as broken or outdated', () => {
    const r = classifyWebsiteStatus({
      ...base,
      listingWebsiteUrl: 'https://old-site.example',
      domainBelongsToBusiness: true,
      domainReachable: false,
    });
    expect(r.status).toBe('website_broken_or_outdated');
  });

  it('does not treat a domain belonging to someone else as the business website', () => {
    const r = classifyWebsiteStatus({
      ...base,
      searchDomains: ['other-company.com'],
      domainBelongsToBusiness: false,
      domainReachable: true,
    });
    expect(r.status).toBe('needs_manual_verification');
  });

  it('reports social media only when profiles exist and no website was found', () => {
    const r = classifyWebsiteStatus({
      ...base,
      evidence: [{ kind: 'social_link', detail: 'Instagram profile', observedAt: '2026-11-01T00:00:00Z' }],
    });
    expect(r.status).toBe('social_media_only');
  });

  it('identifies no website with capped confidence after several checks', () => {
    const r = classifyWebsiteStatus(base);
    expect(r.status).toBe('no_official_website_identified');
    expect(r.confidence).toBeLessThanOrEqual(0.85);
    expect(r.notes.join(' ')).toMatch(/not proof/);
  });

  it('is uncertain when only one check ran', () => {
    const r = classifyWebsiteStatus({ ...base, searchChecked: false, socialChecked: false });
    expect(r.status).toBe('uncertain');
    expect(r.confidence).toBeLessThanOrEqual(0.4);
  });

  it('is uncertain when no checks ran at all', () => {
    const r = classifyWebsiteStatus({
      ...base,
      listingChecked: false,
      searchChecked: false,
      socialChecked: false,
    });
    expect(r.status).toBe('uncertain');
  });

  it('keeps the evidence it was given', () => {
    const evidence = [
      { kind: 'search_result' as const, detail: 'No match', sourceUrl: 'https://search.example', observedAt: '2026-11-01T00:00:00Z' },
    ];
    expect(classifyWebsiteStatus({ ...base, evidence }).evidence).toEqual(evidence);
  });
});
