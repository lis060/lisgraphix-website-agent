-- Google storage rule: for businesses found through Google Places, keep only
-- Google's place ID plus our own work (category and city we searched for,
-- website status, score, notes, client stage). Google's own content (name,
-- address, phone, website, maps link, opening status) is never stored, and the
-- database refuses it.

alter table businesses add column source text not null default 'manual'
  check (source in ('manual', 'google_places'));
alter table businesses alter column name drop not null;
alter table businesses alter column normalized_name drop not null;

alter table businesses add constraint businesses_source_rules check (
  (source = 'google_places'
     and external_id is not null
     and name is null and normalized_name is null and address is null
     and phone is null and phone_key is null and email is null
     and maps_url is null and website_url is null and description is null
     and operational is null and social_urls = '{}')
  or
  (source <> 'google_places' and name is not null and normalized_name is not null)
);
