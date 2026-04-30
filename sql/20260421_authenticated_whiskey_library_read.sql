begin;

alter table public.whiskeys enable row level security;

grant select on table public.whiskeys to authenticated;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'whiskeys'
      and policyname = 'whiskeys_select_all_authenticated'
  ) then
    create policy whiskeys_select_all_authenticated
      on public.whiskeys
      for select
      to authenticated
      using (true);
  end if;
end
$$;

commit;
