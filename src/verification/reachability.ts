/**
 * Checks whether a website address answers. Used for step 5 of website
 * verification and, later, for checking deployed demo URLs.
 *
 * Only plain public http(s) addresses are fetched. Addresses pointing at
 * private or local machines are refused, because the URL comes from untrusted
 * listing data.
 */

const PRIVATE_HOST = /^(localhost|.*\.local|.*\.internal|127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|0\.|\[)/i;

export function isPublicHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return false;
    if (url.username || url.password) return false;
    return !PRIVATE_HOST.test(url.hostname) && url.hostname.includes('.');
  } catch {
    return false;
  }
}

export interface ReachabilityResult { reachable: boolean; status?: number; reason?: string }

export async function checkReachable(
  url: string,
  opts: { fetchImpl?: typeof fetch; timeoutMs?: number } = {},
): Promise<ReachabilityResult> {
  if (!isPublicHttpUrl(url)) return { reachable: false, reason: 'Not a public web address.' };
  const doFetch = opts.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 8000);
  try {
    const res = await doFetch(url, { method: 'GET', redirect: 'follow', signal: controller.signal });
    return res.status >= 200 && res.status < 400
      ? { reachable: true, status: res.status }
      : { reachable: false, status: res.status, reason: `HTTP ${res.status}` };
  } catch {
    return { reachable: false, reason: 'No response.' };
  } finally {
    clearTimeout(timer);
  }
}
