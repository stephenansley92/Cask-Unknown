begin;

alter table public.whiskeys enable row level security;

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
