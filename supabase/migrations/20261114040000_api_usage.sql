-- Daily counters for paid API calls made by server functions, so a bug or
-- misuse cannot run up a bill. Days follow Ghana time.

create table api_usage_daily (
  day date not null,
  service text not null,
  calls integer not null default 0 check (calls >= 0),
  primary key (day, service)
);
alter table api_usage_daily enable row level security;
create policy app_read on api_usage_daily for select to authenticated using (private.is_app_user());

-- Adds p_calls to today's counter only if the total stays within p_cap.
-- Returns true when the calls are allowed. Server-only.
create function bump_api_usage(p_service text, p_calls integer, p_cap integer) returns boolean
language plpgsql set search_path = public as $$
declare
  new_total integer;
begin
  if p_calls <= 0 then return true; end if;
  if p_calls > p_cap then return false; end if;
  insert into api_usage_daily (day, service, calls)
  values ((now() at time zone 'Africa/Accra')::date, p_service, p_calls)
  on conflict (day, service) do update
    set calls = api_usage_daily.calls + excluded.calls
    where api_usage_daily.calls + excluded.calls <= p_cap
  returning calls into new_total;
  return new_total is not null;
end $$;
revoke execute on function bump_api_usage(text, integer, integer) from public, anon, authenticated;
grant execute on function bump_api_usage(text, integer, integer) to service_role;
