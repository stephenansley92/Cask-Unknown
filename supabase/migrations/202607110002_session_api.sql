-- Narrow session APIs used before the permissive table policies are revoked.
-- Every SECURITY DEFINER function pins search_path and verifies its caller.

begin;

create or replace function public.session_host_is_authorized(
  p_session_id uuid,
  p_legacy_host_key text default null
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.sessions s
    where s.id = p_session_id
      and (
        (s.host_user_id is not null and s.host_user_id = auth.uid())
        or (
          s.host_user_id is null
          and p_legacy_host_key is not null
          and (
            s.host_key = p_legacy_host_key
            or s.host_key = 'sha256:' || encode(extensions.digest(p_legacy_host_key, 'sha256'), 'hex')
          )
        )
      )
  );
$$;

revoke all on function public.session_host_is_authorized(uuid, text) from public;
grant execute on function public.session_host_is_authorized(uuid, text) to anon, authenticated;

create or replace function public.get_public_session(p_session_id uuid)
returns table (
  id uuid,
  title text,
  is_blind boolean,
  status text,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select s.id, s.title, s.is_blind, s.status, s.created_at
  from public.sessions s
  where s.id = p_session_id;
$$;

revoke all on function public.get_public_session(uuid) from public;
grant execute on function public.get_public_session(uuid) to anon, authenticated;

create or replace function public.get_reveal_session(p_session_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'session', jsonb_build_object(
      'id', s.id,
      'title', s.title,
      'is_blind', s.is_blind,
      'status', s.status,
      'created_at', s.created_at
    ),
    'pours', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', po.id,
          'session_id', po.session_id,
          'code', po.code,
          'bottle_name', case
            when not s.is_blind or s.status = 'revealed' then po.bottle_name
            else null
          end,
          'sort_order', po.sort_order
        ) order by po.sort_order
      )
      from public.pours po
      where po.session_id = s.id
    ), '[]'::jsonb),
    'participants', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', case
            when s.status = 'revealed' then p.id::text
            else encode(extensions.digest(p.id::text, 'sha256'), 'hex')
          end,
          'session_id', p.session_id,
          'display_name', case when s.status = 'revealed' then p.display_name else 'Taster' end
        ) order by p.created_at
      )
      from public.participants p
      where p.session_id = s.id
    ), '[]'::jsonb),
    'scores', case
      when s.status = 'revealed' then coalesce((
        select jsonb_agg(to_jsonb(sc) order by sc.created_at)
        from public.scores sc
        where sc.session_id = s.id
      ), '[]'::jsonb)
      else '[]'::jsonb
    end
  )
  from public.sessions s
  where s.id = p_session_id;
$$;

revoke all on function public.get_reveal_session(uuid) from public;
grant execute on function public.get_reveal_session(uuid) to anon, authenticated;

create or replace function public.create_hosted_session(
  p_title text,
  p_is_blind boolean default true
)
returns table (id uuid, host_key text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_title text := btrim(p_title);
  v_host_key text := encode(extensions.gen_random_bytes(32), 'hex');
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication required.';
  end if;

  if v_title = '' or char_length(v_title) > 120 then
    raise exception using errcode = '22023', message = 'Title must be between 1 and 120 characters.';
  end if;

  return query
  insert into public.sessions (title, host_key, is_blind, status, host_user_id)
  values (
    v_title,
    'sha256:' || encode(extensions.digest(v_host_key, 'sha256'), 'hex'),
    p_is_blind,
    'setup',
    v_user_id
  )
  returning public.sessions.id, v_host_key;
end;
$$;

revoke all on function public.create_hosted_session(text, boolean) from public;
grant execute on function public.create_hosted_session(text, boolean) to authenticated;

create or replace function public.list_hosted_sessions()
returns table (
  id uuid,
  title text,
  status text,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select s.id, s.title, s.status, s.created_at
  from public.sessions s
  where s.host_user_id = auth.uid()
  order by s.created_at desc;
$$;

revoke all on function public.list_hosted_sessions() from public;
grant execute on function public.list_hosted_sessions() to authenticated;

create or replace function public.resume_session_participant(
  p_session_id uuid,
  p_participant_id uuid,
  p_access_token uuid
)
returns table (
  id uuid,
  session_id uuid,
  display_name text,
  user_id uuid,
  access_token uuid,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.session_id, p.display_name, p.user_id, p.access_token, p.created_at
  from public.participants p
  join public.sessions s on s.id = p.session_id
  where p.session_id = p_session_id
    and p.id = p_participant_id
    and (
      p.access_token = p_access_token
      or (p.user_id is not null and p.user_id = auth.uid())
      or (s.host_user_id is null and p.id = p_access_token)
    );
$$;

revoke all on function public.resume_session_participant(uuid, uuid, uuid) from public;
grant execute on function public.resume_session_participant(uuid, uuid, uuid) to anon, authenticated;

create or replace function public.join_session(
  p_session_id uuid,
  p_display_name text
)
returns table (
  id uuid,
  session_id uuid,
  display_name text,
  user_id uuid,
  access_token uuid,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text := btrim(p_display_name);
  v_status text;
  v_user_id uuid := auth.uid();
  v_participant public.participants%rowtype;
begin
  if v_name = '' or char_length(v_name) > 80 then
    raise exception using errcode = '22023', message = 'Display name must be between 1 and 80 characters.';
  end if;

  select s.status into v_status
  from public.sessions s
  where s.id = p_session_id;

  if not found then
    raise exception using errcode = 'P0002', message = 'Session not found.';
  end if;

  if v_status in ('revealed', 'closed') then
    raise exception using errcode = '55000', message = 'This session is no longer accepting participants.';
  end if;

  if v_user_id is not null then
    select p.* into v_participant
    from public.participants p
    where p.session_id = p_session_id
      and p.user_id = v_user_id;

    if not found then
      update public.participants p
      set user_id = v_user_id
      where p.session_id = p_session_id
        and p.user_id is null
        and lower(btrim(p.display_name)) = lower(v_name)
      returning p.* into v_participant;
    end if;
  end if;

  if v_participant.id is null then
    if v_user_id is null and exists (
      select 1 from public.participants p
      where p.session_id = p_session_id
        and lower(btrim(p.display_name)) = lower(v_name)
    ) then
      raise exception using errcode = '23505', message = 'That display name is already in use for this session.';
    end if;

    insert into public.participants (session_id, display_name, user_id)
    values (p_session_id, v_name, v_user_id)
    returning * into v_participant;
  end if;

  return query
  select
    v_participant.id,
    v_participant.session_id,
    v_participant.display_name,
    v_participant.user_id,
    v_participant.access_token,
    v_participant.created_at;
end;
$$;

revoke all on function public.join_session(uuid, text) from public;
grant execute on function public.join_session(uuid, text) to anon, authenticated;

create or replace function public.get_participant_session(
  p_session_id uuid,
  p_participant_id uuid,
  p_access_token uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_allowed boolean;
  v_result jsonb;
begin
  select exists (
    select 1
    from public.participants p
    join public.sessions s on s.id = p.session_id
    where p.id = p_participant_id
      and p.session_id = p_session_id
      and (
        p.access_token = p_access_token
        or (p.user_id is not null and p.user_id = auth.uid())
        or (s.host_user_id is null and p.id = p_access_token)
      )
  ) into v_allowed;

  if not v_allowed then
    raise exception using errcode = '42501', message = 'Participant access denied.';
  end if;

  select jsonb_build_object(
    'session', (
      select jsonb_build_object(
        'id', s.id,
        'title', s.title,
        'is_blind', s.is_blind,
        'status', s.status
      )
      from public.sessions s
      where s.id = p_session_id
    ),
    'participant', (
      select jsonb_build_object(
        'id', p.id,
        'session_id', p.session_id,
        'display_name', p.display_name
      )
      from public.participants p
      where p.id = p_participant_id
    ),
    'pours', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', po.id,
          'session_id', po.session_id,
          'code', po.code,
          'sort_order', po.sort_order
        ) order by po.sort_order
      )
      from public.pours po
      where po.session_id = p_session_id
    ), '[]'::jsonb),
    'scores', coalesce((
      select jsonb_agg(to_jsonb(sc) order by sc.created_at)
      from public.scores sc
      where sc.session_id = p_session_id
        and sc.participant_id = p_participant_id
    ), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;

revoke all on function public.get_participant_session(uuid, uuid, uuid) from public;
grant execute on function public.get_participant_session(uuid, uuid, uuid) to anon, authenticated;

create or replace function public.save_participant_score(
  p_session_id uuid,
  p_pour_id uuid,
  p_participant_id uuid,
  p_access_token uuid,
  p_score jsonb,
  p_lock_core boolean default false,
  p_lock_final boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session public.sessions%rowtype;
  v_participant public.participants%rowtype;
  v_existing public.scores%rowtype;
  v_saved public.scores%rowtype;
  v_nose integer := coalesce((p_score ->> 'nose')::integer, 0);
  v_flavor integer := coalesce((p_score ->> 'flavor')::integer, 0);
  v_mouthfeel integer := coalesce((p_score ->> 'mouthfeel')::integer, 0);
  v_complexity integer := coalesce((p_score ->> 'complexity')::integer, 0);
  v_balance integer := coalesce((p_score ->> 'balance')::integer, 0);
  v_finish integer := coalesce((p_score ->> 'finish')::integer, 0);
  v_uniqueness integer := coalesce((p_score ->> 'uniqueness')::integer, 0);
  v_drinkability integer := coalesce((p_score ->> 'drinkability')::integer, 0);
  v_packaging integer := coalesce((p_score ->> 'packaging')::integer, 0);
  v_value integer := coalesce((p_score ->> 'value')::integer, 0);
  v_notes text := left(coalesce(p_score ->> 'notes', ''), 4000);
begin
  select * into v_session
  from public.sessions s
  where s.id = p_session_id;

  if not found or v_session.status in ('revealed', 'closed') then
    raise exception using errcode = '55000', message = 'Scoring is closed for this session.';
  end if;

  select * into v_participant
  from public.participants p
  where p.id = p_participant_id
    and p.session_id = p_session_id
    and (
      p.access_token = p_access_token
      or (p.user_id is not null and p.user_id = auth.uid())
      or (v_session.host_user_id is null and p.id = p_access_token)
    );

  if not found then
    raise exception using errcode = '42501', message = 'Participant access denied.';
  end if;

  if not exists (
    select 1 from public.pours po
    where po.id = p_pour_id and po.session_id = p_session_id
  ) then
    raise exception using errcode = '23503', message = 'Pour does not belong to this session.';
  end if;

  select * into v_existing
  from public.scores sc
  where sc.pour_id = p_pour_id
    and sc.participant_id = p_participant_id
  for update;

  if v_existing.final_locked then
    raise exception using errcode = '55000', message = 'This score is final and cannot be changed.';
  end if;

  if v_existing.core_locked and (
    v_existing.nose <> v_nose
    or v_existing.flavor <> v_flavor
    or v_existing.mouthfeel <> v_mouthfeel
    or v_existing.complexity <> v_complexity
    or v_existing.balance <> v_balance
    or v_existing.finish <> v_finish
    or v_existing.uniqueness <> v_uniqueness
    or v_existing.drinkability <> v_drinkability
  ) then
    raise exception using errcode = '55000', message = 'Core scores are locked.';
  end if;

  if v_session.status = 'reveal_ready' and not coalesce(v_existing.core_locked, false) then
    raise exception using errcode = '55000', message = 'Core scores must be locked before final scoring.';
  end if;

  if p_lock_final and v_session.status <> 'reveal_ready' then
    raise exception using errcode = '55000', message = 'Final scores can only be locked during soft reveal.';
  end if;

  insert into public.scores (
    session_id, pour_id, participant_id,
    nose, flavor, mouthfeel, complexity, balance, finish,
    uniqueness, drinkability, packaging, value, notes,
    core_locked, core_locked_at, final_locked, final_locked_at
  ) values (
    p_session_id, p_pour_id, p_participant_id,
    v_nose, v_flavor, v_mouthfeel, v_complexity, v_balance, v_finish,
    v_uniqueness, v_drinkability, v_packaging, v_value, v_notes,
    p_lock_core or p_lock_final,
    case when p_lock_core or p_lock_final then now() else null end,
    p_lock_final,
    case when p_lock_final then now() else null end
  )
  on conflict (pour_id, participant_id) do update set
    nose = excluded.nose,
    flavor = excluded.flavor,
    mouthfeel = excluded.mouthfeel,
    complexity = excluded.complexity,
    balance = excluded.balance,
    finish = excluded.finish,
    uniqueness = excluded.uniqueness,
    drinkability = excluded.drinkability,
    packaging = excluded.packaging,
    value = excluded.value,
    notes = excluded.notes,
    core_locked = public.scores.core_locked or excluded.core_locked,
    core_locked_at = coalesce(public.scores.core_locked_at, excluded.core_locked_at),
    final_locked = public.scores.final_locked or excluded.final_locked,
    final_locked_at = coalesce(public.scores.final_locked_at, excluded.final_locked_at)
  returning * into v_saved;

  return to_jsonb(v_saved);
end;
$$;

revoke all on function public.save_participant_score(uuid, uuid, uuid, uuid, jsonb, boolean, boolean) from public;
grant execute on function public.save_participant_score(uuid, uuid, uuid, uuid, jsonb, boolean, boolean) to anon, authenticated;

create or replace function public.get_host_session(
  p_session_id uuid,
  p_legacy_host_key text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
begin
  if not public.session_host_is_authorized(p_session_id, p_legacy_host_key) then
    raise exception using errcode = '42501', message = 'Host access denied.';
  end if;

  select jsonb_build_object(
    'session', jsonb_build_object(
      'id', s.id,
      'title', s.title,
      'is_blind', s.is_blind,
      'status', s.status,
      'created_at', s.created_at
    ),
    'pours', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', po.id,
          'session_id', po.session_id,
          'code', po.code,
          'bottle_name', po.bottle_name,
          'whiskey_id', po.whiskey_id,
          'whiskey_name', w.name,
          'sort_order', po.sort_order
        ) order by po.sort_order
      )
      from public.pours po
      left join public.whiskeys w on w.id = po.whiskey_id
      where po.session_id = s.id
    ), '[]'::jsonb),
    'participants', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', p.id,
          'session_id', p.session_id,
          'display_name', p.display_name,
          'user_id', p.user_id,
          'created_at', p.created_at
        ) order by p.created_at
      )
      from public.participants p
      where p.session_id = s.id
    ), '[]'::jsonb),
    'scores', coalesce((
      select jsonb_agg(to_jsonb(sc) order by sc.created_at)
      from public.scores sc
      where sc.session_id = s.id
    ), '[]'::jsonb)
  ) into v_result
  from public.sessions s
  where s.id = p_session_id;

  return v_result;
end;
$$;

revoke all on function public.get_host_session(uuid, text) from public;
grant execute on function public.get_host_session(uuid, text) to anon, authenticated;

create or replace function public.host_set_session_status(
  p_session_id uuid,
  p_status text,
  p_legacy_host_key text default null
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.session_host_is_authorized(p_session_id, p_legacy_host_key) then
    raise exception using errcode = '42501', message = 'Host access denied.';
  end if;

  if p_status not in ('setup', 'scoring', 'reveal_ready', 'revealed', 'closed') then
    raise exception using errcode = '22023', message = 'Invalid session status.';
  end if;

  update public.sessions set status = p_status where id = p_session_id;
  return p_status;
end;
$$;

revoke all on function public.host_set_session_status(uuid, text, text) from public;
grant execute on function public.host_set_session_status(uuid, text, text) to anon, authenticated;

create or replace function public.host_unlock_scores(
  p_session_id uuid,
  p_legacy_host_key text default null
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  if not public.session_host_is_authorized(p_session_id, p_legacy_host_key) then
    raise exception using errcode = '42501', message = 'Host access denied.';
  end if;

  if exists (
    select 1 from public.sessions s
    where s.id = p_session_id and s.status = 'revealed'
  ) then
    raise exception using errcode = '55000', message = 'Scores stay locked after reveal.';
  end if;

  update public.scores
  set core_locked = false,
      core_locked_at = null,
      final_locked = false,
      final_locked_at = null
  where session_id = p_session_id;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.host_unlock_scores(uuid, text) from public;
grant execute on function public.host_unlock_scores(uuid, text) to anon, authenticated;

create or replace function public.host_upsert_pours(
  p_session_id uuid,
  p_rows jsonb,
  p_legacy_host_key text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row jsonb;
  v_id uuid;
  v_whiskey_id uuid;
  v_result jsonb := '[]'::jsonb;
  v_saved public.pours%rowtype;
begin
  if not public.session_host_is_authorized(p_session_id, p_legacy_host_key) then
    raise exception using errcode = '42501', message = 'Host access denied.';
  end if;

  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 50 then
    raise exception using errcode = '22023', message = 'Pours must be an array of at most 50 rows.';
  end if;

  for v_row in select value from jsonb_array_elements(p_rows)
  loop
    v_id := nullif(v_row ->> 'id', '')::uuid;
    v_whiskey_id := nullif(v_row ->> 'whiskey_id', '')::uuid;

    if v_whiskey_id is not null and not exists (
      select 1 from public.whiskeys w
      where w.id = v_whiskey_id and w.user_id = auth.uid()
    ) then
      raise exception using errcode = '42501', message = 'Whiskey access denied.';
    end if;

    if v_id is null then
      insert into public.pours (session_id, code, bottle_name, whiskey_id, sort_order)
      values (
        p_session_id,
        btrim(v_row ->> 'code'),
        nullif(btrim(v_row ->> 'bottle_name'), ''),
        v_whiskey_id,
        coalesce((v_row ->> 'sort_order')::integer, 0)
      )
      returning * into v_saved;
    else
      update public.pours
      set bottle_name = nullif(btrim(v_row ->> 'bottle_name'), ''),
          whiskey_id = v_whiskey_id
      where id = v_id and session_id = p_session_id
      returning * into v_saved;

      if not found then
        raise exception using errcode = 'P0002', message = 'Pour not found.';
      end if;
    end if;

    v_result := v_result || jsonb_build_array(to_jsonb(v_saved));
  end loop;

  return v_result;
end;
$$;

revoke all on function public.host_upsert_pours(uuid, jsonb, text) from public;
grant execute on function public.host_upsert_pours(uuid, jsonb, text) to anon, authenticated;

create or replace function public.host_delete_pour(
  p_session_id uuid,
  p_pour_id uuid,
  p_legacy_host_key text default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.session_host_is_authorized(p_session_id, p_legacy_host_key) then
    raise exception using errcode = '42501', message = 'Host access denied.';
  end if;

  delete from public.pours where id = p_pour_id and session_id = p_session_id;
  return found;
end;
$$;

revoke all on function public.host_delete_pour(uuid, uuid, text) from public;
grant execute on function public.host_delete_pour(uuid, uuid, text) to anon, authenticated;

create or replace function public.host_delete_participant(
  p_session_id uuid,
  p_participant_id uuid,
  p_legacy_host_key text default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.session_host_is_authorized(p_session_id, p_legacy_host_key) then
    raise exception using errcode = '42501', message = 'Host access denied.';
  end if;

  delete from public.participants
  where id = p_participant_id and session_id = p_session_id;
  return found;
end;
$$;

revoke all on function public.host_delete_participant(uuid, uuid, text) from public;
grant execute on function public.host_delete_participant(uuid, uuid, text) to anon, authenticated;

commit;
