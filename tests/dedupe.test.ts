import { describe, expect, it } from 'vitest';
import { checkDuplicate, dedupeBatch, normalizeBusinessName, normalizePhone } from '../src/dedupe/dedupe';
import type { BusinessCandidate } from '../src/domain/types';

function biz(overrides: Partial<BusinessCandidate>): BusinessCandidate {
  return {
    name: 'Example Salon',
    category: 'Beauty salon',
    city: 'Accra',
    socialUrls: [],
    sourceUrls: [],
    operational: true,
    discoveredAt: '2026-11-01T00:00:00Z',
    ...overrides,
  };
}

describe('normalizeBusinessName', () => {
  it('ignores case, punctuation and legal suffixes', () => {
    expect(normalizeBusinessName('Example Salon Ltd.')).toBe(normalizeBusinessName('example salon'));
    expect(normalizeBusinessName('Ama & Kofi Enterprise')).toBe('ama and kofi');
  });
});

describe('normalizePhone', () => {
  it('matches Ghanaian number formats by their last nine digits', () => {
    expect(normalizePhone('+233 24 123 4567')).toBe(normalizePhone('024 123 4567'));
    expect(normalizePhone('233241234567')).toBe('241234567');
  });

  it('returns null for missing or too-short numbers', () => {
    expect(normalizePhone(undefined)).toBeNull();
    expect(normalizePhone('123')).toBeNull();
  });
});

describe('checkDuplicate', () => {
  it('detects the same name in the same city as a duplicate', () => {
    const existing = [biz({ name: 'Example Salon' })];
    const result = checkDuplicate(biz({ name: 'EXAMPLE SALON LIMITED' }), existing);
    expect(result).toEqual({ kind: 'duplicate', matchedName: 'Example Salon', reason: 'name_and_city' });
  });

  it('treats the same name in a different city as new', () => {
    const existing = [biz({ name: 'Example Salon', city: 'Accra' })];
    expect(checkDuplicate(biz({ name: 'Example Salon', city: 'Kumasi' }), existing).kind).toBe('new');
  });

  it('flags a shared phone number for review instead of dropping it', () => {
    const existing = [biz({ name: 'Hair Hub', phone: '024 111 2222' })];
    const result = checkDuplicate(biz({ name: 'Nail Corner', phone: '+233 24 111 2222' }), existing);
    expect(result.kind).toBe('review');
  });
});

describe('dedupeBatch', () => {
  it('keeps the first occurrence and reports what was dropped or flagged', () => {
    const { kept, dropped, flagged } = dedupeBatch([
      biz({ name: 'Example Salon' }),
      biz({ name: 'Example Salon Ltd' }),
      biz({ name: 'Other Shop', phone: '0241111111' }),
      biz({ name: 'Third Shop', phone: '+2330241111111' }),
    ]);
    expect(kept.map((k) => k.name)).toEqual(['Example Salon', 'Other Shop', 'Third Shop']);
    expect(dropped).toHaveLength(1);
    expect(flagged).toHaveLength(1);
  });
});
