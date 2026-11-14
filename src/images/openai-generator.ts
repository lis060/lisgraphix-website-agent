import type { GeneratedFile, ImageGenerator } from './generate';

/**
 * Image generator using the OpenAI Images API. Not connected until an API key
 * is supplied, and NOT yet verified against the live API. Swap this file to
 * use another provider; nothing else depends on it.
 */
export function createOpenAIGenerator(opts: {
  apiKey: string;
  model: string;
  fetchImpl?: typeof fetch;
}): ImageGenerator {
  const doFetch = opts.fetchImpl ?? fetch;
  return {
    async generate(prompt: string): Promise<GeneratedFile> {
      const res = await doFetch('https://api.openai.com/v1/images/generations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${opts.apiKey}` },
        body: JSON.stringify({ model: opts.model, prompt, size: '1024x1024', n: 1 }),
      });
      if (!res.ok) throw new Error(`Image API returned ${res.status}`);
      const json = (await res.json()) as { data?: { b64_json?: string }[] };
      const b64 = json.data?.[0]?.b64_json;
      if (!b64) throw new Error('Image API returned no image data');
      return { bytes: Uint8Array.from(Buffer.from(b64, 'base64')) };
    },
  };
}
