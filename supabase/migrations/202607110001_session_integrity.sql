-- Additive integrity prerequisites for the session security rollout.
-- Run only after supabase/preflight.sql reports zero duplicate and relationship issues.

begin;

alter table public.participants
  add column if not exists access_token uuid default gen_random_uuid();

update public.participants
set access_token = gen_random_uuid()
where access_token is null;

alter table public.participants
  alter column access_token set default gen_random_uuid(),
  alter column access_token set not null;

create unique index if not exists participants_access_token_uidx
  on public.participants (access_token);

create unique index if not exists participants_session_user_uidx
  on public.participants (session_id, user_id)
  where user_id is not null;

create unique index if not exists participants_session_guest_name_uidx
  on public.participants (session_id, lower(btrim(display_name)))
  where user_id is null;

create unique index if not exists sessions_host_key_uidx
  on public.sessions (host_key);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.sessions'::regclass
      and conname = 'sessions_title_not_blank'
  ) then
    alter table public.sessions
      add constraint sessions_title_not_blank
      check (btrim(title) <> '') not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.sessions'::regclass
      and conname = 'sessions_host_key_not_blank'
  ) then
    alter table public.sessions
      add constraint sessions_host_key_not_blank
      check (btrim(host_key) <> '') not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.participants'::regclass
      and conname = 'participants_display_name_not_blank'
  ) then
    alter table public.participants
      add constraint participants_display_name_not_blank
      check (btrim(display_name) <> '') not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.pours'::regclass
      and conname = 'pours_id_session_id_key'
  ) then
    alter table public.pours
      add constraint pours_id_session_id_key unique (id, session_id);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.participants'::regclass
      and conname = 'participants_id_session_id_key'
  ) then
    alter table public.participants
      add constraint participants_id_session_id_key unique (id, session_id);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.scores'::regclass
      and conname = 'scores_pour_session_fkey'
  ) then
    alter table public.scores
      add constraint scores_pour_session_fkey
      foreign key (pour_id, session_id)
      references public.pours (id, session_id)
      on delete cascade
      not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.scores'::regclass
      and conname = 'scores_participant_session_fkey'
  ) then
    alter table public.scores
      add constraint scores_participant_session_fkey
      foreign key (participant_id, session_id)
      references public.participants (id, session_id)
      on delete cascade
      not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.scores'::regclass
      and conname = 'scores_total_matches_categories'
  ) then
    alter table public.scores
      add constraint scores_total_matches_categories
      check (
        total = nose + flavor + mouthfeel + complexity + balance + finish +
          uniqueness + drinkability + packaging + value
      ) not valid;
  end if;
end
$$;

alter table public.sessions validate constraint sessions_title_not_blank;
alter table public.sessions validate constraint sessions_host_key_not_blank;
alter table public.participants validate constraint participants_display_name_not_blank;
alter table public.scores validate constraint scores_pour_session_fkey;
alter table public.scores validate constraint scores_participant_session_fkey;
alter table public.scores validate constraint scores_total_matches_categories;

commit;
