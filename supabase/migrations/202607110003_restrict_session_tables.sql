-- Revoke the permissive session policies only after the application has been
-- deployed with the RPC cutover in 202607110002_session_api.sql.

begin;

-- The additive API accepts both legacy plaintext keys and these hashes, so
-- this conversion is safe only after the RPC-based client is deployed.
update public.sessions
set host_key = 'sha256:' || encode(extensions.digest(host_key, 'sha256'), 'hex')
where host_key not like 'sha256:%';

do $$
declare
  v_policy record;
begin
  for v_policy in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and tablename in ('sessions', 'pours', 'participants', 'scores')
  loop
    execute format(
      'drop policy if exists %I on %I.%I',
      v_policy.policyname,
      v_policy.schemaname,
      v_policy.tablename
    );
  end loop;
end
$$;

alter table public.sessions enable row level security;
alter table public.pours enable row level security;
alter table public.participants enable row level security;
alter table public.scores enable row level security;

create policy sessions_read_safe_metadata
on public.sessions
for select
to anon, authenticated
using (true);

create policy pours_read_revealed_or_host
on public.pours
for select
to anon, authenticated
using (
  exists (
    select 1
    from public.sessions s
    where s.id = pours.session_id
      and (
        not s.is_blind
        or s.status = 'revealed'
        or s.host_user_id = auth.uid()
      )
  )
);

create policy participants_read_revealed_own_or_host
on public.participants
for select
to anon, authenticated
using (
  user_id = auth.uid()
  or exists (
    select 1
    from public.sessions s
    where s.id = participants.session_id
      and (s.status = 'revealed' or s.host_user_id = auth.uid())
  )
);

create policy participants_delete_own
on public.participants
for delete
to authenticated
using (user_id = auth.uid());

create policy scores_read_revealed_own_or_host
on public.scores
for select
to anon, authenticated
using (
  exists (
    select 1
    from public.sessions s
    where s.id = scores.session_id
      and (s.status = 'revealed' or s.host_user_id = auth.uid())
  )
  or exists (
    select 1
    from public.participants p
    where p.id = scores.participant_id
      and p.user_id = auth.uid()
  )
);

create policy scores_delete_own
on public.scores
for delete
to authenticated
using (
  exists (
    select 1
    from public.participants p
    where p.id = scores.participant_id
      and p.user_id = auth.uid()
  )
);

revoke all on table public.sessions from anon, authenticated;
revoke all on table public.pours from anon, authenticated;
revoke all on table public.participants from anon, authenticated;
revoke all on table public.scores from anon, authenticated;

grant select (id, title, is_blind, status, created_at)
  on public.sessions to anon;
grant select (id, title, is_blind, status, created_at)
  on public.sessions to authenticated;

grant select (id, session_id, code, bottle_name, sort_order, label, whiskey_id, created_at)
  on public.pours to anon, authenticated;

grant select (id, session_id, display_name, user_id, created_at)
  on public.participants to anon, authenticated;
grant delete on public.participants to authenticated;

grant select (
  id, session_id, pour_id, participant_id,
  nose, flavor, mouthfeel, complexity, balance, finish,
  uniqueness, drinkability, packaging, value, total, notes,
  core_locked, core_locked_at, final_locked, final_locked_at, created_at
) on public.scores to anon, authenticated;
grant delete on public.scores to authenticated;

-- Added by 202609270001_reveal_night.sql; keep it readable if that
-- migration was applied first.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'scores' and column_name = 'flavor_tags'
  ) then
    grant select (flavor_tags) on public.scores to anon, authenticated;
  end if;
end
$$;

revoke all on function public.enforce_participant_user_id_owner() from anon, authenticated;
revoke all on function public.scores_compute_total() from anon, authenticated;

commit;
