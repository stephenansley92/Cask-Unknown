begin;

create or replace function public.get_public_rate_history(p_user_id uuid)
returns table (
  id uuid,
  user_id uuid,
  total_score numeric,
  notes text,
  rated_at text,
  whiskey_name text,
  whiskey_distillery text,
  whiskey_proof numeric,
  whiskey_age text,
  nose numeric,
  flavor numeric,
  mouthfeel numeric,
  complexity numeric,
  balance numeric,
  finish numeric,
  uniqueness numeric,
  drinkability numeric,
  packaging numeric,
  value numeric
)
language plpgsql
security definer
set search_path = public
as $$
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
$$;

revoke all on function public.get_public_rate_history(uuid) from public;
grant execute on function public.get_public_rate_history(uuid) to anon, authenticated;

commit;
