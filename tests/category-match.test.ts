import { describe, expect, it } from 'vitest';
import { matchCategory } from '../src/discovery/category-match';
import { createPlacesSource, dropCategoryMismatches, FIELD_MASK } from '../src/discovery/google-places';

describe('matchCategory', () => {
  it('accepts businesses whose Google type fits the category', () => {
    expect(matchCategory('Furniture', ['furniture_store', 'store', 'point_of_interest'])).toBe('match');
    expect(matchCategory('Restaurant', ['african_restaurant', 'food'], 'african_restaurant')).toBe('match');
    expect(matchCategory('Barbershop', ['hair_care'], 'barber_shop')).toBe('match');
    expect(matchCategory('Guesthouse', ['lodging'], 'guest_house')).toBe('match');
    expect(matchCategory('Fashion boutique', ['clothing_store', 'store'])).toBe('match');
  });

  it('rejects the case from the first live run: a phone shop under Furniture', () => {
    expect(matchCategory('Furniture', ['cell_phone_store', 'electronics_store', 'store'], 'cell_phone_store')).toBe('mismatch');
  });

  it('rejects other clearly different businesses', () => {
    expect(matchCategory('Restaurant', ['bank', 'finance'], 'bank')).toBe('mismatch');
    expect(matchCategory('Beauty salon', ['pharmacy', 'store'])).toBe('mismatch');
    expect(matchCategory('Furniture', ['lodging'], 'hotel')).toBe('mismatch');
    expect(matchCategory('Car rental', ['restaurant'], 'restaurant')).toBe('mismatch');
  });

  it('keeps a business that has both a fitting type and another one', () => {
    expect(matchCategory('Furniture', ['furniture_store', 'electronics_store'], 'furniture_store')).toBe('match');
    expect(matchCategory('Guesthouse', ['lodging', 'restaurant'], 'hotel')).toBe('match');
  });

  it('says unknown, not mismatch, when Google gives only vague labels or none', () => {
    expect(matchCategory('Furniture', ['store', 'point_of_interest', 'establishment'])).toBe('unknown');
    expect(matchCategory('Cleaning service', [])).toBe('unknown');
    expect(matchCategory('A new category', ['some_type'])).toBe('unknown');
  });
});

describe('category check in discovery', () => {
  const NOW = '2026-11-14T09:30:00Z';
  const places = [
    { id: 'p1', displayName: { text: 'Good Furniture Works' }, types: ['furniture_store', 'store'], primaryType: 'furniture_store' },
    { id: 'p2', displayName: { text: 'Phone Brand Store' }, types: ['cell_phone_store', 'electronics_store'], primaryType: 'cell_phone_store' },
    { id: 'p3', displayName: { text: 'Vague Shop' }, types: ['store'] },
    { id: 'p4', displayName: { text: 'No Types Shop' } },
  ];
  it('asks Google for types, drops the mismatch and keeps the rest', async () => {
    expect(FIELD_MASK).toContain('places.types');
    expect(FIELD_MASK).toContain('places.primaryType');
    const fetchImpl = (async () => ({ ok: true, status: 200, json: async () => ({ places }) })) as unknown as typeof fetch;
    const found = await createPlacesSource({ apiKey: 'k', budget: { remaining: 1 }, nowIso: NOW, fetchImpl })
      .search({ category: 'Furniture', city: 'Kumasi', textQuery: 'Furniture in Kumasi, Ghana' });
    expect(found.map((d) => d.categoryMatch)).toEqual(['match', 'mismatch', 'unknown', 'unknown']);
    const { kept, dropped } = dropCategoryMismatches(found);
    expect(dropped).toBe(1);
    expect(kept.map((d) => d.candidate.name)).toEqual(['Good Furniture Works', 'Vague Shop', 'No Types Shop']);
    // Google's type labels are not part of the stored candidate.
    expect(JSON.stringify(kept.map((d) => d.candidate))).not.toContain('furniture_store');
  });
});
