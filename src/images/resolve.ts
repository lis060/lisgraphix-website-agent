import type { AutomationSettings } from '../config/config';
import type { BusinessCandidate } from '../domain/types';
import { templateFor } from '../templates/site-spec';
import { generateImages, type ImageBudget, type ImageGenerator } from './generate';
import { pickImages, type LibraryImage } from './library';

export interface ResolvedImages {
  images: LibraryImage[];
  notes: string[];
}

/**
 * Chooses demo images according to settings.imageSource.
 * "generated" with no generator configured returns no images and says why,
 * so galleries keep clearly labelled placeholders.
 */
export async function resolveImages(opts: {
  settings: AutomationSettings;
  candidate: BusinessCandidate;
  library: LibraryImage[];
  generator?: ImageGenerator;
  budget: ImageBudget;
  save: (relPath: string, bytes: Uint8Array) => Promise<void>;
}): Promise<ResolvedImages> {
  const { settings, candidate } = opts;
  const template = templateFor(candidate.category);

  if (settings.imageSource === 'none') return { images: [], notes: ['Images disabled in settings.'] };

  if (settings.imageSource === 'library') {
    return { images: pickImages(opts.library, template, settings.imagesPerSite, candidate.name), notes: [] };
  }

  if (!opts.generator) {
    return { images: [], notes: ['Image generation is not connected (no API key). Using placeholders.'] };
  }
  if (opts.budget.remaining <= 0) {
    return { images: [], notes: ['Daily image budget used up. Using placeholders.'] };
  }
  const result = await generateImages({
    template,
    count: settings.imagesPerSite,
    generator: opts.generator,
    budget: opts.budget,
    save: opts.save,
  });
  return {
    images: result.images,
    notes: result.failures.map((f) => `Image generation failed: ${f}. Using placeholders.`),
  };
}
