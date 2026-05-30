-- Make hosted sessions durable across devices.
-- Existing sessions remain accessible by their host_key; new sessions should set host_user_id.

alter table public.sessions
  add column if not exists host_user_id uuid references auth.users(id) on delete set null;

create index if not exists sessions_host_user_id_created_at_idx
  on public.sessions (host_user_id, created_at desc);

drop policy if exists "sessions_insert_auth" on public.sessions;
create policy "sessions_insert_auth" on public.sessions
  for insert to authenticated
  with check (host_user_id = auth.uid());

drop policy if exists "sessions_update_auth" on public.sessions;
create policy "sessions_update_auth" on public.sessions
  for update to authenticated
  using (host_user_id is null or host_user_id = auth.uid())
  with check (host_user_id is null or host_user_id = auth.uid());

drop policy if exists "sessions_delete_auth" on public.sessions;
create policy "sessions_delete_auth" on public.sessions
  for delete to authenticated
  using (host_user_id is null or host_user_id = auth.uid());
