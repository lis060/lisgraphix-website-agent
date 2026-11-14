import { describe, expect, it } from 'vitest';
import { scoreLead } from '../src/scoring/score';
import type { BusinessCandidate, VerificationResult } from '../src/domain/types';

const NOW = '2026-11-14T09:30:00Z';

const strongCandidate: BusinessCandidate = {
  name: 'Example Beauty Studio',
  category: 'Beauty salon',
  city: 'Accra',
  address: '12 Osu Oxford Street',
  phone: '024 123 4567',
  email: 'hello@example.gh',
  description: 'Hair, nails and bridal styling in central Accra for over a decade.',
  socialUrls: ['https://instagram.com/example'],
  operational: true,
  sourceUrls: ['https://maps.example/123'],
  discoveredAt: '2026-11-10T00:00:00Z',
};

const noWebsite: VerificationResult = {
  status: 'no_official_website_identified',
  confidence: 0.85,
  evidence: [],
  notes: [],
};

const ctx = { websiteFit: 15, nowIso: NOW, minOpportunityScore: 60 };

describe('scoreLead', () => {
  it('scores a strong no-website lead high and prioritizes it', () => {
    const s = scoreLead(strongCandidate, noWebsite, ctx);
    expect(s.total).toBeGreaterThanOrEqual(80);
    expect(s.total).toBeLessThanOrEqual(100);
    expect(s.prioritized).toBe(true);
    expect(s.websiteRecommendation).toMatch(/appointment/i);
  });

  it('explains each factor with points and a reason', () => {
    const s = scoreLead(strongCandidate, noWebsite, ctx);
    expect(s.factors.length).toBe(7);
    const sum = s.factors.reduce((acc, f) => acc + f.points, 0);
    expect(sum).toBe(s.total);
    for (const f of s.factors) {
      expect(f.reason.length).toBeGreaterThan(0);
      expect(f.points).toBeLessThanOrEqual(f.maxPoints);
    }
  });

  it('does not prioritize a lead that already has a working website', () => {
    const exists: VerificationResult = { status: 'website_exists', confidence: 0.9, evidence: [], notes: [] };
    const s = scoreLead(strongCandidate, exists, ctx);
    expect(s.prioritized).toBe(false);
    expect(s.decisionReason).toMatch(/website_exists/);
  });

  it('does not prioritize when confidence in the website gap is too low', () => {
    const weak: VerificationResult = { ...noWebsite, confidence: 0.5 };
    expect(scoreLead(strongCandidate, weak, ctx).prioritized).toBe(false);
  });

  it('does not prioritize a business that appears closed', () => {
    const closed = { ...strongCandidate, operational: false };
    const s = scoreLead(closed, noWebsite, ctx);
    expect(s.prioritized).toBe(false);
    expect(s.total).toBeLessThanOrEqual(100);
  });

  it('does not prioritize when the score is below the minimum', () => {
    const sparse: BusinessCandidate = {
      name: 'Sparse Shop',
      category: 'Other',
      city: 'Tema',
      socialUrls: [],
      operational: null,
      sourceUrls: [],
      discoveredAt: '2025-01-01T00:00:00Z',
    };
    const s = scoreLead(sparse, { ...noWebsite, confidence: 0.6 }, { ...ctx, websiteFit: 6 });
    expect(s.prioritized).toBe(false);
    expect(s.decisionReason).toMatch(/below the minimum/);
  });
});
