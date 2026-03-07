begin;

create index if not exists whiskeys_identity_key_lookup_idx
  on public.whiskeys (identity_key)
  where identity_key is not null and identity_key <> '';

create index if not exists whiskeys_name_search_idx_global
  on public.whiskeys (lower(name));

create index if not exists whiskeys_distillery_search_idx_global
  on public.whiskeys (lower(distillery));

commit;
