import type { SearchProvider, SearchResult } from './web-search';

/**
 * Adapters for web search services. Neither has been run against the live
 * service yet. The API key is only sent in a request header.
 */

type Fetch = typeof fetch;

function clean(items: { url?: unknown; title?: unknown }[]): SearchResult[] {
  return items
    .filter((i): i is { url: string; title?: unknown } => typeof i.url === 'string')
    .map((i) => ({ url: i.url, title: typeof i.title === 'string' ? i.title.slice(0, 300) : '' }));
}

/** Brave Search API (Brave's own index). */
export function braveProvider(apiKey: string, fetchImpl: Fetch = fetch): SearchProvider {
  return {
    name: 'Brave',
    async search(query) {
      const url = `https://api.search.brave.com/res/v1/web/search?count=10&q=${encodeURIComponent(query)}`;
      const res = await fetchImpl(url, { headers: { Accept: 'application/json', 'X-Subscription-Token': apiKey } });
      if (!res.ok) throw new Error(`Brave search returned HTTP ${res.status}.`);
      const json = (await res.json()) as { web?: { results?: { url?: unknown; title?: unknown }[] } };
      return clean(json.web?.results ?? []);
    },
  };
}

/** Serper.dev (Google results through a third-party service). */
export function serperProvider(apiKey: string, fetchImpl: Fetch = fetch): SearchProvider {
  return {
    name: 'Serper',
    async search(query) {
      const res = await fetchImpl('https://google.serper.dev/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-API-KEY': apiKey },
        body: JSON.stringify({ q: query, gl: 'gh', num: 10 }),
      });
      if (!res.ok) throw new Error(`Serper search returned HTTP ${res.status}.`);
      const json = (await res.json()) as { organic?: { link?: unknown; title?: unknown }[] };
      return clean((json.organic ?? []).map((o) => ({ url: o.link, title: o.title })));
    },
  };
}

/** Picks a provider from the environment. Returns null when none is configured. */
export function providerFromEnv(env: Record<string, string | undefined>, fetchImpl: Fetch = fetch): SearchProvider | null {
  if (env.BRAVE_SEARCH_API_KEY) return braveProvider(env.BRAVE_SEARCH_API_KEY, fetchImpl);
  if (env.SERPER_API_KEY) return serperProvider(env.SERPER_API_KEY, fetchImpl);
  return null;
}
