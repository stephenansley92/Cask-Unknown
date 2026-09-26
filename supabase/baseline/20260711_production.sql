-- Canonical data-free baseline captured from production on 2026-07-11.
-- Apply this once to a fresh Supabase project, then apply files in supabase/migrations in order.
-- Never apply this baseline over an existing database.

begin;

create extension if not exists pgcrypto with schema extensions;
create extension if not exists "uuid-ossp" with schema extensions;

create table public."participants" (
  "id" uuid default gen_random_uuid() not null,
  "session_id" uuid not null,
  "display_name" text not null,
  "created_at" timestamp with time zone default now() not null,
  "user_id" uuid
);

create table public."pours" (
  "id" uuid default gen_random_uuid() not null,
  "session_id" uuid not null,
  "code" text not null,
  "bottle_name" text,
  "sort_order" integer default 0 not null,
  "created_at" timestamp with time zone default now() not null,
  "label" text,
  "whiskey_id" uuid
);

create table public."public_profiles" (
  "user_id" uuid not null,
  "display_name" text,
  "is_public" boolean default true not null,
  "created_at" timestamp with time zone default now() not null
);

create table public."ratings" (
  "id" uuid default gen_random_uuid() not null,
  "user_id" uuid not null,
  "whiskey_id" uuid not null,
  "template_id" uuid not null,
  "scores" jsonb default '{}'::jsonb not null,
  "total_score" numeric default 0 not null,
  "notes" text,
  "rated_at" timestamp with time zone default now() not null,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null
);

create table public."scores" (
  "id" uuid default gen_random_uuid() not null,
  "session_id" uuid not null,
  "pour_id" uuid not null,
  "participant_id" uuid not null,
  "nose" integer default 0 not null,
  "flavor" integer default 0 not null,
  "mouthfeel" integer default 0 not null,
  "complexity" integer default 0 not null,
  "balance" integer default 0 not null,
  "finish" integer default 0 not null,
  "uniqueness" integer default 0 not null,
  "drinkability" integer default 0 not null,
  "packaging" integer default 0 not null,
  "value" integer default 0 not null,
  "total" integer default 0 not null,
  "created_at" timestamp with time zone default now() not null,
  "notes" text,
  "core_locked" boolean default false not null,
  "core_locked_at" timestamp with time zone,
  "final_locked" boolean default false not null,
  "final_locked_at" timestamp with time zone
);

create table public."sessions" (
  "id" uuid default gen_random_uuid() not null,
  "title" text not null,
  "host_key" text not null,
  "is_blind" boolean default true not null,
  "status" text default 'setup'::text not null,
  "created_at" timestamp with time zone default now() not null,
  "host_user_id" uuid
);

create table public."signup_events" (
  "id" uuid default gen_random_uuid() not null,
  "created_at" timestamp with time zone default now() not null,
  "new_user_id" uuid not null,
  "new_user_email" text
);

create table public."template_items" (
  "id" uuid default gen_random_uuid() not null,
  "template_id" uuid not null,
  "item_key" text not null,
  "label" text not null,
  "max_score" integer not null,
  "sort_order" integer default 1 not null,
  "created_at" timestamp with time zone default now() not null
);

create table public."templates" (
  "id" uuid default gen_random_uuid() not null,
  "user_id" uuid not null,
  "name" text not null,
  "description" text,
  "is_default" boolean default false not null,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null
);

create table public."user_profiles" (
  "user_id" uuid not null,
  "email" text not null,
  "display_name" text not null,
  "created_at" timestamp with time zone default now() not null
);

create table public."whiskeys" (
  "id" uuid default gen_random_uuid() not null,
  "user_id" uuid not null,
  "name" text not null,
  "distillery" text,
  "expression" text,
  "category" text,
  "proof" numeric,
  "notes" text,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null,
  "bottle_size" text,
  "subcategory" text,
  "rarity" text,
  "msrp" numeric,
  "secondary" numeric,
  "paid" numeric,
  "status" text,
  "identity_key" text
);

alter table public."participants" add constraint "participants_pkey" PRIMARY KEY (id);
alter table public."pours" add constraint "pours_pkey" PRIMARY KEY (id);
alter table public."pours" add constraint "pours_session_id_code_key" UNIQUE (session_id, code);
alter table public."public_profiles" add constraint "public_profiles_pkey" PRIMARY KEY (user_id);
alter table public."ratings" add constraint "ratings_pkey" PRIMARY KEY (id);
alter table public."ratings" add constraint "ratings_scores_is_object" CHECK (jsonb_typeof(scores) = 'object'::text);
alter table public."ratings" add constraint "ratings_total_score_non_negative" CHECK (total_score >= 0::numeric);
alter table public."scores" add constraint "scores_pkey" PRIMARY KEY (id);
alter table public."scores" add constraint "scores_pour_id_participant_id_key" UNIQUE (pour_id, participant_id);
alter table public."scores" add constraint "scores_ranges_check" CHECK (nose >= 0 AND nose <= 10 AND flavor >= 0 AND flavor <= 20 AND mouthfeel >= 0 AND mouthfeel <= 10 AND complexity >= 0 AND complexity <= 10 AND balance >= 0 AND balance <= 10 AND finish >= 0 AND finish <= 10 AND uniqueness >= 0 AND uniqueness <= 10 AND drinkability >= 0 AND drinkability <= 10 AND packaging >= 0 AND packaging <= 5 AND value >= 0 AND value <= 5 AND total >= 0 AND total <= 100);
alter table public."sessions" add constraint "sessions_pkey" PRIMARY KEY (id);
alter table public."sessions" add constraint "sessions_status_check" CHECK (status = ANY (ARRAY['setup'::text, 'scoring'::text, 'reveal_ready'::text, 'revealed'::text, 'closed'::text]));
alter table public."signup_events" add constraint "signup_events_pkey" PRIMARY KEY (id);
alter table public."template_items" add constraint "template_items_key_not_blank" CHECK (btrim(item_key) <> ''::text);
alter table public."template_items" add constraint "template_items_label_not_blank" CHECK (btrim(label) <> ''::text);
alter table public."template_items" add constraint "template_items_max_score_positive" CHECK (max_score > 0);
alter table public."template_items" add constraint "template_items_pkey" PRIMARY KEY (id);
alter table public."template_items" add constraint "template_items_sort_order_positive" CHECK (sort_order > 0);
alter table public."template_items" add constraint "template_items_template_key_unique" UNIQUE (template_id, item_key);
alter table public."template_items" add constraint "template_items_template_sort_unique" UNIQUE (template_id, sort_order);
alter table public."templates" add constraint "templates_name_not_blank" CHECK (btrim(name) <> ''::text);
alter table public."templates" add constraint "templates_pkey" PRIMARY KEY (id);
alter table public."user_profiles" add constraint "user_profiles_pkey" PRIMARY KEY (user_id);
alter table public."whiskeys" add constraint "whiskeys_name_not_blank" CHECK (btrim(name) <> ''::text);
alter table public."whiskeys" add constraint "whiskeys_pkey" PRIMARY KEY (id);
alter table public."participants" add constraint "participants_session_id_fkey" FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE;
alter table public."participants" add constraint "participants_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table public."pours" add constraint "pours_session_id_fkey" FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE;
alter table public."pours" add constraint "pours_whiskey_id_fkey" FOREIGN KEY (whiskey_id) REFERENCES whiskeys(id) ON DELETE SET NULL;
alter table public."public_profiles" add constraint "public_profiles_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public."ratings" add constraint "ratings_template_id_fkey" FOREIGN KEY (template_id) REFERENCES templates(id) ON DELETE RESTRICT;
alter table public."ratings" add constraint "ratings_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public."ratings" add constraint "ratings_whiskey_id_fkey" FOREIGN KEY (whiskey_id) REFERENCES whiskeys(id) ON DELETE RESTRICT;
alter table public."scores" add constraint "scores_participant_id_fkey" FOREIGN KEY (participant_id) REFERENCES participants(id) ON DELETE CASCADE;
alter table public."scores" add constraint "scores_pour_id_fkey" FOREIGN KEY (pour_id) REFERENCES pours(id) ON DELETE CASCADE;
alter table public."scores" add constraint "scores_session_id_fkey" FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE;
alter table public."sessions" add constraint "sessions_host_user_id_fkey" FOREIGN KEY (host_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table public."signup_events" add constraint "signup_events_new_user_id_fkey" FOREIGN KEY (new_user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public."template_items" add constraint "template_items_template_id_fkey" FOREIGN KEY (template_id) REFERENCES templates(id) ON DELETE CASCADE;
alter table public."templates" add constraint "templates_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public."user_profiles" add constraint "user_profiles_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public."whiskeys" add constraint "whiskeys_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

CREATE INDEX participants_session_id_idx ON public.participants USING btree (session_id);
CREATE INDEX participants_session_user_id_idx ON public.participants USING btree (session_id, user_id);
CREATE INDEX participants_user_id_idx ON public.participants USING btree (user_id);
CREATE INDEX pours_session_id_idx ON public.pours USING btree (session_id);
CREATE UNIQUE INDEX pours_session_label_unique ON public.pours USING btree (session_id, label);
CREATE INDEX pours_whiskey_id_idx ON public.pours USING btree (whiskey_id);
CREATE INDEX ratings_template_id_idx ON public.ratings USING btree (template_id);
CREATE INDEX ratings_user_id_rated_at_idx ON public.ratings USING btree (user_id, rated_at DESC);
CREATE INDEX ratings_whiskey_id_idx ON public.ratings USING btree (whiskey_id);
CREATE INDEX scores_participant_id_idx ON public.scores USING btree (participant_id);
CREATE INDEX scores_pour_id_idx ON public.scores USING btree (pour_id);
CREATE INDEX scores_session_id_idx ON public.scores USING btree (session_id);
CREATE INDEX sessions_host_user_id_created_at_idx ON public.sessions USING btree (host_user_id, created_at DESC);
CREATE INDEX template_items_template_id_sort_idx ON public.template_items USING btree (template_id, sort_order);
CREATE UNIQUE INDEX templates_one_default_per_user_idx ON public.templates USING btree (user_id) WHERE (is_default = true);
CREATE INDEX templates_user_id_idx ON public.templates USING btree (user_id);
CREATE INDEX whiskeys_distillery_search_idx_global ON public.whiskeys USING btree (lower(distillery));
CREATE INDEX whiskeys_identity_key_lookup_idx ON public.whiskeys USING btree (identity_key) WHERE ((identity_key IS NOT NULL) AND (identity_key <> ''::text));
CREATE INDEX whiskeys_name_search_idx_global ON public.whiskeys USING btree (lower(name));
CREATE INDEX whiskeys_user_distillery_search_idx ON public.whiskeys USING btree (user_id, lower(distillery));
CREATE INDEX whiskeys_user_id_idx ON public.whiskeys USING btree (user_id);
CREATE UNIQUE INDEX whiskeys_user_identity_key_uidx ON public.whiskeys USING btree (user_id, identity_key) WHERE ((identity_key IS NOT NULL) AND (identity_key <> ''::text));
CREATE INDEX whiskeys_user_name_search_idx ON public.whiskeys USING btree (user_id, lower(name));

CREATE OR REPLACE FUNCTION public.enforce_participant_user_id_owner()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if new.user_id is null then
    return new;
  end if;

  if public.is_owner_admin() then
    return new;
  end if;

  if auth.uid() is null then
    raise exception 'Authentication required when setting participant user_id.';
  end if;

  if new.user_id is distinct from auth.uid() then
    raise exception 'participant.user_id must match authenticated user.';
  end if;

  if tg_op = 'UPDATE'
     and old.user_id is not null
     and old.user_id is distinct from new.user_id then
    raise exception 'participant.user_id cannot be reassigned.';
  end if;

  return new;
end;
$function$;

revoke all on function public."enforce_participant_user_id_owner"() from public;
grant execute on function public."enforce_participant_user_id_owner"() to anon, authenticated;

CREATE OR REPLACE FUNCTION public.enforce_public_profile_display_name_lock()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  locked_name text;
begin
  if public.is_owner_admin() then
    return new;
  end if;

  if auth.uid() is null then
    raise exception 'Authentication required.';
  end if;

  if new.user_id is distinct from auth.uid() then
    raise exception 'You can only edit your own public profile.';
  end if;

  select up.display_name
    into locked_name
  from public.user_profiles up
  where up.user_id = new.user_id;

  if locked_name is null or btrim(locked_name) = '' then
    raise exception 'Create your profile first.';
  end if;

  new.display_name := locked_name;
  return new;
end;
$function$;

revoke all on function public."enforce_public_profile_display_name_lock"() from public;
grant execute on function public."enforce_public_profile_display_name_lock"() to anon, authenticated;

CREATE OR REPLACE FUNCTION public.enforce_single_default_template()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  if new.is_default is null then
    new.is_default := false;
  end if;

  if tg_op = 'INSERT' then
    if not exists (
      select 1
      from public.templates t
      where t.user_id = new.user_id
    ) then
      new.is_default := true;
    end if;
  end if;

  if new.is_default then
    update public.templates
    set is_default = false
    where user_id = new.user_id
      and id is distinct from new.id
      and is_default = true;
  end if;

  return new;
end;
$function$;

revoke all on function public."enforce_single_default_template"() from public;
grant execute on function public."enforce_single_default_template"() to anon, authenticated;

CREATE OR REPLACE FUNCTION public.enforce_user_profile_name_lock()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if tg_op = 'INSERT' then
    if not public.is_owner_admin() and auth.uid() is distinct from new.user_id then
      raise exception 'You can only create your own profile row.';
    end if;
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if not public.is_owner_admin() then
      if auth.uid() is distinct from old.user_id then
        raise exception 'You can only update your own profile row.';
      end if;

      if new.display_name is distinct from old.display_name then
        raise exception 'Display name can only be changed by admin.';
      end if;

      new.user_id := old.user_id;
    end if;

    return new;
  end if;

  return new;
end;
$function$;

revoke all on function public."enforce_user_profile_name_lock"() from public;
grant execute on function public."enforce_user_profile_name_lock"() to anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_public_leaderboard()
 RETURNS TABLE(display_name text, user_id uuid, rating_count bigint, avg_total_score numeric)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select
    coalesce(nullif(trim(pp.display_name), ''), 'Anonymous') as display_name,
    pp.user_id,
    count(r.id)::bigint as rating_count,
    coalesce(avg(r.total_score), 0)::numeric as avg_total_score
  from public.public_profiles pp
  left join public.ratings r
    on r.user_id = pp.user_id
  where pp.is_public = true
  group by pp.user_id, pp.display_name
  order by
    count(r.id) desc,
    coalesce(avg(r.total_score), 0) desc,
    coalesce(nullif(trim(pp.display_name), ''), 'Anonymous') asc;
$function$;

revoke all on function public."get_public_leaderboard"() from public;
grant execute on function public."get_public_leaderboard"() to anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_public_rate_history(p_user_id uuid)
 RETURNS TABLE(id uuid, user_id uuid, total_score numeric, notes text, rated_at text, whiskey_name text, whiskey_distillery text, whiskey_proof numeric, whiskey_age text, nose numeric, flavor numeric, mouthfeel numeric, complexity numeric, balance numeric, finish numeric, uniqueness numeric, drinkability numeric, packaging numeric, value numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  score_payload_expr text;
  whiskey_age_expr text;
  query_sql text;
begin
  if p_user_id is null then
    return;
  end if;

  if not exists (
    select 1
    from public.public_profiles pp
    where pp.user_id = p_user_id
      and pp.is_public = true
  ) then
    return;
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'ratings'
      and column_name = 'scores_json'
  ) then
    score_payload_expr := 'r.scores_json';
  elsif exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'ratings'
      and column_name = 'scores'
  ) then
    score_payload_expr := 'r.scores';
  else
    score_payload_expr := '''{}''::jsonb';
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'whiskeys'
      and column_name = 'age'
  ) then
    whiskey_age_expr := 'nullif(trim(w.age::text), '''')';
  else
    whiskey_age_expr := 'null::text';
  end if;

  query_sql := format(
    $sql$
      select
        r.id::uuid as id,
        r.user_id::uuid as user_id,
        coalesce(r.total_score, 0)::numeric as total_score,
        r.notes::text as notes,
        r.rated_at::text as rated_at,
        coalesce(nullif(trim(w.name), ''), 'Unknown whiskey')::text as whiskey_name,
        nullif(trim(w.distillery), '')::text as whiskey_distillery,
        w.proof::numeric as whiskey_proof,
        %s as whiskey_age,
        categories.nose,
        categories.flavor,
        categories.mouthfeel,
        categories.complexity,
        categories.balance,
        categories.finish,
        categories.uniqueness,
        categories.drinkability,
        categories.packaging,
        categories.value
      from public.ratings r
      left join public.whiskeys w
        on w.id = r.whiskey_id
      left join lateral (
        with payload as (
          select coalesce(%s, '{}'::jsonb) as score_payload
        ),
        object_entries as (
          select
            key::text as item_ref,
            value as score_value
          from payload,
            lateral jsonb_each(payload.score_payload)
          where jsonb_typeof(payload.score_payload) = 'object'
        ),
        array_entries as (
          select
            coalesce(
              nullif(elem->>'item_id', ''),
              nullif(elem->>'itemId', ''),
              nullif(elem->>'id', ''),
              nullif(elem->>'key', ''),
              nullif(elem->>'item_key', '')
            ) as item_ref,
            coalesce(elem->'score', elem->'value', elem->'points') as score_value
          from payload,
            lateral jsonb_array_elements(payload.score_payload) as elem
          where jsonb_typeof(payload.score_payload) = 'array'
        ),
        entries as (
          select item_ref, score_value
          from object_entries
          union all
          select item_ref, score_value
          from array_entries
        ),
        normalized as (
          select
            lower(
              coalesce(
                nullif(trim(ti.item_key), ''),
                nullif(trim(entries.item_ref), '')
              )
            ) as score_key,
            case
              when trim(both '"' from coalesce(entries.score_value::text, '')) ~ '^-?[0-9]+(\.[0-9]+)?$'
              then trim(both '"' from entries.score_value::text)::numeric
              else null
            end as score_value
          from entries
          left join public.template_items ti
            on ti.id::text = entries.item_ref
        )
        select
          max(case when score_key = 'nose' then score_value end) as nose,
          max(case when score_key in ('flavor', 'palate', 'taste') then score_value end) as flavor,
          max(case when score_key = 'mouthfeel' then score_value end) as mouthfeel,
          max(case when score_key = 'complexity' then score_value end) as complexity,
          max(case when score_key = 'balance' then score_value end) as balance,
          max(case when score_key = 'finish' then score_value end) as finish,
          max(case when score_key = 'uniqueness' then score_value end) as uniqueness,
          max(case when score_key = 'drinkability' then score_value end) as drinkability,
          max(case when score_key = 'packaging' then score_value end) as packaging,
          max(case when score_key = 'value' then score_value end) as value
        from normalized
      ) categories on true
      where r.user_id = $1
      order by r.rated_at desc nulls last, r.id desc
    $sql$,
    whiskey_age_expr,
    score_payload_expr
  );

  return query execute query_sql using p_user_id;
end;
$function$;

revoke all on function public."get_public_rate_history"(p_user_id uuid) from public;
grant execute on function public."get_public_rate_history"(p_user_id uuid) to anon, authenticated;

CREATE OR REPLACE FUNCTION public.is_owner_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE
AS $function$
  select lower(coalesce(auth.jwt() ->> 'email', '')) = 'stephen.ansley92@gmail.com';
$function$;

revoke all on function public."is_owner_admin"() from public;
grant execute on function public."is_owner_admin"() to anon, authenticated;

CREATE OR REPLACE FUNCTION public.log_signup_event()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  insert into public.signup_events (new_user_id, new_user_email)
  values (new.id, new.email);
  return new;
end;
$function$;

revoke all on function public."log_signup_event"() from public;
grant execute on function public."log_signup_event"() to anon, authenticated;

CREATE OR REPLACE FUNCTION public.scores_compute_total()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  new.total :=
    coalesce(new.nose,0) +
    coalesce(new.flavor,0) +
    coalesce(new.mouthfeel,0) +
    coalesce(new.complexity,0) +
    coalesce(new.balance,0) +
    coalesce(new.finish,0) +
    coalesce(new.uniqueness,0) +
    coalesce(new.drinkability,0) +
    coalesce(new.packaging,0) +
    coalesce(new.value,0);

  return new;
end;
$function$;

revoke all on function public."scores_compute_total"() from public;
grant execute on function public."scores_compute_total"() to anon, authenticated;

CREATE OR REPLACE FUNCTION public.set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  new.updated_at = now();
  return new;
end;
$function$;

revoke all on function public."set_updated_at"() from public;
grant execute on function public."set_updated_at"() to anon, authenticated;

CREATE TRIGGER trg_participants_user_id_owner BEFORE INSERT OR UPDATE ON participants FOR EACH ROW EXECUTE FUNCTION enforce_participant_user_id_owner();
CREATE TRIGGER trg_public_profiles_name_lock BEFORE INSERT OR UPDATE ON public_profiles FOR EACH ROW EXECUTE FUNCTION enforce_public_profile_display_name_lock();
CREATE TRIGGER ratings_set_updated_at BEFORE UPDATE ON ratings FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_scores_compute_total BEFORE INSERT OR UPDATE ON scores FOR EACH ROW EXECUTE FUNCTION scores_compute_total();
CREATE TRIGGER templates_enforce_single_default BEFORE INSERT OR UPDATE ON templates FOR EACH ROW EXECUTE FUNCTION enforce_single_default_template();
CREATE TRIGGER templates_set_updated_at BEFORE UPDATE ON templates FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_user_profiles_name_lock BEFORE INSERT OR UPDATE ON user_profiles FOR EACH ROW EXECUTE FUNCTION enforce_user_profile_name_lock();
CREATE TRIGGER whiskeys_set_updated_at BEFORE UPDATE ON whiskeys FOR EACH ROW EXECUTE FUNCTION set_updated_at();
create trigger on_auth_user_created_signup_event after insert on auth.users
for each row execute function public.log_signup_event();

alter table public."participants" enable row level security;
alter table public."pours" enable row level security;
alter table public."public_profiles" enable row level security;
alter table public."ratings" enable row level security;
alter table public."scores" enable row level security;
alter table public."sessions" enable row level security;
alter table public."signup_events" enable row level security;
alter table public."template_items" enable row level security;
alter table public."templates" enable row level security;
alter table public."user_profiles" enable row level security;
alter table public."whiskeys" enable row level security;

create policy "participants_delete_auth" on public."participants"
  as permissive for delete to "authenticated"
  using (true)
;

create policy "participants_insert_all" on public."participants"
  as permissive for insert to public
  with check (true)
;

create policy "participants_select_public" on public."participants"
  as permissive for select to public
  using (true)
;

create policy "participants_update_auth" on public."participants"
  as permissive for update to "authenticated"
  using (true)
;

create policy "pours_delete_auth" on public."pours"
  as permissive for delete to "authenticated"
  using (true)
;

create policy "pours_insert_auth" on public."pours"
  as permissive for insert to "authenticated"
  with check (true)
;

create policy "pours_select_public" on public."pours"
  as permissive for select to public
  using (true)
;

create policy "pours_update_auth" on public."pours"
  as permissive for update to "authenticated"
  using (true)
;

create policy "public_profiles_delete_own" on public."public_profiles"
  as permissive for delete to "authenticated"
  using ((user_id = auth.uid()))
;

create policy "public_profiles_insert_own" on public."public_profiles"
  as permissive for insert to "authenticated"
  with check ((user_id = auth.uid()))
;

create policy "public_profiles_select_own" on public."public_profiles"
  as permissive for select to "authenticated"
  using ((user_id = auth.uid()))
;

create policy "public_profiles_select_public" on public."public_profiles"
  as permissive for select to "anon", "authenticated"
  using ((is_public = true))
;

create policy "public_profiles_select_public_or_own" on public."public_profiles"
  as permissive for select to public
  using (((is_public = true) OR (user_id = auth.uid())))
;

create policy "public_profiles_update_own" on public."public_profiles"
  as permissive for update to "authenticated"
  using ((user_id = auth.uid()))
;

create policy "ratings_delete_own" on public."ratings"
  as permissive for delete to "authenticated"
  using ((user_id = auth.uid()))
;

create policy "ratings_insert_own" on public."ratings"
  as permissive for insert to "authenticated"
  with check ((user_id = auth.uid()))
;

create policy "ratings_select_own" on public."ratings"
  as permissive for select to "authenticated"
  using (((auth.role() = 'authenticated'::text) AND (user_id = auth.uid()) AND (EXISTS ( SELECT 1
   FROM whiskeys w
  WHERE ((w.id = ratings.whiskey_id) AND (w.user_id = auth.uid())))) AND (EXISTS ( SELECT 1
   FROM templates t
  WHERE ((t.id = ratings.template_id) AND (t.user_id = auth.uid()))))))
;

create policy "ratings_select_own_or_public" on public."ratings"
  as permissive for select to public
  using ((((auth.uid() IS NOT NULL) AND (user_id = auth.uid())) OR (EXISTS ( SELECT 1
   FROM public_profiles pp
  WHERE ((pp.user_id = ratings.user_id) AND (pp.is_public = true))))))
;

create policy "ratings_update_own" on public."ratings"
  as permissive for update to "authenticated"
  using ((user_id = auth.uid()))
;

create policy "scores_delete_auth" on public."scores"
  as permissive for delete to "authenticated"
  using (true)
;

create policy "scores_insert_all" on public."scores"
  as permissive for insert to public
  with check (true)
;

create policy "scores_select_public" on public."scores"
  as permissive for select to public
  using (true)
;

create policy "scores_update_all" on public."scores"
  as permissive for update to public
  using (true)
;

create policy "sessions_delete_auth" on public."sessions"
  as permissive for delete to "authenticated"
  using (((host_user_id IS NULL) OR (host_user_id = auth.uid())))
;

create policy "sessions_insert_auth" on public."sessions"
  as permissive for insert to "authenticated"
  with check ((host_user_id = auth.uid()))
;

create policy "sessions_select_public" on public."sessions"
  as permissive for select to public
  using (true)
;

create policy "sessions_update_auth" on public."sessions"
  as permissive for update to "authenticated"
  using (((host_user_id IS NULL) OR (host_user_id = auth.uid())))
  with check (((host_user_id IS NULL) OR (host_user_id = auth.uid())))
;

create policy "owner_can_read_signup_events" on public."signup_events"
  as permissive for select to "authenticated"
  using ((auth.email() = 'mrnoobzzz@yahoo.com'::text))
;

create policy "signup_events_select_own_or_admin" on public."signup_events"
  as permissive for select to "authenticated"
  using (((new_user_id = auth.uid()) OR ((auth.jwt() ->> 'email'::text) = 'stephen.ansley92@gmail.com'::text)))
;

create policy "template_items_delete_own" on public."template_items"
  as permissive for delete to "authenticated"
  using ((EXISTS ( SELECT 1
   FROM templates t
  WHERE ((t.id = template_items.template_id) AND (t.user_id = auth.uid())))))
;

create policy "template_items_insert_own" on public."template_items"
  as permissive for insert to "authenticated"
  with check ((EXISTS ( SELECT 1
   FROM templates t
  WHERE ((t.id = template_items.template_id) AND (t.user_id = auth.uid())))))
;

create policy "template_items_select_own" on public."template_items"
  as permissive for select to "authenticated"
  using ((EXISTS ( SELECT 1
   FROM templates t
  WHERE ((t.id = template_items.template_id) AND (t.user_id = auth.uid())))))
;

create policy "template_items_update_own" on public."template_items"
  as permissive for update to "authenticated"
  using ((EXISTS ( SELECT 1
   FROM templates t
  WHERE ((t.id = template_items.template_id) AND (t.user_id = auth.uid())))))
;

create policy "templates_delete_own" on public."templates"
  as permissive for delete to "authenticated"
  using ((user_id = auth.uid()))
;

create policy "templates_insert_own" on public."templates"
  as permissive for insert to "authenticated"
  with check ((user_id = auth.uid()))
;

create policy "templates_select_own" on public."templates"
  as permissive for select to "authenticated"
  using ((user_id = auth.uid()))
;

create policy "templates_update_own" on public."templates"
  as permissive for update to "authenticated"
  using ((user_id = auth.uid()))
;

create policy "user_profiles_delete_admin_only" on public."user_profiles"
  as permissive for delete to public
  using (is_owner_admin())
;

create policy "user_profiles_insert_own_or_admin" on public."user_profiles"
  as permissive for insert to "authenticated"
  with check (((user_id = auth.uid()) OR ((auth.jwt() ->> 'email'::text) = 'stephen.ansley92@gmail.com'::text)))
;

create policy "user_profiles_insert_self_or_admin" on public."user_profiles"
  as permissive for insert to public
  with check ((is_owner_admin() OR ((auth.uid() = user_id) AND (NOT (EXISTS ( SELECT 1
   FROM user_profiles existing
  WHERE (existing.user_id = user_profiles.user_id)))))))
;

create policy "user_profiles_select_own_or_admin" on public."user_profiles"
  as permissive for select to "authenticated"
  using (((user_id = auth.uid()) OR ((auth.jwt() ->> 'email'::text) = 'stephen.ansley92@gmail.com'::text)))
;

create policy "user_profiles_select_self_or_admin" on public."user_profiles"
  as permissive for select to public
  using ((is_owner_admin() OR (auth.uid() = user_id)))
;

create policy "user_profiles_update_own_or_admin" on public."user_profiles"
  as permissive for update to "authenticated"
  using (((user_id = auth.uid()) OR ((auth.jwt() ->> 'email'::text) = 'stephen.ansley92@gmail.com'::text)))
;

create policy "user_profiles_update_self_or_admin" on public."user_profiles"
  as permissive for update to public
  using ((is_owner_admin() OR (auth.uid() = user_id)))
  with check ((is_owner_admin() OR (auth.uid() = user_id)))
;

create policy "whiskeys_delete_own" on public."whiskeys"
  as permissive for delete to "authenticated"
  using ((user_id = auth.uid()))
;

create policy "whiskeys_insert_own" on public."whiskeys"
  as permissive for insert to "authenticated"
  with check ((user_id = auth.uid()))
;

create policy "whiskeys_select_all_authenticated" on public."whiskeys"
  as permissive for select to "authenticated"
  using (true)
;

create policy "whiskeys_select_own" on public."whiskeys"
  as permissive for select to "authenticated"
  using (((auth.role() = 'authenticated'::text) AND (user_id = auth.uid())))
;

create policy "whiskeys_update_own" on public."whiskeys"
  as permissive for update to "authenticated"
  using ((user_id = auth.uid()))
;

grant delete, insert, references, select, trigger, truncate, update on table public."participants" to "anon";
grant delete, insert, references, select, trigger, truncate, update on table public."participants" to "authenticated";
grant delete, insert, references, select, trigger, truncate, update on table public."participants" to "service_role";
grant delete, insert, references, select, trigger, truncate, update on table public."pours" to "anon";
grant delete, insert, references, select, trigger, truncate, update on table public."pours" to "authenticated";
grant delete, insert, references, select, trigger, truncate, update on table public."pours" to "service_role";
grant insert, references, select, trigger, truncate, update on table public."public_profiles" to "authenticated";
grant delete, insert, references, select, trigger, truncate, update on table public."public_profiles" to "service_role";
grant delete, insert, references, select, trigger, truncate, update on table public."ratings" to "authenticated";
grant delete, insert, references, select, trigger, truncate, update on table public."ratings" to "service_role";
grant delete, insert, references, select, trigger, truncate, update on table public."scores" to "anon";
grant delete, insert, references, select, trigger, truncate, update on table public."scores" to "authenticated";
grant delete, insert, references, select, trigger, truncate, update on table public."scores" to "service_role";
grant delete, insert, references, select, trigger, truncate, update on table public."sessions" to "anon";
grant delete, insert, references, select, trigger, truncate, update on table public."sessions" to "authenticated";
grant delete, insert, references, select, trigger, truncate, update on table public."sessions" to "service_role";
grant delete, insert, references, select, trigger, truncate, update on table public."signup_events" to "authenticated";
grant delete, insert, references, select, trigger, truncate, update on table public."signup_events" to "service_role";
grant delete, insert, references, select, trigger, truncate, update on table public."template_items" to "authenticated";
grant delete, insert, references, select, trigger, truncate, update on table public."template_items" to "service_role";
grant delete, insert, references, select, trigger, truncate, update on table public."templates" to "authenticated";
grant delete, insert, references, select, trigger, truncate, update on table public."templates" to "service_role";
grant delete, insert, references, select, trigger, truncate, update on table public."user_profiles" to "authenticated";
grant delete, insert, references, select, trigger, truncate, update on table public."user_profiles" to "service_role";
grant delete, insert, references, select, trigger, truncate, update on table public."whiskeys" to "authenticated";
grant delete, insert, references, select, trigger, truncate, update on table public."whiskeys" to "service_role";

commit;
