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

function text(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() ? v.trim() : undefined;
}

/** Use Google's Places API (New) with a restricted key. No data is fabricated. */
export async function discoverPlaces(apiKey: string, max = DEFAULT_SETTINGS.dailyDiscoveryLimit): Promise<BusinessCandidate[]> {
  if (!apiKey) throw new Error('GOOGLE_PLACES_API_KEY missing');
  const results: BusinessCandidate[] = [];
  const seen = new Set<string>();
  const categories = DEFAULT_SETTINGS.categories.filter(c => c.enabled);
  const targets = DEFAULT_SETTINGS.cities.flatMap(city =>
    categories.map(category => ({ city, category: category.name }))
  );
  // Spread requests over cities and categories. Keep the run bounded for API cost control.
  for (const { city, category } of targets) {
    if (results.length >= max) break;
    const response = await fetch('https://places.googleapis.com/v1/places:searchText', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.websiteUri,places.googleMapsUri,places.internationalPhoneNumber,places.businessStatus',
      },
      body: JSON.stringify({
        textQuery: category + ' in ' + city + ', Ghana',
        maxResultCount: Math.min(5, max - results.length),
      }),
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error('Google Places HTTP ' + response.status + ': ' + errorText.slice(0, 300));
    }
    const payload = (await response.json()) as { places?: Place[] };
    for (const place of payload.places ?? []) {
      const name = text(place.displayName?.text);
      if (!name) continue;
      const key = place.id ?? (name.toLowerCase() + '|' + city.toLowerCase());
      if (seen.has(key)) continue;
      seen.add(key);
      const now = new Date().toISOString();
      const mapsUrl = text(place.googleMapsUri);
      results.push({
        name, city, category,
        address: text(place.formattedAddress),
        phone: text(place.internationalPhoneNumber),
        websiteUrl: text(place.websiteUri),
        mapsUrl,
        socialUrls: [],
        sourceUrls: mapsUrl ? [mapsUrl] : [],
        operational: place.businessStatus === 'OPERATIONAL' ? true : null,
        discoveredAt: now,
      });
      if (results.length >= max) break;
    }
  }
  return results;
}
