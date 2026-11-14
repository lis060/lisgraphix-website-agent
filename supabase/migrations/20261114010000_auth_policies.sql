-- Access rules for signed-in dashboard users.
-- NOT applied to any project yet.
--
-- Signing in is not enough. A person can only see data when their Supabase
-- login is linked to a row in app_users (an allowlist you control). Everyone
-- else, including anyone who signs up uninvited, sees nothing.
-- The server (service role key) bypasses these rules and does all automation writes.

create function is_app_user() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from app_users where auth_user_id = auth.uid());
$$;

-- Read access to every table for allowlisted users.
create policy app_read on app_users for select to authenticated using (is_app_user());
create policy app_read on businesses for select to authenticated using (is_app_user());
create policy app_read on business_sources for select to authenticated using (is_app_user());
create policy app_read on website_verifications for select to authenticated using (is_app_user());
create policy app_read on lead_scores for select to authenticated using (is_app_user());
create policy app_read on templates for select to authenticated using (is_app_user());
create policy app_read on automation_schedules for select to authenticated using (is_app_user());
create policy app_read on automation_executions for select to authenticated using (is_app_user());
create policy app_read on generated_demos for select to authenticated using (is_app_user());
create policy app_read on deployments for select to authenticated using (is_app_user());
create policy app_read on daily_reports for select to authenticated using (is_app_user());
create policy app_read on outreach_drafts for select to authenticated using (is_app_user());
create policy app_read on client_status_history for select to authenticated using (is_app_user());
create policy app_read on app_settings for select to authenticated using (is_app_user());

-- Limited edits from the dashboard: move a client between stages, review
-- outreach drafts, change settings. Nothing else is writable from the browser.
create policy app_update on businesses for update to authenticated
  using (is_app_user()) with check (is_app_user());
create policy app_update on outreach_drafts for update to authenticated
  using (is_app_user()) with check (is_app_user());
create policy app_update on app_settings for update to authenticated
  using (is_app_user()) with check (is_app_user());

-- The status-history trigger must be able to write its log row even though
-- dashboard users cannot insert into that table directly. It also records who
-- made the change.
create or replace function businesses_before_update() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.updated_at := now();
  if new.client_status is distinct from old.client_status then
    insert into client_status_history (business_id, from_status, to_status, changed_by)
    values (old.id, old.client_status, new.client_status,
            (select id from app_users where auth_user_id = auth.uid()));
  end if;
  return new;
end $$;
