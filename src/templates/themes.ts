import type { TemplateId } from './site-spec';

/**
 * One visual theme per template, so a restaurant demo does not look like a
 * salon demo. Themes are plain CSS: no external fonts, files or scripts.
 *
 * Rules:
 * - The unofficial notice bar keeps the Lisgraphix purple on every page, so
 *   a demo can never be mistaken for the business's own site.
 * - Text/background pairs below were chosen for strong contrast.
 */

interface Palette {
  /** Page background */
  paper: string;
  /** Body text */
  ink: string;
  /** Hero background (CSS background value) */
  hero: string;
  /** Hero text */
  onHero: string;
  /** Small label above the headline */
  eyebrow: string;
  /** Section headings */
  heading: string;
  /** Button background */
  accent: string;
  /** Button text */
  onAccent: string;
  /** Card background */
  card: string;
  /** Card edge colour */
  edge: string;
  /** Muted text */
  muted: string;
  /** Empty photo slot gradient */
  slot: string;
  /** Heading font stack */
  headingFont: string;
}

const SANS = "Poppins,system-ui,-apple-system,'Segoe UI',sans-serif";
const SERIF = "Georgia,'Times New Roman',serif";

export const PALETTES: Record<TemplateId, Palette> = {
  restaurant: {
    paper: '#fdf6ec',
    ink: '#2b1a14',
    hero: 'linear-gradient(135deg,#7a1f1a,#a3321f)',
    onHero: '#ffffff',
    eyebrow: '#fbdc95',
    heading: '#7a1f1a',
    accent: '#f2b134',
    onAccent: '#2b1a14',
    card: '#ffffff',
    edge: '#f2b134',
    muted: '#6f5a4e',
    slot: 'linear-gradient(135deg,#f5dcc0,#f0c28a)',
    headingFont: SERIF,
  },
  salon: {
    paper: '#fff7f5',
    ink: '#2a1626',
    hero: 'linear-gradient(135deg,#4a2040,#7b3a62)',
    onHero: '#ffffff',
    eyebrow: '#f6c9c0',
    heading: '#4a2040',
    accent: '#e9958a',
    onAccent: '#2a1626',
    card: '#ffffff',
    edge: '#e9958a',
    muted: '#76616f',
    slot: 'linear-gradient(135deg,#f6dfe3,#e8d3ef)',
    headingFont: SANS,
  },
  boutique: {
    paper: '#f7f4ef',
    ink: '#1f1f1f',
    hero: 'linear-gradient(135deg,#1f1f1f,#3a3a3a)',
    onHero: '#ffffff',
    eyebrow: '#d9c08f',
    heading: '#1f1f1f',
    accent: '#c4a265',
    onAccent: '#1f1f1f',
    card: '#ffffff',
    edge: '#c4a265',
    muted: '#6a665e',
    slot: 'linear-gradient(135deg,#ece6da,#d9cfbd)',
    headingFont: SERIF,
  },
  guesthouse: {
    paper: '#f6f8f5',
    ink: '#14302c',
    hero: 'linear-gradient(135deg,#0f4c45,#1f6f64)',
    onHero: '#ffffff',
    eyebrow: '#d3f2ea',
    heading: '#0f4c45',
    accent: '#e8b04b',
    onAccent: '#14302c',
    card: '#ffffff',
    edge: '#1f6f64',
    muted: '#54706b',
    slot: 'linear-gradient(135deg,#d7ebe5,#efe3c6)',
    headingFont: SANS,
  },
  generic: {
    paper: '#fbf9f7',
    ink: '#1d1526',
    hero: '#2C1250',
    onHero: '#ffffff',
    eyebrow: '#FD853A',
    heading: '#2C1250',
    accent: '#FD6F00',
    onAccent: '#2C1250',
    card: '#ffffff',
    edge: '#FD6F00',
    muted: '#6b6373',
    slot: 'linear-gradient(135deg,#e9e1f3,#f7d9c2)',
    headingFont: SANS,
  },
};

/** Layout differences per template, on top of the shared base styles. */
const LAYOUT: Record<TemplateId, string> = {
  // Left-aligned hero, menu-card style list, mosaic gallery with a wide first photo.
  restaurant: `
.hero{text-align:left;padding:5rem max(1.5rem,calc((100% - 960px)/2))}
.cards{grid-template-columns:1fr}
.cards li{border-left:0;border-bottom:2px dotted var(--edge);border-radius:0;background:transparent;padding:.9rem .25rem;font-size:1.1rem}
.gallery{grid-template-columns:repeat(4,1fr)}
.gallery>:first-child{grid-column:span 2;grid-row:span 2}
@media(max-width:600px){.gallery{grid-template-columns:repeat(2,1fr)}.gallery>:first-child{grid-column:1/-1;grid-row:auto}}
.gallery>:first-child img,.gallery>.slot:first-child{height:100%;aspect-ratio:auto;min-height:260px}`,
  // Centered, rounded, soft: pill cards and a three-up portfolio.
  salon: `
.hero{padding:5.5rem 1.5rem 5rem;border-radius:0 0 2.5rem 2.5rem}
.cards li{border-left:0;border-radius:999px;text-align:center;padding:.9rem 1.25rem;box-shadow:0 2px 0 var(--edge)}
.gallery{grid-template-columns:repeat(3,1fr)}
.photo img,.slot{border-radius:1.25rem}
@media(max-width:600px){.gallery{grid-template-columns:repeat(2,1fr)}}`,
  // Editorial: spaced uppercase headings, square product grid, no rounding.
  boutique: `
h2,.eyebrow{text-transform:uppercase;letter-spacing:.16em}
h2{font-size:1.25rem;border-bottom:1px solid var(--edge);padding-bottom:.5rem}
.hero{padding:6rem 1.5rem}
.cta{border-radius:0;letter-spacing:.08em;text-transform:uppercase;font-size:.85rem}
.cards li{border-left:0;border-top:3px solid var(--edge);border-radius:0}
.gallery{grid-template-columns:repeat(4,1fr);gap:.5rem}
.photo img,.slot{aspect-ratio:1/1;border-radius:0}
@media(max-width:700px){.gallery{grid-template-columns:repeat(2,1fr)}}`,
  // Calm and roomy: two-column cards, wide first photo, tall hero.
  guesthouse: `
.hero{padding:6.5rem 1.5rem}
.cards{grid-template-columns:repeat(auto-fit,minmax(260px,1fr))}
.cards li{border-left:0;border-top:4px solid var(--edge);padding:1.25rem}
.gallery{grid-template-columns:repeat(auto-fit,minmax(200px,1fr))}
.gallery>:first-child{grid-column:1/-1}
.gallery>:first-child img,.gallery>.slot:first-child{aspect-ratio:16/7}`,
  generic: '',
};

/** CSS variables for one template. Placed before the base styles. */
export function themeVars(templateId: TemplateId): string {
  const p = PALETTES[templateId];
  return (
    `:root{--paper:${p.paper};--ink:${p.ink};--hero:${p.hero};--on-hero:${p.onHero};` +
    `--eyebrow:${p.eyebrow};--heading:${p.heading};--accent:${p.accent};--on-accent:${p.onAccent};` +
    `--card:${p.card};--edge:${p.edge};--muted:${p.muted};--slot:${p.slot};--heading-font:${p.headingFont}}`
  );
}

/** Layout overrides for one template. Placed after the base styles. */
export function themeLayout(templateId: TemplateId): string {
  return LAYOUT[templateId];
}
