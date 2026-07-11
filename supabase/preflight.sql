-- Read-only production preflight for the Cask Unknown security migration.
-- This script intentionally returns aggregate counts and schema metadata only.
-- It does not return tasting notes, email addresses, host keys, or auth tokens.

begin transaction read only;

select
  current_database() as database_name,
  current_setting('server_version') as postgres_version,
  now() as inspected_at;

select
  table_name,
  column_name,
  data_type,
  is_nullable,
  column_default
from information_schema.columns
where table_schema = 'public'
order by table_name, ordinal_position;

select
  c.relname as table_name,
  con.conname as constraint_name,
  con.contype as constraint_type,
  pg_get_constraintdef(con.oid) as definition
from pg_constraint con
join pg_class c on c.oid = con.conrelid
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
order by c.relname, con.conname;

select
  tablename,
  indexname,
  indexdef
from pg_indexes
where schemaname = 'public'
order by tablename, indexname;

select
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
from pg_policies
where schemaname = 'public'
order by tablename, policyname;

select
  p.proname as function_name,
  pg_get_function_identity_arguments(p.oid) as arguments,
  p.prosecdef as security_definer,
  p.provolatile as volatility,
  has_function_privilege('anon', p.oid, 'execute') as anon_can_execute,
  has_function_privilege('authenticated', p.oid, 'execute') as authenticated_can_execute
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
order by p.proname, arguments;

select 'sessions' as table_name, count(*) as row_count from public.sessions
union all select 'pours', count(*) from public.pours
union all select 'participants', count(*) from public.participants
union all select 'scores', count(*) from public.scores
union all select 'ratings', count(*) from public.ratings
union all select 'whiskeys', count(*) from public.whiskeys
union all select 'user_profiles', count(*) from public.user_profiles
union all select 'public_profiles', count(*) from public.public_profiles
union all select 'templates', count(*) from public.templates
union all select 'template_items', count(*) from public.template_items;

select check_name, issue_count
from (
  select
    'legacy sessions without host_user_id' as check_name,
    count(*)::bigint as issue_count
  from public.sessions
  where host_user_id is null

  union all
  select
    'sessions with invalid status',
    count(*)::bigint
  from public.sessions
  where status is null
     or status not in ('setup', 'scoring', 'reveal_ready', 'revealed', 'closed')

  union all
  select
    'duplicate score participant/pour pairs',
    count(*)::bigint
  from (
    select participant_id, pour_id
    from public.scores
    group by participant_id, pour_id
    having count(*) > 1
  ) duplicates

  union all
  select
    'duplicate authenticated participants per session',
    count(*)::bigint
  from (
    select session_id, user_id
    from public.participants
    where user_id is not null
    group by session_id, user_id
    having count(*) > 1
  ) duplicates

  union all
  select
    'duplicate guest display names per session',
    count(*)::bigint
  from (
    select session_id, lower(trim(display_name)) as display_name
    from public.participants
    where user_id is null
    group by session_id, lower(trim(display_name))
    having count(*) > 1
  ) duplicates

  union all
  select
    'scores with invalid category values',
    count(*)::bigint
  from public.scores
  where nose not between 0 and 10
     or flavor not between 0 and 20
     or mouthfeel not between 0 and 10
     or complexity not between 0 and 10
     or balance not between 0 and 10
     or finish not between 0 and 10
     or uniqueness not between 0 and 10
     or drinkability not between 0 and 10
     or packaging not between 0 and 5
     or value not between 0 and 5

  union all
  select
    'scores whose total does not match categories',
    count(*)::bigint
  from public.scores
  where total is distinct from (
    coalesce(nose, 0) + coalesce(flavor, 0) + coalesce(mouthfeel, 0) +
    coalesce(complexity, 0) + coalesce(balance, 0) + coalesce(finish, 0) +
    coalesce(uniqueness, 0) + coalesce(drinkability, 0) +
    coalesce(packaging, 0) + coalesce(value, 0)
  )

  union all
  select
    'scores with mismatched session relationships',
    count(*)::bigint
  from public.scores s
  left join public.pours po on po.id = s.pour_id
  left join public.participants pa on pa.id = s.participant_id
  where po.id is null
     or pa.id is null
     or po.session_id is distinct from s.session_id
     or pa.session_id is distinct from s.session_id

  union all
  select
    'pours with missing sessions',
    count(*)::bigint
  from public.pours po
  left join public.sessions s on s.id = po.session_id
  where s.id is null

  union all
  select
    'participants with missing sessions',
    count(*)::bigint
  from public.participants pa
  left join public.sessions s on s.id = pa.session_id
  where s.id is null

  union all
  select
    'duplicate whiskey identity keys per owner',
    count(*)::bigint
  from (
    select user_id, identity_key
    from public.whiskeys
    where identity_key is not null and identity_key <> ''
    group by user_id, identity_key
    having count(*) > 1
  ) duplicates
) checks
order by check_name;

rollback;
