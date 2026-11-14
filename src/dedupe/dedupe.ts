import type { BusinessCandidate } from '../domain/types';

const LEGAL_SUFFIXES = /\b(ltd|limited|enterprise|enterprises|company|co|gh|ghana|llc|inc)\b/g;

/** Lowercase, strip punctuation and legal suffixes, collapse spaces. */
export function normalizeBusinessName(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(LEGAL_SUFFIXES, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Ghanaian numbers appear as 0XX..., +233XX... or 233XX... .
 * Comparing the last 9 digits matches all of these forms.
 */
export function normalizePhone(phone: string | undefined): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 9) return null;
  return digits.slice(-9);
}

export function nameCityKey(candidate: Pick<BusinessCandidate, 'name' | 'city'>): string {
  return `${normalizeBusinessName(candidate.name)}|${candidate.city.trim().toLowerCase()}`;
}

/**
 * A candidate is a duplicate when it matches an existing one by the same
 * normalized name in the same city, or by the same phone number.
 * A shared phone alone is not enough when the names are clearly different
 * (many businesses share a landline at a mall or hub), so phone-only matches
 * are flagged for manual review instead of silently dropped.
 */
export type DuplicateCheck =
  | { kind: 'new' }
  | { kind: 'duplicate'; matchedName: string; reason: 'name_and_city' }
  | { kind: 'review'; matchedName: string; reason: 'phone_only' };

export function checkDuplicate(
  candidate: BusinessCandidate,
  existing: BusinessCandidate[],
): DuplicateCheck {
  const key = nameCityKey(candidate);
  const phone = normalizePhone(candidate.phone);

  let phoneMatch: BusinessCandidate | undefined;
  for (const other of existing) {
    if (nameCityKey(other) === key) {
      return { kind: 'duplicate', matchedName: other.name, reason: 'name_and_city' };
    }
    if (phone && normalizePhone(other.phone) === phone) {
      phoneMatch ??= other;
    }
  }
  if (phoneMatch) {
    return { kind: 'review', matchedName: phoneMatch.name, reason: 'phone_only' };
  }
  return { kind: 'new' };
}

/** Removes duplicates within a batch, keeping the first occurrence. */
export function dedupeBatch(candidates: BusinessCandidate[]): {
  kept: BusinessCandidate[];
  dropped: { name: string; matchedName: string }[];
  flagged: { name: string; matchedName: string }[];
} {
  const kept: BusinessCandidate[] = [];
  const dropped: { name: string; matchedName: string }[] = [];
  const flagged: { name: string; matchedName: string }[] = [];

  for (const candidate of candidates) {
    const check = checkDuplicate(candidate, kept);
    if (check.kind === 'duplicate') {
      dropped.push({ name: candidate.name, matchedName: check.matchedName });
    } else {
      if (check.kind === 'review') {
        flagged.push({ name: candidate.name, matchedName: check.matchedName });
      }
      kept.push(candidate);
    }
  }
  return { kept, dropped, flagged };
}
