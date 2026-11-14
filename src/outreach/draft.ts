import type { BusinessCandidate } from '../domain/types';

/**
 * Outreach drafts. This module only writes text for the owner to review.
 * It never sends anything. A draft is only "ready for review" when it holds a
 * real, verified preview link.
 */

export interface OutreachDraft {
  subject: string;
  body: string;
  /** False until a verified preview URL is included. */
  readyForReview: boolean;
}

const PLACEHOLDER = '[Preview link will be added once the demo is live]';

/** Keeps scraped names to one clean line so they cannot reshape the message. */
function cleanName(name: string): string {
  return name.replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80);
}

function benefit(category: string): string {
  const c = category.toLowerCase();
  if (/restaurant|food/.test(c)) return 'show your menu and location, and let customers reach you on WhatsApp';
  if (/salon|barber/.test(c)) return 'show your services and make it easy for clients to ask for an appointment';
  if (/boutique|fashion/.test(c)) return 'show your collections and let shoppers message you about items they like';
  if (/guesthouse|hotel/.test(c)) return 'show your rooms and facilities, and receive booking enquiries directly';
  return 'show what you offer and make it easy for customers to contact you';
}

export function buildOutreachDraft(
  candidate: Pick<BusinessCandidate, 'name' | 'category'>,
  verifiedPreviewUrl?: string,
): OutreachDraft {
  const name = cleanName(candidate.name);
  const hasUrl = !!verifiedPreviewUrl && /^https:\/\//.test(verifiedPreviewUrl);
  const body = [
    `Hello ${name} team,`,
    '',
    'My name is Listowell, from Lisgraphix, a web design agency in Ghana.',
    '',
    `While looking at local businesses online, I could not find an official website for ${name}. If you already have one, please ignore this message.`,
    '',
    `A simple website could help you ${benefit(candidate.category)}.`,
    '',
    `To show what that could look like, I put together an unofficial website concept for ${name}. It is a demonstration only, uses sample content, and is not presented to the public as your website:`,
    hasUrl ? verifiedPreviewUrl! : PLACEHOLDER,
    '',
    'If you like the idea, I would be glad to talk about building a real website with your own photos and details. If not, tell me and I will take the concept down.',
    '',
    'Kind regards,',
    'Listowell',
    'Lisgraphix, The Brand Builders',
  ].join('\n');
  return { subject: `A website concept for ${name}`, body, readyForReview: hasUrl };
}
