import type { TemplateId } from '../templates/site-spec';
import type { LibraryImage } from './library';

/**
 * AI image generation for demo galleries.
 *
 * Safety and cost rules:
 * - Prompts come ONLY from fixed text below. Business names, descriptions and
 *   other scraped text are never put in a prompt (untrusted data, and it would
 *   risk fake depictions of a real business).
 * - Prompts ask for generic scenes with no text, logos, brands or recognizable people.
 * - A daily budget caps how many images can be generated.
 * - Any failure is reported and the gallery keeps placeholders.
 */

export interface GeneratedFile {
  bytes: Uint8Array;
}

export interface ImageGenerator {
  generate(prompt: string): Promise<GeneratedFile>;
}

export interface ImageBudget {
  remaining: number;
}

const GUARD =
  'Photographic style, natural light. No text, no logos, no brand names, no recognizable people or faces.';

const SCENES: Record<TemplateId, string[]> = {
  restaurant: [
    'A warm restaurant interior with set wooden tables',
    'A plate of freshly cooked West African dishes on a table',
    'A bright outdoor dining area with simple seating',
    'A kitchen counter with fresh vegetables and spices',
  ],
  salon: [
    'A clean modern hair salon interior with styling chairs',
    'Hair styling tools neatly arranged on a counter',
    'A relaxing beauty treatment area with soft lighting',
    'A shelf of hair care products with no labels',
  ],
  boutique: [
    'A fashion boutique rail with colourful African-print clothing',
    'Folded fabrics and accessories on a display table',
    'A bright shop interior with mannequins',
    'Shoes and bags arranged on shelves',
  ],
  guesthouse: [
    'A tidy guesthouse bedroom with fresh white linen',
    'A small hotel lounge area with comfortable seating',
    'A quiet courtyard with plants and chairs',
    'A simple bathroom with clean towels',
  ],
  generic: [
    'A tidy small business reception area',
    'A clean professional workspace in natural light',
    'A friendly service counter with a plain desk',
    'Tools and supplies neatly arranged on a table',
  ],
};

export function buildPrompt(template: TemplateId, index: number): string {
  const scenes = SCENES[template];
  const scene = scenes[index % scenes.length] ?? SCENES.generic[0]!;
  return `${scene}. ${GUARD}`;
}

function hash(text: string): string {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

export interface GenerateResult {
  images: LibraryImage[];
  generated: number;
  failures: string[];
}

/**
 * Generates up to `count` images for a template, never exceeding the budget.
 * `save` stores the bytes (relative path under assets/generated/).
 */
export async function generateImages(opts: {
  template: TemplateId;
  count: number;
  generator: ImageGenerator;
  budget: ImageBudget;
  save: (relPath: string, bytes: Uint8Array) => Promise<void>;
}): Promise<GenerateResult> {
  const images: LibraryImage[] = [];
  const failures: string[] = [];
  const target = Math.min(opts.count, Math.max(0, opts.budget.remaining));

  for (let i = 0; i < target; i++) {
    const prompt = buildPrompt(opts.template, i);
    try {
      const out = await opts.generator.generate(prompt);
      const file = `${opts.template}/${hash(prompt)}.png`;
      await opts.save(file, out.bytes);
      opts.budget.remaining -= 1;
      images.push({
        file,
        template: opts.template,
        alt: `${prompt.split('.')[0]} (AI-generated illustration)`,
        license: 'ai_generated',
      });
    } catch (err) {
      failures.push(err instanceof Error ? err.message : String(err));
      break; // stop on the first failure so a broken key does not burn retries
    }
  }
  return { images, generated: images.length, failures };
}
