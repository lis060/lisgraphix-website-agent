# Lisgraphix Client Finder (scaffold)

Backend core for the Lisgraphix prospecting workflow: business validation, duplicate prevention, website-absence verification, explainable lead scoring, and a ranking pipeline.

**Status: scaffold.** The core logic is built and tested. External integrations, the dashboard, the database, deployment and the daily schedule are not built yet. See "Not built yet" below.

## What works now

- **Input validation** (`src/discovery/manual-import.ts`): accepts a JSON array of businesses, rejects incomplete records, strips control characters, and never fills in missing details.
- **Duplicate prevention** (`src/dedupe/dedupe.ts`): matches the same normalized name in the same city as a duplicate. A shared phone number alone is flagged for review, not dropped, because businesses often share a line.
- **Website-absence verification** (`src/verification/website-status.ts`): classifies a business as one of six statuses from recorded facts. "No website identified" is capped at 85% confidence and is never presented as proof.
- **Lead scoring** (`src/scoring/score.ts`): 0 to 100, with seven factors that each show points and a reason. A lead is only prioritized when it has a clear website gap at 60% confidence or higher and meets the minimum score. The score does not estimate revenue.
- **Pipeline** (`src/workflow/pipeline.ts`): dedupe, category and city filters, daily discovery limit, verification with per-lead failure recording, ranking, shortlist, and demo selection limits.
- **Demo templates** (`src/templates/`): one specification per business, with restaurant, salon/barbershop, boutique, guesthouse and generic templates. Only verified facts appear as facts. Unknown details become labelled placeholders or are left out. Sample lists are marked as demonstration content, and pricing appears only when verified. The page renders to one self-contained HTML file with the unofficial notice, `noindex`, no external scripts or images, and escaped text.
- **Own image library** (`src/images/library.ts`, `assets/library/`): your photos, one folder per template, listed in a validated manifest. Paths are checked (no traversal or URLs), alt text and an `own` licence are required, and picks are stable per business. Images show with an "illustrative, not the business's own photo" caption. With no images, templates keep placeholders. See `assets/library/README.md`.
- **AI-generated images** (`src/images/generate.ts`, `resolve.ts`, `openai-generator.ts`): the default image source. Prompts use only fixed generic scenes, never business text, and ask for no text, logos or recognizable people. A daily cap (default 8 images) limits cost, failures fall back to placeholders, and each image is captioned as AI-generated. Switch `imageSource` to `library` or `none` in settings. The OpenAI adapter is untested against the live API and does nothing until `IMAGE_API_KEY` is set.
- **Settings** (`src/config/config.ts`): defaults from the spec (Accra, Tema, Kumasi; 20 discoveries; 5 shortlisted; 2 demos; 9:30 AM Africa/Accra as cron `30 9 * * *`).

## Run it

```bash
npm install
npm test            # 63 tests
npm run typecheck
npm run run -- path/to/businesses.json
```

The CLI makes no network calls. Without verification facts, every lead is classified as uncertain and none are prioritized, which is the intended safe default.

## Not built yet

These need your authorization or accounts, and none were created:

- **Business discovery sources.** Google Places needs an API key and billing. Directory sources need terms review.
- **Live website checks.** Listing, search and HTTP checks need the discovery source above.
- **Database.** Supabase project and schema migrations.
- **React/Vite demo app and Vercel deployment.** The current templates render static HTML. A React/Vite version and deployment still need building. Vercel paid hosting is not authorized.
- **Image generation key.** No provider is connected. Until you add `IMAGE_API_KEY`, galleries keep placeholders.
- **Dashboard data and authentication.** A dashboard shell exists in `dashboard/` (run `cd dashboard && npm install && npm run dev`) with sample data only. It has no login, database or live actions yet.
- **Daily scheduler and email report.** The schedule and notification email both need your approval before they run.
- **Outreach.** Not built on purpose. The spec forbids automatic contact with business owners.

## Configuration

Copy `.env.example` to `.env.local` and fill in values only when each integration is authorized. Never commit real secrets.

## Design notes

- Business text from listings and websites is treated as untrusted data. It is stored and displayed, never executed or used as instructions.
- Each module is a pure function with an injected clock and facts, so tests are deterministic and any integration can be replaced without changing the scoring logic.
