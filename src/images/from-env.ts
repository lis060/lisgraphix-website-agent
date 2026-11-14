import { createCloudflareGenerator } from './cloudflare-generator';
import type { ImageGenerator } from './generate';
import { createOpenAIGenerator } from './openai-generator';

/**
 * Picks an image provider from the environment. Free Cloudflare comes first.
 * Returns undefined when nothing is configured, so galleries keep placeholders.
 */
export function generatorFromEnv(env: NodeJS.ProcessEnv): ImageGenerator | undefined {
  const accountId = env.CLOUDFLARE_ACCOUNT_ID?.trim();
  const apiToken = env.CLOUDFLARE_API_TOKEN?.trim();
  if (accountId && apiToken) return createCloudflareGenerator({ accountId, apiToken });

  const key = env.IMAGE_API_KEY?.trim();
  if (key) return createOpenAIGenerator({ apiKey: key, model: env.IMAGE_MODEL?.trim() || 'gpt-image-1' });
  return undefined;
}
