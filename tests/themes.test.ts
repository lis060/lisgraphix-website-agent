import { describe, expect, it } from 'vitest';
import { PALETTES, themeLayout, themeVars } from '../src/templates/themes';
import { renderSiteHtml } from '../src/templates/render';
import { buildSiteSpec, type TemplateId } from '../src/templates/site-spec';

const IDS: TemplateId[] = ['restaurant', 'salon', 'boutique', 'guesthouse', 'generic'];

function lum(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const lin = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
}
function contrast(a: string, b: string): number {
  const la = lum(a);
  const lb = lum(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}
/** First colour stop of a hero background, e.g. linear-gradient(135deg,#7a1f1a,#a3321f). */
const heroColours = (bg: string) => bg.match(/#[0-9a-fA-F]{6}/g) ?? [];

describe('themes', () => {
  it('gives every template its own palette', () => {
    const heroes = new Set(IDS.map((id) => PALETTES[id].hero));
    expect(heroes.size).toBe(IDS.length);
  });

  it('keeps text readable (WCAG AA 4.5:1) on every hero, button and page', () => {
    for (const id of IDS) {
      const p = PALETTES[id];
      for (const c of heroColours(p.hero)) {
        expect(contrast(p.onHero, c), `${id} hero text`).toBeGreaterThanOrEqual(4.5);
        expect(contrast(p.eyebrow, c), `${id} eyebrow`).toBeGreaterThanOrEqual(4.5);
      }
      expect(contrast(p.onAccent, p.accent), `${id} button`).toBeGreaterThanOrEqual(4.5);
      expect(contrast(p.ink, p.paper), `${id} body`).toBeGreaterThanOrEqual(4.5);
      expect(contrast(p.heading, p.paper), `${id} headings`).toBeGreaterThanOrEqual(4.5);
      expect(contrast(p.muted, p.paper), `${id} muted`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('uses no external resources, scripts or imports', () => {
    for (const id of IDS) {
      const css = themeVars(id) + themeLayout(id);
      expect(css).not.toMatch(/url\(|@import|<script|https?:/i);
    }
  });

  it('keeps the Lisgraphix notice bar purple on every themed page', () => {
    for (const id of IDS) {
      const category = { restaurant: 'restaurants', salon: 'salons', boutique: 'boutiques', guesthouse: 'guesthouses', generic: 'cleaning' }[id];
      const html = renderSiteHtml(buildSiteSpec({ name: 'Test', category, city: 'Accra', externalId: 'x', source: 'manual' } as never));
      expect(html).toContain('.notice{background:#2C1250');
      expect(html).toContain(`--hero:${PALETTES[id].hero}`);
    }
  });
});
