# Lisgraphix Client Finder (scaffold)

Backend core for the Lisgraphix prospecting workflow: business validation, duplicate prevention, website-absence verification, explainable lead scoring, and a ranking pipeline.

**Status: scaffold.** The core logic is built and tested. External integrations, the dashboard, the database, deployment and the daily schedule are not built yet. See "Not built yet" below.

## What works now

- **Input validation** (`src/discovery/manual-import.ts`): accepts a JSON array of businesses, rejects incomplete records, strips control characters, and never fills in missing details.
- **Duplicate prevention** (`src/dedupe/dedupe.ts`): matches the same normalized name in the same city as a duplicate. A shared phone number alone is flagged for review, not dropped, because businesses often share a line.
- **Website-absence verification** (`src/verification/website-status.ts`): classifies a business as one of six statuses from recorded facts. "No website identified" is capped at 85% confidence and is never presented as proof.
- **Lead scoring** (`src/scoring/score.ts`): 0 to 100 from nine factors that each show points and a reason: website gap 35, customer activity 12, online presence 10, category certainty 5, website value 15, public contact 8, information for a demo 5, active business 5, freshness 5. Customer activity uses how many ratings a listing has, and online presence uses social pages found. Both are used in memory during a run and described in bands, so no figure from a listing is stored. A lead is only prioritized when it has a clear website gap at 60% confidence or higher and meets the minimum score. The score does not estimate revenue.
- **Pipeline** (`src/workflow/pipeline.ts`): dedupe, category and city filters, daily discovery limit, verification with per-lead failure recording, ranking, shortlist, and demo selection limits.
- **Demo templates** (`src/templates/`): one specification per business, with restaurant, salon/barbershop, boutique, guesthouse and generic templates. Only verified facts appear as facts. Unknown details become labelled placeholders or are left out. Sample lists are marked as demonstration content, and pricing appears only when verified. Each template has its own look (`src/templates/themes.ts`): its own colours, heading style, hero and gallery layout, with text contrast checked by tests (WCAG AA). The Lisgraphix purple notice bar stays on every page. The page renders to one self-contained HTML file with the unofficial notice, `noindex`, no external scripts or images, and escaped text.
- **Own image library** (`src/images/library.ts`, `assets/library/`): your photos, one folder per template, listed in a validated manifest. Paths are checked (no traversal or URLs), alt text and an `own` licence are required, and picks are stable per business. Images show with an "illustrative, not the business's own photo" caption. With no images, templates keep placeholders. See `assets/library/README.md`.
- **AI-generated images** (`src/images/generate.ts`, `resolve.ts`, `openai-generator.ts`): the default image source. Prompts use only fixed generic scenes, never business text, and ask for no text, logos or recognizable people. A daily cap (default 8 images) limits cost, failures fall back to placeholders, and each image is captioned as AI-generated. Switch `imageSource` to `library` or `none` in settings. The free Cloudflare Workers AI adapter (`cloudflare-generator.ts`, FLUX.1 schnell) is preferred when `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN` are set; the OpenAI adapter is a paid fallback. Both are untested against the live APIs until you run `npm run image:try`, which makes one image.
- **Database schema** (`supabase/migrations/`): 14 tables for businesses, sources, verification evidence, scores, demos, deployments, schedules, runs, reports, outreach drafts, status history and settings. Tested on a real in-memory Postgres. It enforces no duplicate businesses, one running automation at a time, a "ready" deployment only with a verified URL, no outreach "sent" without approval, and row level security on every table. Not applied to any project, and the seeded schedule starts disabled.
- **Login and access rules** (`dashboard/src/auth.tsx`, `supabase/migrations/20261114010000_auth_policies.sql`): email and password sign-in through Supabase Auth, plus an allowlist. Only accounts linked in `app_users` can read data, and from the browser they can only move client stages, review outreach drafts and change settings. The rules are enforced in the database and tested locally. Sign-in itself has not been tested against a live Supabase project.
- **Daily report** (`src/reports/daily-report.ts`): builds the report from a run, with a plain-text version for email and a CSV export. Preview links appear only for deployments verified as reachable. CSV cells are quoted and spreadsheet formulas are neutralised.
- **Outreach drafts** (`src/outreach/draft.ts`): writes a friendly draft per lead for you to review. It never sends anything, and a draft is only marked ready once it holds a verified preview link.
- **Google Places discovery** (`src/discovery/google-places.ts`): Text Search adapter with a cost-limited field mask, a daily call cap (default 10), retries with backoff, and social links kept separate from websites. `npm run discover` does a live test run that prints a report and writes nothing. Not verified against the live API until a key is added.
- **Category check** (`src/discovery/category-match.ts`): compares Google's own type labels with the category searched and drops clear mismatches, such as a phone shop returned for a furniture search. Vague or missing labels are kept as unknown. The labels are used in memory only.
- **Website reachability check** (`src/verification/reachability.ts`): checks that a public web address answers, and refuses private or local addresses.
- **Saving runs** (`src/storage/save-run.ts`): `npm run discover -- --save` stores a run in Supabase. Businesses found through Google are stored by place ID only, with the category and city searched, our website status, score and reasons. Google's name, address, phone, website and links are never written, and a database constraint refuses them. Only one run can be in progress; a crashed run is closed after two hours. Needs `DATABASE_URL`. Not verified against the live database.
- **Web search check** (`src/verification/web-search.ts`, `search-providers.ts`): searches for each business that has no website on its listing, ignores directories and social pages, and looks for a site of its own. A domain matching the business name counts as its website; a weaker match goes to manual review. With the listing check and this one both clean, a lead reaches "no official website identified" at 75% confidence and can be prioritized. Capped at 25 searches a day. Works with Brave or Serper; neither adapter has run against the live service.
- **Demo builder** (`src/demo/build.ts`): builds one demo page and runs ten checks before it may be published: unofficial notice, hidden from search engines, no scripts, no outside files, safe links only, one main heading, mobile ready, images described, no invented reviews, small page size. `npm run demo:samples` writes one sample per template to `demo-output/` using fictional businesses. Add `-- --images` (for example `npm run demo:samples -- --images`) to put one AI-generated photo in each demo; it needs the Cloudflare keys in `.env`, respects the daily cap of 8 images, and falls back to labelled placeholders if anything fails.
- **Business names in the dashboard** (`supabase/functions/place-details/`): a Supabase Edge Function that fetches a Google lead's name fresh by place ID when the dashboard opens. Only signed-in, allowlisted users can call it, it accepts our own business ids only, and it stores nothing. Daily caps: 300 name lookups and 30 full lookups (address and phone), counted in `api_usage_daily`. Deployed to the live project. The signed-in path has not been tested, because that needs the owner's password and the Google secret.
- **Settings** (`src/config/config.ts`): defaults from the spec (Accra, Tema, Kumasi; 20 discoveries; 5 shortlisted; 2 demos; 9:30 AM Africa/Accra as cron `30 9 * * *`).

## Run it

```bash
npm install
npm test            # 150 tests
npm run typecheck
npm run run -- path/to/businesses.json
```

The CLI makes no network calls. Without verification facts, every lead is classified as uncertain and none are prioritized, which is the intended safe default.

## Not built yet

These need your authorization or accounts, and none were created:

- **Google Places key.** Set `GOOGLE_PLACES_API_KEY` (Places API (New) enabled, billing on). With phone and website fields, searches bill at the Text Search Enterprise rate, which Google lists with 1,000 free calls a month.
- **Google key for the names function.** The `place-details` function is deployed but returns "not configured" until `GOOGLE_PLACES_API_KEY` is added as a secret in the Supabase project (Edge Functions, then Secrets). Until then, Google leads show as an "Open in Google Maps" link.
- **Web search key.** The second website check is built but needs a key for one search service: `BRAVE_SEARCH_API_KEY` or `SERPER_API_KEY`. Until one is set, no lead can be prioritized.
- **Database connection.** The schema is written but no Supabase project is connected or migrated.
- **React/Vite demo app and Vercel deployment.** The current templates render static HTML. A React/Vite version and deployment still need building. Vercel paid hosting is not authorized.
- **Image generation key.** No provider is connected yet. Until you add the two Cloudflare lines (free) or `IMAGE_API_KEY`, galleries keep placeholders.
- **Dashboard actions.** When signed in, the dashboard reads real data from Supabase (leads, scores, demos, settings) and can move a client between stages. Editing settings, Run Now, rebuild and archive are not built. With no Supabase values in `dashboard/.env.local` it runs in open sample mode.
- **Daily scheduler and email delivery.** The report text is built, but no email provider is connected and the schedule is off. Both need your approval before they run. PDF export is not built.
- **Sending outreach.** Not built on purpose. Drafts are written for your review, but nothing contacts a business owner automatically.

## Connecting login (when you have a Supabase project)

1. Apply both files in `supabase/migrations/` to the project, in order.
2. In Supabase Auth settings, turn off public sign-ups, then create your own user.
3. Link that user to the allowlist: `insert into app_users (auth_user_id, email) values ('<your auth user id>', '<your email>');`
4. Copy `dashboard/.env.example` to `dashboard/.env.local` and fill in the project URL and anon key. Never put the service role key in the dashboard.

## Configuration

Copy `.env.example` to `.env.local` and fill in values only when each integration is authorized. Never commit real secrets.

## Design notes

- Business text from listings and websites is treated as untrusted data. It is stored and displayed, never executed or used as instructions.
- Each module is a pure function with an injected clock and facts, so tests are deterministic and any integration can be replaced without changing the scoring logic.
