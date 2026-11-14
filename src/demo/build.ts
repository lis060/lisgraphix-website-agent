import type { BusinessCandidate } from '../domain/types';
import type { LibraryImage } from '../images/library';
import { renderSiteHtml } from '../templates/render';
import { buildSiteSpec, UNOFFICIAL_NOTICE, type SiteSpec, type VerifiedPrice } from '../templates/site-spec';

/**
 * Builds one demo website and checks it before it can be published.
 * A demo that fails any required check must not be deployed.
 */

export interface QualityCheck { name: string; passed: boolean; detail: string }

export interface DemoBuild {
  spec: SiteSpec;
  html: string;
  checks: QualityCheck[];
  /** True only when every check passed. */
  ok: boolean;
  /** How many sections still hold placeholder text or empty photo slots. */
  placeholders: number;
}

const MAX_BYTES = 200_000;
const ALLOWED_LINK = /^(#|https:\/\/wa\.me\/233\d{9}$)/;

export function checkDemoHtml(html: string, businessName: string): QualityCheck[] {
  const count = (re: RegExp) => (html.match(re) ?? []).length;
  const hrefs = [...html.matchAll(/\shref="([^"]*)"/g)].map((m) => m[1]!);
  const srcs = [...html.matchAll(/\ssrc="([^"]*)"/g)].map((m) => m[1]!);
  const badLinks = hrefs.filter((h) => !ALLOWED_LINK.test(h));
  const badSrcs = srcs.filter((s) => !/^(library|generated)\/[a-z0-9/_.-]+$/.test(s));
  const bytes = Buffer.byteLength(html, 'utf8');
  const escapedName = businessName.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

  const check = (name: string, passed: boolean, detail: string): QualityCheck => ({ name, passed, detail });
  return [
    check('Unofficial notice', count(new RegExp(UNOFFICIAL_NOTICE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) >= 2,
      'The unofficial-concept notice appears at the top and bottom.'),
    check('Hidden from search engines', /<meta name="robots" content="noindex, nofollow">/.test(html),
      'The page tells search engines not to list it.'),
    check('No scripts', !/<script|\son[a-z]+\s*=|javascript:/i.test(html), 'The page contains no scripts or script links.'),
    check('No outside files', badSrcs.length === 0 && !/<link\b|<iframe\b|@import|url\(/i.test(html),
      badSrcs.length ? `Unexpected image source: ${badSrcs[0]}` : 'Images come only from our own folders.'),
    check('Safe links only', badLinks.length === 0,
      badLinks.length ? `Unexpected link: ${badLinks[0]}` : 'Links go only to page sections or a Ghana WhatsApp number.'),
    check('One main heading', count(/<h1[\s>]/g) === 1 && html.includes(`<h1>${escapedName}</h1>`),
      'The business name is the single main heading.'),
    check('Mobile ready', /<meta name="viewport" content="width=device-width, initial-scale=1">/.test(html) && /<html lang="en">/.test(html),
      'The page declares its language and scales to phone screens.'),
    check('Images described', count(/<img\b/g) === count(/<img\b[^>]*\salt="[^"]+"/g), 'Every image has a text description.'),
    check('No invented reviews or prices', !/testimonial|★|\brated\b|\breviews?\b/i.test(html), 'No reviews, ratings or testimonials appear.'),
    check('Small and fast', bytes <= MAX_BYTES, `Page size is ${Math.round(bytes / 1024)} KB (limit ${MAX_BYTES / 1000} KB).`),
  ];
}

export function buildDemo(
  candidate: BusinessCandidate,
  opts: { library?: LibraryImage[]; verifiedPrices?: VerifiedPrice[] } = {},
): DemoBuild {
  const spec = buildSiteSpec(candidate, opts);
  const html = renderSiteHtml(spec);
  const checks = checkDemoHtml(html, candidate.name);
  const placeholders = (html.match(/class="placeholder"|class="slot"/g) ?? []).length;
  return { spec, html, checks, ok: checks.every((c) => c.passed), placeholders };
}
