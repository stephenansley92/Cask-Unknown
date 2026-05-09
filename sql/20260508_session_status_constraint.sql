-- Enforce valid session status values at the DB level.
-- Without this, a buggy client can write arbitrary strings and break
-- all status-dependent logic on host/score/reveal pages.
ALTER TABLE sessions
  ADD CONSTRAINT sessions_status_check
  CHECK (status IN ('setup', 'scoring', 'reveal_ready', 'revealed', 'closed'));
