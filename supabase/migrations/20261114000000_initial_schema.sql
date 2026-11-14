-- Lisgraphix Client Finder: initial schema.
-- NOT applied to any project yet. Review before running.
-- Row Level Security is enabled on every table with no policies, so only the
-- server (service role key) can read or write. Add policies when auth is wired.

create table app_users (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique,
  email text not null unique,
  role text not null default 'owner' check (role in ('owner','admin')),
  created_at timestamptz not null default now()
);

create table businesses (
  id uuid primary key default gen_random_uuid(),
  external_id text,                       -- e.g. a Places listing id, when one exists
  name text not null,
  normalized_name text not null,          -- lowercase, no punctuation/legal suffixes
  category text not null,
  city text not null,
  address text,
  phone text,
  phone_key text,                         -- last 9 digits, for matching
  email text,
  social_urls text[] not null default '{}',
  maps_url text,
  website_url text,
  description text,
  operational boolean,                    -- null = unknown
  client_status text not null default 'New Lead'
    check (client_status in ('New Lead','Qualified','Demo Ready','Contacted','Interested','Negotiating','Won','Lost')),
  discovered_at timestamptz not null default now(),
  last_verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index businesses_name_city_key on businesses (normalized_name, lower(city));
create unique index businesses_external_id_key on businesses (external_id) where external_id is not null;
create index businesses_phone_key_idx on businesses (phone_key) where phone_key is not null;
create index businesses_status_idx on businesses (client_status);

create table business_sources (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  url text not null,
  kind text not null default 'listing',
  note text,
  retrieved_at timestamptz not null default now(),
  unique (business_id, url)
);

create table website_verifications (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  status text not null check (status in (
    'no_official_website_identified','website_exists','social_media_only',
    'uncertain','website_broken_or_outdated','needs_manual_verification')),
  confidence numeric(3,2) not null check (confidence >= 0 and confidence <= 1),
  website_url text,
  evidence jsonb not null default '[]',   -- kept so you can check the reasoning
  notes text[] not null default '{}',
  verified_at timestamptz not null default now()
);
create index website_verifications_business_idx on website_verifications (business_id, verified_at desc);

create table lead_scores (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  verification_id uuid references website_verifications(id) on delete set null,
  total smallint not null check (total between 0 and 100),
  factors jsonb not null default '[]',    -- per-factor points and reasons
  prioritized boolean not null default false,
  decision_reason text not null,
  website_recommendation text,
  scored_at timestamptz not null default now()
);
create index lead_scores_business_idx on lead_scores (business_id, scored_at desc);
create index lead_scores_rank_idx on lead_scores (total desc) where prioritized;

create table templates (
  id uuid primary key default gen_random_uuid(),
  template_key text not null unique
    check (template_key in ('restaurant','salon','boutique','guesthouse','generic')),
  name text not null,
  version int not null default 1,
  created_at timestamptz not null default now()
);

create table automation_schedules (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  cron text not null,
  timezone text not null default 'Africa/Accra',
  enabled boolean not null default false,  -- stays off until you authorize it
  created_at timestamptz not null default now()
);

create table automation_executions (
  id uuid primary key default gen_random_uuid(),
  schedule_id uuid references automation_schedules(id) on delete set null,
  trigger text not null check (trigger in ('schedule','manual')),
  status text not null default 'running' check (status in ('running','succeeded','partial','failed')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  error text,
  stats jsonb not null default '{}',
  api_usage jsonb not null default '{}'
);
-- Only one run may be in progress at a time (prevents overlapping runs).
create unique index automation_one_running_key on automation_executions ((true)) where status = 'running';
create index automation_executions_started_idx on automation_executions (started_at desc);

create table generated_demos (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  template_id uuid references templates(id),
  execution_id uuid references automation_executions(id) on delete set null,
  status text not null default 'built' check (status in ('built','failed','archived')),
  spec jsonb not null,
  created_at timestamptz not null default now(),
  archived_at timestamptz
);
create index generated_demos_business_idx on generated_demos (business_id, created_at desc);

create table deployments (
  id uuid primary key default gen_random_uuid(),
  demo_id uuid not null references generated_demos(id) on delete cascade,
  provider text not null default 'vercel',
  deployment_url text,
  status text not null default 'pending' check (status in ('pending','ready','failed','deleted')),
  url_reachable boolean,
  url_checked_at timestamptz,
  error text,
  created_at timestamptz not null default now(),
  -- A deployment is only "ready" with a real URL that was checked and reachable.
  constraint deployments_ready_needs_verified_url check (
    status <> 'ready' or (deployment_url is not null and url_reachable is true))
);

create table daily_reports (
  id uuid primary key default gen_random_uuid(),
  execution_id uuid unique references automation_executions(id) on delete cascade,
  title text not null default 'LISGRAPHIX DAILY WEBSITE OPPORTUNITY REPORT',
  body jsonb not null,
  created_at timestamptz not null default now()
);

create table outreach_drafts (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  demo_id uuid references generated_demos(id) on delete set null,
  subject text,
  body text not null,
  status text not null default 'draft' check (status in ('draft','approved','sent','discarded')),
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  -- Nothing is "sent" without a recorded approval.
  constraint outreach_sent_needs_approval check (status <> 'sent' or approved_at is not null)
);

create table client_status_history (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  from_status text,
  to_status text not null,
  changed_by uuid references app_users(id) on delete set null,
  note text,
  changed_at timestamptz not null default now()
);
create index client_status_history_business_idx on client_status_history (business_id, changed_at desc);

create table app_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

-- Keep updated_at fresh and log every client-status change automatically.
create function businesses_before_update() returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  if new.client_status is distinct from old.client_status then
    insert into client_status_history (business_id, from_status, to_status)
    values (old.id, old.client_status, new.client_status);
  end if;
  return new;
end $$;
create trigger businesses_before_update_trg before update on businesses
  for each row execute function businesses_before_update();

-- Default settings from the project spec. The schedule starts disabled.
insert into app_settings (key, value) values
  ('cities', '["Accra","Tema","Kumasi"]'),
  ('daily_discovery_limit', '20'),
  ('shortlist_limit', '5'),
  ('daily_demo_limit', '2'),
  ('min_opportunity_score', '60'),
  ('image_source', '"generated"'),
  ('max_generated_images_per_day', '8');
insert into automation_schedules (name, cron, timezone, enabled)
  values ('Daily discovery', '30 9 * * *', 'Africa/Accra', false);
insert into templates (template_key, name) values
  ('restaurant','Restaurant'),('salon','Salon and barbershop'),('boutique','Fashion boutique'),
  ('guesthouse','Guesthouse and small hotel'),('generic','Generic service business');

alter table app_users enable row level security;
alter table businesses enable row level security;
alter table business_sources enable row level security;
alter table website_verifications enable row level security;
alter table lead_scores enable row level security;
alter table templates enable row level security;
alter table automation_schedules enable row level security;
alter table automation_executions enable row level security;
alter table generated_demos enable row level security;
alter table deployments enable row level security;
alter table daily_reports enable row level security;
alter table outreach_drafts enable row level security;
alter table client_status_history enable row level security;
alter table app_settings enable row level security;
