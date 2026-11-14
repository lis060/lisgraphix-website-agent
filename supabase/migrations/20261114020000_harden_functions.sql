-- Hardening after Supabase's security check.
-- Helper functions in the public schema can be called directly through the
-- API. Move the access check to a private schema that the API does not expose,
-- and stop anyone calling the trigger function directly.

create schema if not exists private;
grant usage on schema private to authenticated;

create function private.is_app_user() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.app_users where auth_user_id = auth.uid());
$$;
revoke execute on function private.is_app_user() from public;
grant execute on function private.is_app_user() to authenticated;

alter policy app_read on app_users using (private.is_app_user());
alter policy app_read on businesses using (private.is_app_user());
alter policy app_read on business_sources using (private.is_app_user());
alter policy app_read on website_verifications using (private.is_app_user());
alter policy app_read on lead_scores using (private.is_app_user());
alter policy app_read on templates using (private.is_app_user());
alter policy app_read on automation_schedules using (private.is_app_user());
alter policy app_read on automation_executions using (private.is_app_user());
alter policy app_read on generated_demos using (private.is_app_user());
alter policy app_read on deployments using (private.is_app_user());
alter policy app_read on daily_reports using (private.is_app_user());
alter policy app_read on outreach_drafts using (private.is_app_user());
alter policy app_read on client_status_history using (private.is_app_user());
alter policy app_read on app_settings using (private.is_app_user());
alter policy app_update on businesses using (private.is_app_user()) with check (private.is_app_user());
alter policy app_update on outreach_drafts using (private.is_app_user()) with check (private.is_app_user());
alter policy app_update on app_settings using (private.is_app_user()) with check (private.is_app_user());

drop function public.is_app_user();

-- Triggers still fire normally; this only blocks direct calls through the API.
revoke execute on function public.businesses_before_update() from public, anon, authenticated;
