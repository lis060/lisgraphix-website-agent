import type { GeneratedFile, ImageGenerator } from './generate';

/**
 * Free image generation with Cloudflare Workers AI (FLUX.1 schnell).
 *
 * Cost: every Cloudflare account gets a free daily allowance of Neurons, and
 * one image uses well under 100. When the allowance is used up, Cloudflare
 * refuses further requests (no charge unless you upgrade to a paid plan, which
 * this project never does). Our own daily cap (default 8) stays in place too.
 *
 * The API token is sent only to api.cloudflare.com and never appears in
 * error messages.
 */

const MODEL = '@cf/black-forest-labs/flux-1-schnell';
const ACCOUNT_ID = /^[a-f0-9]{32}$/i;

export function createCloudflareGenerator(opts: {
  accountId: string;
  apiToken: string;
  fetchImpl?: typeof fetch;
}): ImageGenerator {
  if (!ACCOUNT_ID.test(opts.accountId)) {
    throw new Error('CLOUDFLARE_ACCOUNT_ID must be the 32-character account ID.');
  }
  const doFetch = opts.fetchImpl ?? fetch;
  const url = `https://api.cloudflare.com/client/v4/accounts/${opts.accountId}/ai/run/${MODEL}`;

  return {
    async generate(prompt: string): Promise<GeneratedFile> {
      const res = await doFetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${opts.apiToken}` },
        body: JSON.stringify({ prompt, steps: 4 }),
      });
      if (!res.ok) throw new Error(`Cloudflare image API returned ${res.status}`);
      const json = (await res.json()) as { success?: boolean; result?: { image?: string } };
      const b64 = json.result?.image;
      if (json.success === false || !b64) throw new Error('Cloudflare image API returned no image data');
      const bytes = Uint8Array.from(Buffer.from(b64, 'base64'));
      // FLUX on Workers AI returns JPEG; detect by the file signature rather than assume.
      const isPng = bytes[0] === 0x89 && bytes[1] === 0x50;
      const isJpeg = bytes[0] === 0xff && bytes[1] === 0xd8;
      if (!isPng && !isJpeg) throw new Error('Cloudflare image API returned data that is not an image');
      return { bytes, ext: isPng ? 'png' : 'jpg' };
    },
  };
}
