-- Let signed-out visitors read public profiles for the Community page.
--
-- The RLS policy public_profiles_select_public already allows anon to read
-- rows where is_public = true, and get_public_leaderboard() is already
-- executable by anon, but anon was never granted table-level SELECT, so
-- every anonymous Community request failed with "permission denied".
--
-- Only the columns the Community and public profile pages read are granted.
-- Additive and independent of 202607110003; safe to apply in either order.

begin;

grant select (user_id, display_name, is_public)
  on public.public_profiles to anon;

commit;
