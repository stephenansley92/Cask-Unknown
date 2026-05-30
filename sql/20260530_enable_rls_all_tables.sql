-- =============================================================
-- RLS: Enable Row-Level Security on all public tables
-- Run this in the Supabase SQL Editor (Dashboard → SQL Editor → New Query)
-- =============================================================

-- ─────────────────────────────────────────────────────────────
-- 1. SESSIONS
--    No host_user_id column — host_key is the owner secret.
--    Blind-tasting join/score/reveal pages work without auth,
--    so SELECT is open to all roles (including anon).
-- ─────────────────────────────────────────────────────────────
alter table public.sessions enable row level security;

-- Anyone (anon or auth) can read sessions — needed for join/score/reveal
drop policy if exists "sessions_select_public" on public.sessions;
create policy "sessions_select_public" on public.sessions
  for select using (true);

-- Only logged-in users may create or modify sessions
drop policy if exists "sessions_insert_auth" on public.sessions;
create policy "sessions_insert_auth" on public.sessions
  for insert to authenticated with check (true);

drop policy if exists "sessions_update_auth" on public.sessions;
create policy "sessions_update_auth" on public.sessions
  for update to authenticated using (true);

drop policy if exists "sessions_delete_auth" on public.sessions;
create policy "sessions_delete_auth" on public.sessions
  for delete to authenticated using (true);


-- ─────────────────────────────────────────────────────────────
-- 2. POURS
--    Linked to sessions; no user ownership column.
--    Score page reads pours without auth.
-- ─────────────────────────────────────────────────────────────
alter table public.pours enable row level security;

drop policy if exists "pours_select_public" on public.pours;
create policy "pours_select_public" on public.pours
  for select using (true);

drop policy if exists "pours_insert_auth" on public.pours;
create policy "pours_insert_auth" on public.pours
  for insert to authenticated with check (true);

drop policy if exists "pours_update_auth" on public.pours;
create policy "pours_update_auth" on public.pours
  for update to authenticated using (true);

drop policy if exists "pours_delete_auth" on public.pours;
create policy "pours_delete_auth" on public.pours
  for delete to authenticated using (true);


-- ─────────────────────────────────────────────────────────────
-- 3. PARTICIPANTS
--    Nullable user_id — guests can join sessions without auth.
--    Anon INSERT is intentional (guest join flow).
-- ─────────────────────────────────────────────────────────────
alter table public.participants enable row level security;

drop policy if exists "participants_select_public" on public.participants;
create policy "participants_select_public" on public.participants
  for select using (true);

drop policy if exists "participants_insert_all" on public.participants;
create policy "participants_insert_all" on public.participants
  for insert with check (true);

drop policy if exists "participants_update_auth" on public.participants;
create policy "participants_update_auth" on public.participants
  for update to authenticated using (true);

drop policy if exists "participants_delete_auth" on public.participants;
create policy "participants_delete_auth" on public.participants
  for delete to authenticated using (true);


-- ─────────────────────────────────────────────────────────────
-- 4. SCORES
--    Tasters score without logging in (anon INSERT/UPDATE).
--    Host page reads all scores in a session (auth SELECT).
-- ─────────────────────────────────────────────────────────────
alter table public.scores enable row level security;

drop policy if exists "scores_select_public" on public.scores;
create policy "scores_select_public" on public.scores
  for select using (true);

drop policy if exists "scores_insert_all" on public.scores;
create policy "scores_insert_all" on public.scores
  for insert with check (true);

drop policy if exists "scores_update_all" on public.scores;
create policy "scores_update_all" on public.scores
  for update using (true);

drop policy if exists "scores_delete_auth" on public.scores;
create policy "scores_delete_auth" on public.scores
  for delete to authenticated using (true);


-- ─────────────────────────────────────────────────────────────
-- 5. RATINGS (personal whiskey ratings library)
--    Users own their own ratings.
--    Public profile pages need to read another user's ratings
--    — only allowed when that user has a public profile.
-- ─────────────────────────────────────────────────────────────
alter table public.ratings enable row level security;

-- SELECT: own ratings always readable; other users' ratings readable
-- only if they have opted into a public profile (leaderboard / profile pages).
-- No "to authenticated" on SELECT so the get_public_leaderboard RPC can run
-- even for visitors who are not logged in.
drop policy if exists "ratings_select_own_or_public" on public.ratings;
create policy "ratings_select_own_or_public" on public.ratings
  for select using (
    (auth.uid() is not null and user_id = auth.uid())
    or exists (
      select 1 from public.public_profiles pp
      where pp.user_id = ratings.user_id
        and pp.is_public = true
    )
  );

drop policy if exists "ratings_insert_own" on public.ratings;
create policy "ratings_insert_own" on public.ratings
  for insert to authenticated with check (user_id = auth.uid());

drop policy if exists "ratings_update_own" on public.ratings;
create policy "ratings_update_own" on public.ratings
  for update to authenticated using (user_id = auth.uid());

drop policy if exists "ratings_delete_own" on public.ratings;
create policy "ratings_delete_own" on public.ratings
  for delete to authenticated using (user_id = auth.uid());


-- ─────────────────────────────────────────────────────────────
-- 6. USER_PROFILES  ← SENSITIVE (contains email column)
--    Users manage their own profile.
--    The admin (stephen.ansley92@gmail.com) needs to read and
--    upsert all profiles to manage testers.
-- ─────────────────────────────────────────────────────────────
alter table public.user_profiles enable row level security;

drop policy if exists "user_profiles_select_own_or_admin" on public.user_profiles;
create policy "user_profiles_select_own_or_admin" on public.user_profiles
  for select to authenticated using (
    user_id = auth.uid()
    or (auth.jwt() ->> 'email') = 'stephen.ansley92@gmail.com'
  );

drop policy if exists "user_profiles_insert_own_or_admin" on public.user_profiles;
create policy "user_profiles_insert_own_or_admin" on public.user_profiles
  for insert to authenticated with check (
    user_id = auth.uid()
    or (auth.jwt() ->> 'email') = 'stephen.ansley92@gmail.com'
  );

drop policy if exists "user_profiles_update_own_or_admin" on public.user_profiles;
create policy "user_profiles_update_own_or_admin" on public.user_profiles
  for update to authenticated using (
    user_id = auth.uid()
    or (auth.jwt() ->> 'email') = 'stephen.ansley92@gmail.com'
  );


-- ─────────────────────────────────────────────────────────────
-- 7. PUBLIC_PROFILES
--    Leaderboard reads profiles where is_public = true.
--    Users can manage their own public profile.
-- ─────────────────────────────────────────────────────────────
alter table public.public_profiles enable row level security;

drop policy if exists "public_profiles_select_public_or_own" on public.public_profiles;
create policy "public_profiles_select_public_or_own" on public.public_profiles
  for select using (
    is_public = true
    or user_id = auth.uid()
  );

drop policy if exists "public_profiles_insert_own" on public.public_profiles;
create policy "public_profiles_insert_own" on public.public_profiles
  for insert to authenticated with check (user_id = auth.uid());

drop policy if exists "public_profiles_update_own" on public.public_profiles;
create policy "public_profiles_update_own" on public.public_profiles
  for update to authenticated using (user_id = auth.uid());

drop policy if exists "public_profiles_delete_own" on public.public_profiles;
create policy "public_profiles_delete_own" on public.public_profiles
  for delete to authenticated using (user_id = auth.uid());


-- ─────────────────────────────────────────────────────────────
-- 8. TEMPLATES
--    Users own their own rating templates.
-- ─────────────────────────────────────────────────────────────
alter table public.templates enable row level security;

drop policy if exists "templates_select_own" on public.templates;
create policy "templates_select_own" on public.templates
  for select to authenticated using (user_id = auth.uid());

drop policy if exists "templates_insert_own" on public.templates;
create policy "templates_insert_own" on public.templates
  for insert to authenticated with check (user_id = auth.uid());

drop policy if exists "templates_update_own" on public.templates;
create policy "templates_update_own" on public.templates
  for update to authenticated using (user_id = auth.uid());

drop policy if exists "templates_delete_own" on public.templates;
create policy "templates_delete_own" on public.templates
  for delete to authenticated using (user_id = auth.uid());


-- ─────────────────────────────────────────────────────────────
-- 9. TEMPLATE_ITEMS
--    Items belong to templates which belong to users.
-- ─────────────────────────────────────────────────────────────
alter table public.template_items enable row level security;

drop policy if exists "template_items_select_own" on public.template_items;
create policy "template_items_select_own" on public.template_items
  for select to authenticated using (
    exists (
      select 1 from public.templates t
      where t.id = template_items.template_id
        and t.user_id = auth.uid()
    )
  );

drop policy if exists "template_items_insert_own" on public.template_items;
create policy "template_items_insert_own" on public.template_items
  for insert to authenticated with check (
    exists (
      select 1 from public.templates t
      where t.id = template_items.template_id
        and t.user_id = auth.uid()
    )
  );

drop policy if exists "template_items_update_own" on public.template_items;
create policy "template_items_update_own" on public.template_items
  for update to authenticated using (
    exists (
      select 1 from public.templates t
      where t.id = template_items.template_id
        and t.user_id = auth.uid()
    )
  );

drop policy if exists "template_items_delete_own" on public.template_items;
create policy "template_items_delete_own" on public.template_items
  for delete to authenticated using (
    exists (
      select 1 from public.templates t
      where t.id = template_items.template_id
        and t.user_id = auth.uid()
    )
  );


-- ─────────────────────────────────────────────────────────────
-- 10. SIGNUP_EVENTS  ← SENSITIVE (contains new_user_email)
--     Written only by auth triggers (service role).
--     Readable by: the user themselves, or the admin.
--     No INSERT/UPDATE/DELETE via anon/authenticated API.
-- ─────────────────────────────────────────────────────────────
alter table public.signup_events enable row level security;

drop policy if exists "signup_events_select_own_or_admin" on public.signup_events;
create policy "signup_events_select_own_or_admin" on public.signup_events
  for select to authenticated using (
    new_user_id = auth.uid()
    or (auth.jwt() ->> 'email') = 'stephen.ansley92@gmail.com'
  );

-- No INSERT/UPDATE/DELETE policies → only service-role triggers can write


-- ─────────────────────────────────────────────────────────────
-- WHISKEYS (already has RLS — ensure it stays correct)
-- ─────────────────────────────────────────────────────────────
alter table public.whiskeys enable row level security;

drop policy if exists "whiskeys_select_all_authenticated" on public.whiskeys;
create policy "whiskeys_select_all_authenticated" on public.whiskeys
  for select to authenticated using (true);

drop policy if exists "whiskeys_insert_own" on public.whiskeys;
create policy "whiskeys_insert_own" on public.whiskeys
  for insert to authenticated with check (user_id = auth.uid());

drop policy if exists "whiskeys_update_own" on public.whiskeys;
create policy "whiskeys_update_own" on public.whiskeys
  for update to authenticated using (user_id = auth.uid());

drop policy if exists "whiskeys_delete_own" on public.whiskeys;
create policy "whiskeys_delete_own" on public.whiskeys
  for delete to authenticated using (user_id = auth.uid());
