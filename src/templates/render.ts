import { captionFor, folderFor } from '../images/library';
import type { ListItem, Section, SiteSpec, VerifiedPrice } from './site-spec';

/**
 * Renders a SiteSpec to one self-contained HTML page.
 *
 * Safety:
 * - Every piece of business text is HTML-escaped. Scraped text is untrusted.
 * - noindex stops search engines presenting the demo as an official site.
 * - No external scripts, fonts or images are loaded.
 * - The unofficial notice appears on every page.
 */

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderList(items: ListItem[]): string {
  return items
    .map((i) => `<li><span class="item-title">${escapeHtml(i.title)}</span>${i.detail ? ` <span class="item-detail">${escapeHtml(i.detail)}</span>` : ''}</li>`)
    .join('');
}

function renderPricing(items: VerifiedPrice[]): string {
  return items
    .map((p) => `<tr><td>${escapeHtml(p.name)}</td><td>${escapeHtml(p.price)}</td></tr>`)
    .join('');
}

function renderSection(s: Section): string {
  switch (s.kind) {
    case 'hero':
      return `<section class="hero"><p class="eyebrow">${escapeHtml(s.subheadline)}</p><h1>${escapeHtml(s.headline)}</h1><a class="cta" href="#contact">${escapeHtml(s.ctaLabel)}</a></section>`;
    case 'about':
      return `<section id="about"><h2>${escapeHtml(s.heading)}</h2><p class="${s.isPlaceholder ? 'placeholder' : ''}">${escapeHtml(s.body)}</p></section>`;
    case 'list':
      return `<section><h2>${escapeHtml(s.heading)}</h2><ul class="cards">${renderList(s.items)}</ul><p class="note">${escapeHtml(s.note)}</p></section>`;
    case 'pricing':
      return `<section><h2>${escapeHtml(s.heading)}</h2><table class="prices"><tbody>${renderPricing(s.items)}</tbody></table></section>`;
    case 'gallery': {
      const figures = s.images
        .map(
          (img) =>
            `<figure class="photo"><img src="${folderFor(img)}/${escapeHtml(img.file)}" alt="${escapeHtml(img.alt)}" loading="lazy"><figcaption>${escapeHtml(captionFor(img))}</figcaption></figure>`,
        )
        .join('');
      const empty = Math.max(0, s.slots - s.images.length);
      const slots = Array.from({ length: empty }, (_, i) => `<div class="slot" aria-label="Photo placeholder ${i + 1}"></div>`).join('');
      const note = s.images.length > 0 ? '' : `<p class="note">${escapeHtml(s.note)}</p>`;
      return `<section><h2>${escapeHtml(s.heading)}</h2><div class="gallery">${figures}${slots}</div>${note}</section>`;
    }
    case 'location':
      return `<section><h2>${escapeHtml(s.heading)}</h2><p>${
        s.address ? escapeHtml(s.address) : '<span class="placeholder">[Address to be confirmed]</span>'
      }</p></section>`;
    case 'enquiry': {
      const href = s.whatsappUrl ? escapeHtml(s.whatsappUrl) : '#contact';
      return `<section class="enquiry"><h2>${escapeHtml(s.heading)}</h2><p>${escapeHtml(s.body)}</p><a class="cta" href="${href}">${escapeHtml(s.ctaLabel)}</a></section>`;
    }
    case 'contact': {
      const lines = [
        s.phone ? `<li>Phone: ${escapeHtml(s.phone)}</li>` : '',
        s.email ? `<li>Email: ${escapeHtml(s.email)}</li>` : '',
        s.address ? `<li>Address: ${escapeHtml(s.address)}</li>` : '',
      ].join('');
      const body = lines || '<li class="placeholder">[Contact details to be confirmed]</li>';
      return `<section id="contact"><h2>${escapeHtml(s.heading)}</h2><ul class="contact">${body}</ul></section>`;
    }
  }
}

const STYLE = `
:root{--purple:#2C1250;--orange:#FD6F00;--orange2:#FD853A;--ink:#1d1526;--paper:#fbf9f7}
*{box-sizing:border-box}body{margin:0;font-family:Poppins,system-ui,sans-serif;color:var(--ink);background:var(--paper);line-height:1.6}
.notice{background:var(--purple);color:#fff;text-align:center;font-size:.85rem;padding:.5rem 1rem}
.hero{background:var(--purple);color:#fff;padding:5rem 1.5rem;text-align:center;max-width:none}
.hero h1{font-size:clamp(2rem,5vw,3.25rem);margin:.25rem 0 1.25rem}
.eyebrow{text-transform:uppercase;letter-spacing:.12em;font-size:.8rem;color:var(--orange2);margin:0}
section{max-width:960px;margin:0 auto;padding:3rem 1.5rem}
h2{color:var(--purple);font-size:1.6rem;margin-bottom:.75rem}
.cta{display:inline-block;background:var(--orange);color:#fff;text-decoration:none;padding:.75rem 1.5rem;border-radius:999px;font-weight:600}
.cards{list-style:none;padding:0;display:grid;gap:.75rem;grid-template-columns:repeat(auto-fit,minmax(200px,1fr))}
.cards li{background:#fff;border-left:4px solid var(--orange);padding:1rem;border-radius:8px}
.item-detail{color:#6b6373;font-size:.9rem}
.gallery{display:grid;gap:.75rem;grid-template-columns:repeat(auto-fit,minmax(150px,1fr))}
.photo{margin:0}.photo img{width:100%;aspect-ratio:4/3;object-fit:cover;border-radius:10px;display:block}.photo figcaption{font-size:.75rem;color:#6b6373;margin-top:.25rem}
.slot{aspect-ratio:4/3;background:linear-gradient(135deg,#e9e1f3,#f7d9c2);border-radius:10px}
.prices{width:100%;border-collapse:collapse}.prices td{padding:.6rem;border-bottom:1px solid #e6e0ea}
.placeholder{color:#8a6d00;font-style:italic}
.note{color:#6b6373;font-size:.85rem}
.contact{list-style:none;padding:0}
footer{text-align:center;color:#6b6373;font-size:.8rem;padding:2rem}
`;

export function renderSiteHtml(spec: SiteSpec): string {
  const title = `${spec.businessName} | Demo concept`;
  const body = spec.sections.map(renderSection).join('\n');
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>${escapeHtml(title)}</title>
<meta name="description" content="${escapeHtml(`Demonstration website concept for ${spec.businessName}, ${spec.city}.`)}">
<style>${STYLE}</style>
</head>
<body>
<div class="notice" role="note">${escapeHtml(spec.notice)}</div>
${body}
<footer>${escapeHtml(spec.notice)}</footer>
</body>
</html>
`;
}
