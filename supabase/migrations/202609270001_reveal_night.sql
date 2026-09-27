-- Reveal night: flavor tags, the guessing game, bottle facts on the reveal,
-- bottle pages, and palate insights.
--
-- Additive and safe to apply before or after 202607110003. The app degrades
-- gracefully (hides these features) until this migration is applied.

begin;

-- ── Flavor tags ──────────────────────────────────────────────────────────

alter table public.scores
  add column if not exists flavor_tags text[] not null default '{}';
alter table public.ratings
  add column if not exists flavor_tags text[] not null default '{}';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'scores_flavor_tags_limit') then
    alter table public.scores
      add constraint scores_flavor_tags_limit check (cardinality(flavor_tags) <= 16);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'ratings_flavor_tags_limit') then
    alter table public.ratings
      add constraint ratings_flavor_tags_limit check (cardinality(flavor_tags) <= 16);
  end if;
end
$$;

-- 202607110003 switches scores to column-level grants; keep the new column
-- readable wherever the other score columns are.
grant select (flavor_tags) on public.scores to anon, authenticated;

-- ── Guessing game ────────────────────────────────────────────────────────

alter table public.sessions
  add column if not exists guess_bottles boolean not null default false,
  add column if not exists guess_proof boolean not null default false,
  add column if not exists guess_price boolean not null default false;

create table if not exists public.pour_guesses (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions (id) on delete cascade,
  pour_id uuid not null references public.pours (id) on delete cascade,
  participant_id uuid not null references public.participants (id) on delete cascade,
  bottle_guess text,
  proof_guess numeric,
  price_guess numeric,
  updated_at timestamptz not null default now(),
  constraint pour_guesses_pour_participant_key unique (pour_id, participant_id),
  constraint pour_guesses_bottle_length check (bottle_guess is null or char_length(bottle_guess) <= 200),
  constraint pour_guesses_proof_range check (proof_guess is null or (proof_guess >= 0 and proof_guess <= 200)),
  constraint pour_guesses_price_range check (price_guess is null or (price_guess >= 0 and price_guess <= 100000))
);

create index if not exists pour_guesses_session_id_idx on public.pour_guesses (session_id);

-- Only reachable through the functions below.
alter table public.pour_guesses enable row level security;
revoke all on table public.pour_guesses from anon, authenticated;

-- Same participant check as get_participant_session / save_participant_score.
create or replace function public.participant_is_authorized(
  p_session_id uuid,
  p_participant_id uuid,
  p_access_token uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
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
  );
$$;

revoke all on function public.participant_is_authorized(uuid, uuid, uuid) from public;
grant execute on function public.participant_is_authorized(uuid, uuid, uuid) to anon, authenticated;

-- Guessing settings are not secret: anyone with the session link may read them.
create or replace function public.get_session_guessing(p_session_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'bottles', s.guess_bottles,
    'proof', s.guess_proof,
    'price', s.guess_price
  )
  from public.sessions s
  where s.id = p_session_id;
$$;

revoke all on function public.get_session_guessing(uuid) from public;
grant execute on function public.get_session_guessing(uuid) to anon, authenticated;

create or replace function public.host_set_guessing(
  p_session_id uuid,
  p_settings jsonb,
  p_legacy_host_key text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session public.sessions%rowtype;
begin
  if not public.session_host_is_authorized(p_session_id, p_legacy_host_key) then
    raise exception using errcode = '42501', message = 'Host access denied.';
  end if;

  update public.sessions s
  set guess_bottles = coalesce((p_settings ->> 'bottles')::boolean, s.guess_bottles),
      guess_proof = coalesce((p_settings ->> 'proof')::boolean, s.guess_proof),
      guess_price = coalesce((p_settings ->> 'price')::boolean, s.guess_price)
  where s.id = p_session_id
    and s.status not in ('revealed', 'closed')
  returning * into v_session;

  if not found then
    raise exception using errcode = '55000', message = 'Guessing can only change before the reveal.';
  end if;

  return jsonb_build_object(
    'bottles', v_session.guess_bottles,
    'proof', v_session.guess_proof,
    'price', v_session.guess_price
  );
end;
$$;

revoke all on function public.host_set_guessing(uuid, jsonb, text) from public;
grant execute on function public.host_set_guessing(uuid, jsonb, text) to anon, authenticated;

-- Everything a taster needs to guess: the settings, the lineup as an
-- alphabetical list (never tied to a glass), and their own guesses.
create or replace function public.get_participant_guessing(
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
  v_session public.sessions%rowtype;
begin
  if not public.participant_is_authorized(p_session_id, p_participant_id, p_access_token) then
    raise exception using errcode = '42501', message = 'Participant access denied.';
  end if;

  select * into v_session from public.sessions s where s.id = p_session_id;

  return jsonb_build_object(
    'settings', jsonb_build_object(
      'bottles', v_session.guess_bottles,
      'proof', v_session.guess_proof,
      'price', v_session.guess_price
    ),
    'candidates', case
      when v_session.guess_bottles then coalesce((
        select jsonb_agg(c.name order by lower(c.name))
        from (
          select distinct coalesce(nullif(btrim(po.bottle_name), ''), w.name) as name
          from public.pours po
          left join public.whiskeys w on w.id = po.whiskey_id
          where po.session_id = p_session_id
        ) c
        where c.name is not null
      ), '[]'::jsonb)
      else '[]'::jsonb
    end,
    'guesses', coalesce((
      select jsonb_agg(jsonb_build_object(
        'pour_id', g.pour_id,
        'bottle_guess', g.bottle_guess,
        'proof_guess', g.proof_guess,
        'price_guess', g.price_guess
      ))
      from public.pour_guesses g
      where g.session_id = p_session_id
        and g.participant_id = p_participant_id
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.get_participant_guessing(uuid, uuid, uuid) from public;
grant execute on function public.get_participant_guessing(uuid, uuid, uuid) to anon, authenticated;

create or replace function public.save_participant_guess(
  p_session_id uuid,
  p_pour_id uuid,
  p_participant_id uuid,
  p_access_token uuid,
  p_guess jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session public.sessions%rowtype;
  v_saved public.pour_guesses%rowtype;
  v_bottle text := nullif(left(btrim(coalesce(p_guess ->> 'bottle_guess', '')), 200), '');
  v_proof numeric := nullif(p_guess ->> 'proof_guess', '')::numeric;
  v_price numeric := nullif(p_guess ->> 'price_guess', '')::numeric;
begin
  select * into v_session from public.sessions s where s.id = p_session_id;

  if not found or v_session.status in ('revealed', 'closed') then
    raise exception using errcode = '55000', message = 'Guessing is closed for this session.';
  end if;

  if not public.participant_is_authorized(p_session_id, p_participant_id, p_access_token) then
    raise exception using errcode = '42501', message = 'Participant access denied.';
  end if;

  if not exists (
    select 1 from public.pours po
    where po.id = p_pour_id and po.session_id = p_session_id
  ) then
    raise exception using errcode = '23503', message = 'Pour does not belong to this session.';
  end if;

  if not (v_session.guess_bottles or v_session.guess_proof or v_session.guess_price) then
    raise exception using errcode = '55000', message = 'Guessing is off for this session.';
  end if;

  insert into public.pour_guesses (
    session_id, pour_id, participant_id, bottle_guess, proof_guess, price_guess
  ) values (
    p_session_id,
    p_pour_id,
    p_participant_id,
    case when v_session.guess_bottles then v_bottle end,
    case when v_session.guess_proof then v_proof end,
    case when v_session.guess_price then v_price end
  )
  on conflict (pour_id, participant_id) do update set
    bottle_guess = excluded.bottle_guess,
    proof_guess = excluded.proof_guess,
    price_guess = excluded.price_guess,
    updated_at = now()
  returning * into v_saved;

  return jsonb_build_object(
    'pour_id', v_saved.pour_id,
    'bottle_guess', v_saved.bottle_guess,
    'proof_guess', v_saved.proof_guess,
    'price_guess', v_saved.price_guess
  );
end;
$$;

revoke all on function public.save_participant_guess(uuid, uuid, uuid, uuid, jsonb) from public;
grant execute on function public.save_participant_guess(uuid, uuid, uuid, uuid, jsonb) to anon, authenticated;

-- ── Scores: accept flavor tags ──────────────────────────────────────────
-- Same as 202607110002 plus flavor_tags. Clients that don't send the key
-- keep whatever tags are already stored.

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
  v_has_tags boolean := coalesce(jsonb_typeof(p_score -> 'flavor_tags') = 'array', false);
  v_tags text[] := '{}';
begin
  if v_has_tags then
    select coalesce(array_agg(distinct left(lower(btrim(t.tag)), 32)), '{}')
    into v_tags
    from jsonb_array_elements_text(p_score -> 'flavor_tags') as t(tag)
    where btrim(t.tag) <> '';

    if cardinality(v_tags) > 16 then
      raise exception using errcode = '22023', message = 'Pick at most 16 flavor tags.';
    end if;
  end if;

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
    uniqueness, drinkability, packaging, value, notes, flavor_tags,
    core_locked, core_locked_at, final_locked, final_locked_at
  ) values (
    p_session_id, p_pour_id, p_participant_id,
    v_nose, v_flavor, v_mouthfeel, v_complexity, v_balance, v_finish,
    v_uniqueness, v_drinkability, v_packaging, v_value, v_notes, v_tags,
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
    flavor_tags = case when v_has_tags then excluded.flavor_tags else public.scores.flavor_tags end,
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

-- ── Reveal: bottle facts, guessing settings, and guesses ─────────────────
-- Same as 202607110002 plus: session guessing flags; per-pour whiskey facts
-- (retail prices only — never what the host paid) once names are visible;
-- and everyone's guesses after the big reveal.

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
      'created_at', s.created_at,
      'guess_bottles', s.guess_bottles,
      'guess_proof', s.guess_proof,
      'guess_price', s.guess_price
    ),
    'pours', coalesce((
      select jsonb_agg(
        case
          when not s.is_blind or s.status = 'revealed' then jsonb_build_object(
            'id', po.id,
            'session_id', po.session_id,
            'code', po.code,
            'bottle_name', coalesce(nullif(btrim(po.bottle_name), ''), w.name),
            'sort_order', po.sort_order,
            'whiskey_id', po.whiskey_id,
            'distillery', w.distillery,
            'proof', w.proof,
            'category', w.category,
            'subcategory', w.subcategory,
            'msrp', w.msrp,
            'secondary', w.secondary
          )
          else jsonb_build_object(
            'id', po.id,
            'session_id', po.session_id,
            'code', po.code,
            'bottle_name', null,
            'sort_order', po.sort_order
          )
        end
        order by po.sort_order
      )
      from public.pours po
      left join public.whiskeys w on w.id = po.whiskey_id
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
    end,
    'guesses', case
      when s.status = 'revealed' then coalesce((
        select jsonb_agg(jsonb_build_object(
          'pour_id', g.pour_id,
          'participant_id', g.participant_id,
          'bottle_guess', g.bottle_guess,
          'proof_guess', g.proof_guess,
          'price_guess', g.price_guess
        ))
        from public.pour_guesses g
        where g.session_id = s.id
      ), '[]'::jsonb)
      else '[]'::jsonb
    end
  )
  from public.sessions s
  where s.id = p_session_id;
$$;

revoke all on function public.get_reveal_session(uuid) from public;
grant execute on function public.get_reveal_session(uuid) to anon, authenticated;

-- ── Bottle pages ─────────────────────────────────────────────────────────
-- Aggregate scores for one whiskey across revealed blind tastings and Rate
-- Mode. Averages include everyone; written notes only come from the caller
-- or from people with public profiles.

create or replace function public.get_whiskey_summary(p_whiskey_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with blind as (
    select
      sc.id,
      sc.total::numeric as total,
      sc.notes,
      sc.flavor_tags,
      sc.created_at,
      p.user_id,
      jsonb_build_object(
        'nose', sc.nose, 'flavor', sc.flavor, 'mouthfeel', sc.mouthfeel,
        'complexity', sc.complexity, 'balance', sc.balance, 'finish', sc.finish,
        'uniqueness', sc.uniqueness, 'drinkability', sc.drinkability,
        'packaging', sc.packaging, 'value', sc.value
      ) as by_cat
    from public.scores sc
    join public.pours po on po.id = sc.pour_id
    join public.sessions s on s.id = sc.session_id
    join public.participants p on p.id = sc.participant_id
    where po.whiskey_id = p_whiskey_id
      and s.status = 'revealed'
  ),
  rated as (
    select
      r.id,
      r.total_score as total,
      r.notes,
      r.flavor_tags,
      r.rated_at as created_at,
      r.user_id,
      coalesce((
        select jsonb_object_agg(ti.item_key, (r.scores ->> ti.id::text)::numeric)
        from public.template_items ti
        where ti.template_id = r.template_id
          and r.scores ? ti.id::text
      ), '{}'::jsonb) as by_cat
    from public.ratings r
    where r.whiskey_id = p_whiskey_id
  ),
  entries as (
    select 'blind' as source, * from blind
    union all
    select 'rate' as source, * from rated
  )
  select jsonb_build_object(
    'whiskey', (
      select jsonb_build_object(
        'id', w.id,
        'name', w.name,
        'distillery', w.distillery,
        'proof', w.proof,
        'category', w.category,
        'subcategory', w.subcategory,
        'bottle_size', w.bottle_size,
        'rarity', w.rarity,
        'msrp', w.msrp,
        'secondary', w.secondary
      )
      from public.whiskeys w
      where w.id = p_whiskey_id
    ),
    'stats', jsonb_build_object(
      'count', (select count(*) from entries),
      'blind_count', (select count(*) from blind),
      'rate_count', (select count(*) from rated),
      'avg_total', (select round(avg(total), 1) from entries),
      'categories', coalesce((
        select jsonb_object_agg(k, v)
        from (
          select kv.key as k, round(avg(kv.value::numeric), 2) as v
          from entries e, jsonb_each_text(e.by_cat) kv
          where kv.value ~ '^-?[0-9.]+$'
          group by kv.key
        ) c
      ), '{}'::jsonb),
      'tags', coalesce((
        select jsonb_agg(jsonb_build_object('tag', t.tag, 'count', t.n) order by t.n desc, t.tag)
        from (
          select tag, count(*) as n
          from entries e, unnest(e.flavor_tags) as u(tag)
          group by tag
          order by count(*) desc, tag
          limit 12
        ) t
      ), '[]'::jsonb)
    ),
    'mine', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', e.id, 'source', e.source, 'total', e.total, 'created_at', e.created_at
      ) order by e.created_at desc)
      from entries e
      where auth.uid() is not null and e.user_id = auth.uid()
    ), '[]'::jsonb),
    'notes', coalesce((
      select jsonb_agg(n order by n ->> 'created_at' desc)
      from (
        select jsonb_build_object(
          'author', case
            when e.user_id = auth.uid() then 'You'
            else coalesce(nullif(btrim(pp.display_name), ''), 'Taster')
          end,
          'user_id', case when pp.is_public then e.user_id end,
          'total', e.total,
          'notes', left(e.notes, 600),
          'source', e.source,
          'created_at', e.created_at
        ) as n
        from entries e
        left join public.public_profiles pp on pp.user_id = e.user_id
        where nullif(btrim(e.notes), '') is not null
          and (
            (auth.uid() is not null and e.user_id = auth.uid())
            or coalesce(pp.is_public, false)
          )
        order by e.created_at desc
        limit 20
      ) recent
    ), '[]'::jsonb)
  )
  where exists (select 1 from public.whiskeys w where w.id = p_whiskey_id);
$$;

revoke all on function public.get_whiskey_summary(uuid) from public;
grant execute on function public.get_whiskey_summary(uuid) to anon, authenticated;

-- ── Palate insights for the signed-in user ───────────────────────────────
-- entries: every revealed blind score and Rate Mode rating the caller owns,
-- with bottle facts and (for blind pours) the rest of the table's average.
-- matches: people the caller has tasted alongside, with how closely their
-- scores track the caller's on the same pours.

create or replace function public.get_my_palate()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with my_blind as (
    select sc.*, po.whiskey_id, coalesce(nullif(btrim(po.bottle_name), ''), w.name) as bottle_name
    from public.scores sc
    join public.participants p on p.id = sc.participant_id
    join public.sessions s on s.id = sc.session_id
    join public.pours po on po.id = sc.pour_id
    left join public.whiskeys w on w.id = po.whiskey_id
    where p.user_id = auth.uid()
      and s.status = 'revealed'
  ),
  others as (
    select
      sc.pour_id,
      sc.total,
      coalesce(p.user_id::text, 'guest:' || lower(btrim(p.display_name))) as who,
      p.user_id,
      p.display_name
    from public.scores sc
    join public.participants p on p.id = sc.participant_id
    where sc.pour_id in (select pour_id from my_blind)
      and (p.user_id is null or p.user_id <> auth.uid())
  )
  select jsonb_build_object(
    'entries', coalesce((
      select jsonb_agg(e order by e ->> 'created_at' desc)
      from (
        select jsonb_build_object(
          'source', 'blind',
          'id', b.id,
          'total', b.total,
          'created_at', b.created_at,
          'name', b.bottle_name,
          'whiskey_id', b.whiskey_id,
          'by_cat', jsonb_build_object(
            'nose', b.nose, 'flavor', b.flavor, 'mouthfeel', b.mouthfeel,
            'complexity', b.complexity, 'balance', b.balance, 'finish', b.finish,
            'uniqueness', b.uniqueness, 'drinkability', b.drinkability,
            'packaging', b.packaging, 'value', b.value
          ),
          'tags', to_jsonb(b.flavor_tags),
          'proof', w.proof,
          'distillery', w.distillery,
          'category', w.category,
          'subcategory', w.subcategory,
          'msrp', w.msrp,
          'table_avg', (select round(avg(o.total), 2) from others o where o.pour_id = b.pour_id)
        ) as e
        from my_blind b
        left join public.whiskeys w on w.id = b.whiskey_id

        union all

        select jsonb_build_object(
          'source', 'rate',
          'id', r.id,
          'total', r.total_score,
          'created_at', r.rated_at,
          'name', w.name,
          'whiskey_id', r.whiskey_id,
          'by_cat', coalesce((
            select jsonb_object_agg(ti.item_key, (r.scores ->> ti.id::text)::numeric)
            from public.template_items ti
            where ti.template_id = r.template_id
              and r.scores ? ti.id::text
          ), '{}'::jsonb),
          'tags', to_jsonb(r.flavor_tags),
          'proof', w.proof,
          'distillery', w.distillery,
          'category', w.category,
          'subcategory', w.subcategory,
          'msrp', w.msrp,
          'table_avg', null
        )
        from public.ratings r
        left join public.whiskeys w on w.id = r.whiskey_id
        where auth.uid() is not null
          and r.user_id = auth.uid()
      ) all_entries
    ), '[]'::jsonb),
    'matches', coalesce((
      select jsonb_agg(m order by (m ->> 'shared')::int desc)
      from (
        select jsonb_build_object(
          'who', o.who,
          'user_id', max(o.user_id::text),
          'name', coalesce(
            max(nullif(btrim(pp.display_name), '')),
            max(o.display_name)
          ),
          'shared', count(*),
          'correlation', round(corr(b.total, o.total)::numeric, 3),
          'mean_abs_diff', round(avg(abs(b.total - o.total))::numeric, 2)
        ) as m
        from my_blind b
        join others o on o.pour_id = b.pour_id
        left join public.public_profiles pp on pp.user_id = o.user_id and pp.is_public
        group by o.who
        having count(*) >= 3
      ) grouped
    ), '[]'::jsonb)
  )
  where auth.uid() is not null;
$$;

revoke all on function public.get_my_palate() from public;
grant execute on function public.get_my_palate() to authenticated;

commit;
