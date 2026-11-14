import type { BusinessCandidate } from '../domain/types';

/**
 * Validates business records supplied from outside (a JSON file or a future
 * API adapter). Text from listings and websites is untrusted: it is only ever
 * stored as data and never executed or treated as instructions.
 *
 * Missing details stay missing. Nothing is invented here.
 */

export interface RejectedRecord {
  index: number;
  reason: string;
}

export interface ImportResult {
  valid: BusinessCandidate[];
  rejected: RejectedRecord[];
}

const MAX_TEXT = 500;
const MAX_DESCRIPTION = 2000;

function cleanText(value: unknown, max = MAX_TEXT): string | undefined {
  if (typeof value !== 'string') return undefined;
  // Remove control characters, collapse whitespace, cap length.
  const cleaned = value
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned) return undefined;
  return cleaned.slice(0, max);
}

function cleanUrl(value: unknown): string | undefined {
  const text = cleanText(value, 300);
  if (!text) return undefined;
  try {
    const url = new URL(text);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return undefined;
    return url.toString();
  } catch {
    return undefined;
  }
}

function cleanUrlList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map(cleanUrl).filter((u): u is string => !!u);
}

function cleanIso(value: unknown): string | undefined {
  const text = cleanText(value, 40);
  if (!text) return undefined;
  const time = new Date(text).getTime();
  return Number.isNaN(time) ? undefined : new Date(time).toISOString();
}

export function validateCandidates(raw: unknown, importedAtIso: string): ImportResult {
  if (!Array.isArray(raw)) {
    return { valid: [], rejected: [{ index: -1, reason: 'Input must be a JSON array.' }] };
  }

  const valid: BusinessCandidate[] = [];
  const rejected: RejectedRecord[] = [];

  raw.forEach((item, index) => {
    if (typeof item !== 'object' || item === null) {
      rejected.push({ index, reason: 'Record is not an object.' });
      return;
    }
    const r = item as Record<string, unknown>;
    const name = cleanText(r.name);
    const category = cleanText(r.category);
    const city = cleanText(r.city);
    if (!name || !category || !city) {
      rejected.push({ index, reason: 'Missing required name, category or city.' });
      return;
    }

    const operational =
      r.operational === true ? true : r.operational === false ? false : null;

    valid.push({
      externalId: cleanText(r.externalId, 200),
      name,
      category,
      city,
      address: cleanText(r.address),
      phone: cleanText(r.phone, 40),
      email: cleanText(r.email, 200),
      socialUrls: cleanUrlList(r.socialUrls),
      mapsUrl: cleanUrl(r.mapsUrl),
      websiteUrl: cleanUrl(r.websiteUrl),
      description: cleanText(r.description, MAX_DESCRIPTION),
      operational,
      sourceUrls: cleanUrlList(r.sourceUrls),
      discoveredAt: cleanIso(r.discoveredAt) ?? importedAtIso,
      lastVerifiedAt: cleanIso(r.lastVerifiedAt),
    });
  });

  return { valid, rejected };
}
