/**
 * Pure helpers for the place-details function. No network or Deno APIs here,
 * so this file can be unit-tested.
 *
 * The function fetches a business's name (and, on request, address and phone)
 * fresh from Google by place ID each time. Nothing it returns is stored.
 */

export const MAX_IDS_PER_REQUEST = 25;
/** Daily caps on Google Place Details calls. Names are the cheaper kind. */
export const DAILY_CAP = { names: 300, details: 30 } as const;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type ParsedRequest =
  | { ok: true; ids: string[]; detail: boolean }
  | { ok: false; error: string };

export function parseRequest(body: unknown): ParsedRequest {
  if (typeof body !== 'object' || body === null) return { ok: false, error: 'Body must be a JSON object.' };
  const b = body as Record<string, unknown>;
  if (!Array.isArray(b.ids) || b.ids.length === 0) return { ok: false, error: 'ids must be a non-empty list.' };
  if (b.ids.length > MAX_IDS_PER_REQUEST) return { ok: false, error: `At most ${MAX_IDS_PER_REQUEST} ids per request.` };
  if (!b.ids.every((i) => typeof i === 'string' && UUID.test(i))) return { ok: false, error: 'Each id must be a business id.' };
  return { ok: true, ids: [...new Set(b.ids as string[])], detail: b.detail === true };
}

/** Names only keeps each call in Google's cheaper price group. */
export function fieldMaskFor(detail: boolean): string {
  return detail ? 'displayName,formattedAddress,internationalPhoneNumber,googleMapsUri' : 'displayName';
}

export function usageServiceFor(detail: boolean): { service: string; cap: number } {
  return detail
    ? { service: 'google_place_details_full', cap: DAILY_CAP.details }
    : { service: 'google_place_details_names', cap: DAILY_CAP.names };
}

export interface PlaceView { name: string | null; address?: string; phone?: string; mapsUrl?: string }

function text(value: unknown, max: number): string | undefined {
  if (typeof value !== 'string') return undefined;
  const cleaned = value.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
  return cleaned ? cleaned.slice(0, max) : undefined;
}

/** Google's reply is untrusted: keep plain text only, capped in length. */
export function mapPlace(json: unknown, detail: boolean): PlaceView {
  const j = (typeof json === 'object' && json !== null ? json : {}) as Record<string, unknown>;
  const display = (typeof j.displayName === 'object' && j.displayName !== null ? j.displayName : {}) as Record<string, unknown>;
  const view: PlaceView = { name: text(display.text, 120) ?? null };
  if (detail) {
    view.address = text(j.formattedAddress, 200);
    view.phone = text(j.internationalPhoneNumber, 30);
    const maps = text(j.googleMapsUri, 300);
    if (maps && /^https:\/\/(maps\.google\.com|www\.google\.com\/maps)/.test(maps)) view.mapsUrl = maps;
  }
  return view;
}

export function placeUrl(placeId: string): string {
  return `https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`;
}
