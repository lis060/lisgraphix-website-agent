import type { TemplateId } from '../templates/site-spec';

/**
 * Your own image library.
 *
 * Images live in assets/library/<template>/ and are listed in
 * assets/library/manifest.json. Only images listed in the manifest with a
 * valid relative path can appear on a demo. Every image is shown with a
 * caption saying it is illustrative, not the business's own photo.
 */

export interface LibraryImage {
  /** Path relative to assets/library, for example "salon/chairs-01.jpg". */
  file: string;
  template: TemplateId;
  /** Describes the image for screen readers. Required. */
  alt: string;
  /** Who owns or licensed it. "own" = your photo, "ai_generated" = made by the image generator. Manifest files must be "own". */
  /** "own" = your photo. "ai_generated" = created by the image generator. */
  license: 'own' | 'ai_generated';
}

export interface ManifestResult {
  images: LibraryImage[];
  problems: string[];
}

const SAFE_PATH = /^[a-z0-9][a-z0-9_-]*\/[a-z0-9][a-z0-9_.-]*\.(jpg|jpeg|png|webp)$/;
const TEMPLATES: TemplateId[] = ['restaurant', 'salon', 'boutique', 'guesthouse', 'generic'];

export const IMAGE_CAPTION = 'Illustrative image, not the business’s own photo.';
export const AI_IMAGE_CAPTION = 'AI-generated illustration, not the business’s own photo.';

export function captionFor(image: Pick<LibraryImage, 'license'>): string {
  return image.license === 'ai_generated' ? AI_IMAGE_CAPTION : IMAGE_CAPTION;
}

/** Folder (under assets/) an image is served from. */
export function folderFor(image: Pick<LibraryImage, 'license'>): string {
  return image.license === 'ai_generated' ? 'generated' : 'library';
}

/** Validates a parsed manifest. Invalid entries are skipped and reported. */
export function validateManifest(raw: unknown): ManifestResult {
  const problems: string[] = [];
  if (!Array.isArray(raw)) {
    return { images: [], problems: ['Manifest must be a JSON array.'] };
  }
  const images: LibraryImage[] = [];
  const seen = new Set<string>();

  raw.forEach((item, i) => {
    const r = (item ?? {}) as Record<string, unknown>;
    const file = typeof r.file === 'string' ? r.file : '';
    const alt = typeof r.alt === 'string' ? r.alt.trim() : '';
    const template = r.template as TemplateId;

    if (!SAFE_PATH.test(file)) return void problems.push(`#${i}: unsafe or invalid file path.`);
    if (!TEMPLATES.includes(template)) return void problems.push(`#${i}: unknown template.`);
    if (!file.startsWith(`${template}/`)) return void problems.push(`#${i}: file is not in the ${template} folder.`);
    if (!alt) return void problems.push(`#${i}: alt text is required.`);
    if (r.license !== 'own') return void problems.push(`#${i}: license must be "own".`);
    if (seen.has(file)) return void problems.push(`#${i}: duplicate file.`);

    seen.add(file);
    images.push({ file, template, alt: alt.slice(0, 200), license: 'own' });
  });

  return { images, problems };
}

function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * Picks up to `count` images for a template. The choice is stable for a given
 * business, so rebuilding a demo does not change its pictures, but different
 * businesses get different selections.
 */
export function pickImages(
  library: LibraryImage[],
  template: TemplateId,
  count: number,
  seed: string,
): LibraryImage[] {
  const pool = library.filter((i) => i.template === template);
  if (pool.length === 0 || count <= 0) return [];
  const start = hash(seed) % pool.length;
  const picked: LibraryImage[] = [];
  for (let n = 0; n < Math.min(count, pool.length); n++) {
    const item = pool[(start + n) % pool.length];
    if (item) picked.push(item);
  }
  return picked;
}
