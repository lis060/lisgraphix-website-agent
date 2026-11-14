import type { BusinessCandidate } from '../domain/types';
import { DEFAULT_SETTINGS } from '../config/config';

type Place = {
  id?: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  websiteUri?: string;
  googleMapsUri?: string;
  internationalPhoneNumber?: string;
  businessStatus?: string;
};

export interface DiscoveryResult {
  candidates: BusinessCandidate[];
  warnings: string[];
  requestsAttempted: number;
  quotaExhausted: boolean;
}

function text(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() ? v.trim() : undefined;
}

function dailyRotationIndex(): number {
  // Ghana has UTC+0 year-round.
  const days = Math.floor(Date.now() / 86_400_000);
  return days;
}

function dailyRequestCap(): number {
  const requested = Number(process.env.PLACES_MAX_REQUESTS_PER_RUN ?? '1');
  // Conservative default. Protect against accidental unbounded API usage.
  return Number.isInteger(requested) && requested > 0
    ? Math.min(requested, 3)
    : 1;
}

/**
 * Google Places Text Search (New), with a strict request cap and rotating
 * category/city coverage. Quota exhaustion returns partial findings instead
 * of throwing, so GitHub Actions can still publish a diagnostic report.
 * All results are candidates, NOT verified missing-website prospects.
 */
export async function discoverPlaces(apiKey: string, max = DEFAULT_SETTINGS.dailyDiscoveryLimit): Promise<DiscoveryResult> {
  if (!apiKey) throw new Error('GOOGLE_PLACES_API_KEY missing');
  const candidates: BusinessCandidate[] = [];
  const warnings: string[] = [];
  const seen = new Set<string>();
  const categories = DEFAULT_SETTINGS.categories.filter(c => c.enabled);
  const targets = DEFAULT_SETTINGS.cities.flatMap(city =>
    categories.map(category => ({ city, category: category.name }))
  );
  if (!targets.length) return { candidates, warnings: ['No enabled city/category targets.'], requestsAttempted: 0, quotaExhausted: false };

  const offset = dailyRotationIndex() % targets.length;
  const rotated = [...targets.slice(offset), ...targets.slice(0, offset)];
  let requestsAttempted = 0;
  let quotaExhausted = false;
  for (const { city, category } of rotated.slice(0, dailyRequestCap())) {
    if (candidates.length >= max) break;
    requestsAttempted++;
    let response: Response;
    try {
      response = await fetch('https://places.googleapis.com/v1/places:searchText', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': apiKey,
          'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.websiteUri,places.googleMapsUri,places.internationalPhoneNumber,places.businessStatus',
        },
        body: JSON.stringify({
          textQuery: category + ' in ' + city + ', Ghana',
          maxResultCount: Math.min(20, max - candidates.length),
        }),
        signal: AbortSignal.timeout(15000),
      });
    } catch (error) {
      warnings.push('Google Places network error: ' + (error instanceof Error ? error.message : String(error)));
      break;
    }
    if (response.status === 429) {
      quotaExhausted = true;
      warnings.push('Google Places daily Text Search quota exhausted (HTTP 429). Check billing/quota. No automatic retry was made.');
      break;
    }
    if (!response.ok) {
      const errorText = await response.text();
      warnings.push('Google Places HTTP ' + response.status + ': ' + errorText.slice(0, 300));
      // Fail fast on bad credentials, billing, or permission errors. Don't retry.
      break;
    }
    const payload = (await response.json()) as { places?: Place[] };
    for (const place of payload.places ?? []) {
      const name = text(place.displayName?.text);
      if (!name) continue;
      const key = place.id ?? (name.toLowerCase() + '|' + city.toLowerCase());
      if (seen.has(key)) continue;
      seen.add(key);
      const mapsUrl = text(place.googleMapsUri);
      candidates.push({
        name, city, category,
        address: text(place.formattedAddress),
        phone: text(place.internationalPhoneNumber),
        websiteUrl: text(place.websiteUri),
        mapsUrl,
        socialUrls: [],
        sourceUrls: mapsUrl ? [mapsUrl] : [],
        operational: place.businessStatus === 'OPERATIONAL' ? true : null,
        discoveredAt: new Date().toISOString(),
      });
      if (candidates.length >= max) break;
    }
  }
  return { candidates, warnings, requestsAttempted, quotaExhausted };
}
