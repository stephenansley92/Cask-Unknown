begin;

alter table public.whiskeys
  add column if not exists bottle_size text,
  add column if not exists category text,
  add column if not exists subcategory text,
  add column if not exists rarity text,
  add column if not exists msrp numeric(10, 2),
  add column if not exists secondary numeric(10, 2),
  add column if not exists paid numeric(10, 2),
  add column if not exists status text,
  add column if not exists notes text,
  add column if not exists identity_key text;

alter table public.pours
  add column if not exists whiskey_id uuid;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'pours_whiskey_id_fkey'
  ) then
    alter table public.pours
      add constraint pours_whiskey_id_fkey
      foreign key (whiskey_id)
      references public.whiskeys(id)
      on delete set null;
  end if;
end
$$;

update public.whiskeys
set identity_key = case
  when coalesce(trim(name), '') = '' then null
  else lower(regexp_replace(trim(name), '\s+', ' ', 'g')) || '|' ||
    coalesce(lower(regexp_replace(trim(distillery), '\s+', ' ', 'g')), '') || '|' ||
    coalesce(trim((proof)::text), '') || '|' ||
    coalesce(lower(regexp_replace(trim(bottle_size), '\s+', ' ', 'g')), '')
end
where coalesce(identity_key, '') = '';

create unique index if not exists whiskeys_user_identity_key_uidx
  on public.whiskeys (user_id, identity_key)
  where identity_key is not null and identity_key <> '';

create index if not exists whiskeys_user_name_search_idx
  on public.whiskeys (user_id, lower(name));

create index if not exists whiskeys_user_distillery_search_idx
  on public.whiskeys (user_id, lower(distillery));

create index if not exists pours_whiskey_id_idx
  on public.pours (whiskey_id);

commit;
