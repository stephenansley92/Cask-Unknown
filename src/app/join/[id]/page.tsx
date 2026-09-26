"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ChevronRight, GlassWater, Trophy, UserRound } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  ACTIVE_PROFILE_STORAGE_KEY,
  getProfileOptions,
  saveProfileOption,
} from "@/lib/profiles";
import {
  getPublicSession,
  joinSession,
  resumeSessionParticipant,
} from "@/lib/session-api";
import { errorMessage, logEvent, newCorrelationId, userFacingError } from "@/lib/log";
import { Button, buttonStyles } from "@/components/ui/button";
import { Card, Eyebrow } from "@/components/ui/card";
import { LoadingScreen, Wordmark } from "@/components/ui/brand";
import { Notice } from "@/components/ui/notice";
import { PageShell } from "@/components/ui/page";
import { cx } from "@/components/ui/cx";

type SessionRow = {
  id: string;
  title: string;
  is_blind: boolean;
  status: string;
  created_at?: string;
};

type ParticipantRow = {
  id: string;
  session_id: string;
  display_name: string;
  user_id?: string | null;
  access_token: string;
  created_at?: string;
};

function storageKey(sessionId: string) {
  return `cask_unknown_participant_${sessionId}`;
}

const OWNER_EMAIL = "stephen.ansley92@gmail.com";

export default function JoinPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();

  const sessionId = params?.id;

  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<SessionRow | null>(null);
  // loadError replaces the page; formError sits under the join form.
  const [loadError, setLoadError] = useState("");
  const [formError, setFormError] = useState("");
  const [sessionEnded, setSessionEnded] = useState(false);

  const [selectedProfile, setSelectedProfile] = useState("");
  const [customProfileName, setCustomProfileName] = useState("");
  const [profileOptions, setProfileOptions] = useState<string[]>([]);
  const [lockedProfileName, setLockedProfileName] = useState("");
  const [authUserId, setAuthUserId] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const [existingParticipant, setExistingParticipant] =
    useState<ParticipantRow | null>(null);

  const scoreUrl = useMemo(() => {
    if (!sessionId) return "/";
    return `/score/${sessionId}`;
  }, [sessionId]);

  useEffect(() => {
    const failLoad = (event: string, base: string, cause: unknown) => {
      const ref = newCorrelationId();
      logEvent("error", event, { ref, sessionId, message: errorMessage(cause) });
      setLoadError(userFacingError(base, ref));
      setLoading(false);
    };

    const run = async () => {
      try {
        setLoading(true);
        setLoadError("");
        setProfileOptions(getProfileOptions());

        const authClient = createSupabaseBrowserClient();
        // Guests join without logging in. getUser() returns an
        // AuthSessionMissingError when there's no session — that's expected
        // for guests, so treat it as "no logged-in user" rather than a fatal
        // error. Only a logged-in user enforces a locked profile name.
        const { data: userData } = await authClient.auth.getUser();
        const user = userData?.user ?? null;

        const ownerMatch =
          (user?.email || "").trim().toLowerCase() === OWNER_EMAIL;
        setAuthUserId(user?.id || "");

        let enforcedProfileName = "";

        if (user && !ownerMatch) {
          const { data: profileData, error: profileError } = await authClient
            .from("user_profiles")
            .select("display_name")
            .eq("user_id", user.id)
            .maybeSingle();

          if (profileError) {
            failLoad("join.profile_load_failed", "We couldn't load your profile.", profileError);
            return;
          }

          if (!profileData) {
            router.push("/profile/setup");
            return;
          }

          enforcedProfileName =
            (profileData.display_name as string | null)?.trim() ||
            user.email ||
            "Profile";
          setLockedProfileName(enforcedProfileName);
          setSelectedProfile(enforcedProfileName);
          setCustomProfileName("");
        } else {
          setLockedProfileName("");
        }

        if (!sessionId) {
          setLoadError("This join link is missing its session.");
          setLoading(false);
          return;
        }

        const { data: sess, error: sessErr } = await getPublicSession(supabase, sessionId);

        if (sessErr || !sess) {
          failLoad(
            "join.session_load_failed",
            "We couldn't find that tasting. Check the link, or ask the host for a fresh QR code.",
            sessErr ?? "no session",
          );
          return;
        }

        setSession(sess as SessionRow);

        // Block joining sessions that are already past the scoring phase
        const sStatus = ((sess as SessionRow).status || "").toLowerCase();
        if (sStatus === "revealed" || sStatus === "closed") {
          setSessionEnded(true);
          setLoading(false);
          return;
        }

        const raw =
          typeof window !== "undefined"
            ? window.localStorage.getItem(storageKey(sessionId))
            : null;

        if (!raw) {
          setLoading(false);
          return;
        }

        let parsed: { participantId?: string; accessToken?: string; displayName?: string } | null =
          null;
        try {
          parsed = JSON.parse(raw);
        } catch {
          parsed = null;
        }

        const participantId = parsed?.participantId;
        if (!participantId) {
          setLoading(false);
          return;
        }

        const { data: p, error: pErr } = await resumeSessionParticipant(
          user ? authClient : supabase,
          sessionId,
          participantId,
          parsed?.accessToken || participantId,
        );

        if (!pErr && p && (p as ParticipantRow).session_id === sessionId) {
          const row = p as ParticipantRow;
          const hasOwnerMismatch =
            !ownerMatch && user?.id && row.user_id && row.user_id !== user.id;
          const hasLockedProfileMismatch =
            !ownerMatch &&
            enforcedProfileName &&
            row.display_name !== enforcedProfileName;

          if (hasOwnerMismatch || hasLockedProfileMismatch) {
            if (typeof window !== "undefined") {
              window.localStorage.removeItem(storageKey(sessionId));
            }
          } else {
            setExistingParticipant(row);
            setSelectedProfile(row.display_name || "");
          }
        } else if (typeof window !== "undefined") {
          window.localStorage.removeItem(storageKey(sessionId));
        }

        setLoading(false);
      } catch (e: unknown) {
        failLoad("join.load_failed", "Something went wrong opening this tasting.", e);
      }
    };

    run();
  }, [router, sessionId]);

  const continueAsExisting = () => {
    if (typeof window !== "undefined" && existingParticipant?.display_name) {
      window.localStorage.setItem(
        ACTIVE_PROFILE_STORAGE_KEY,
        existingParticipant.display_name
      );
    }

    router.push(scoreUrl);
  };

  const submit = async (e?: FormEvent) => {
    e?.preventDefault();
    try {
      if (!sessionId) return;

      const enforcedProfile = lockedProfileName.trim();
      const clean = enforcedProfile || customProfileName.trim() || selectedProfile.trim();

      if (!clean) {
        setFormError("Pick a saved name or type a new one.");
        return;
      }

      if (enforcedProfile && clean !== enforcedProfile) {
        setFormError("Your profile name is locked for this account.");
        return;
      }

      setSubmitting(true);
      setFormError("");

      // Use an authenticated client so RLS policies can verify auth.uid() = user_id
      const dbClient = authUserId ? createSupabaseBrowserClient() : supabase;

      const { data: joined, error: joinError } = await joinSession(dbClient, sessionId, clean);
      if (joinError || !joined) {
        // join_session raises human-readable messages (name taken, closed, ...).
        setFormError(joinError?.message || "Couldn't join this tasting. Try again.");
        setSubmitting(false);
        return;
      }
      const row = joined as ParticipantRow;

      saveProfileOption(clean);

      if (typeof window !== "undefined") {
        window.localStorage.setItem(
          storageKey(sessionId),
          JSON.stringify({
            participantId: row.id,
            accessToken: row.access_token,
            displayName: row.display_name,
          })
        );
        window.localStorage.setItem(ACTIVE_PROFILE_STORAGE_KEY, clean);
      }

      setProfileOptions(getProfileOptions());
      setExistingParticipant(row);
      setSubmitting(false);

      router.push(scoreUrl);
    } catch (err: unknown) {
      const ref = newCorrelationId();
      logEvent("error", "join.submit_failed", { ref, sessionId, message: errorMessage(err) });
      setFormError(userFacingError("Couldn't join this tasting. Check your connection and try again.", ref));
      setSubmitting(false);
    }
  };

  if (loading) {
    return <LoadingScreen label="Opening tasting" />;
  }

  if (loadError) {
    return (
      <PageShell center>
        <div className="w-full text-center">
          <Wordmark size="lg" />
          <Notice tone="danger" className="mt-8 text-left">
            {loadError}
          </Notice>
          <Link href="/" className={buttonStyles({ variant: "secondary", size: "lg", block: true, className: "mt-4" })}>
            Go home
          </Link>
        </div>
      </PageShell>
    );
  }

  if (!session) return null;

  const header = (
    <div className="text-center">
      <Wordmark />
      <Eyebrow className="mt-8">{session.is_blind ? "Blind tasting" : "Open tasting"}</Eyebrow>
      <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight">{session.title}</h1>
    </div>
  );

  if (sessionEnded) {
    return (
      <PageShell center>
        <div className="w-full">
          {header}
          <Card className="mt-8 text-center">
            <Trophy className="mx-auto h-8 w-8 text-accent" />
            <div className="mt-3 font-semibold">This tasting has wrapped up</div>
            <p className="mt-1 text-sm text-fg-muted">
              Scoring is closed, but you can still see how the bottles stacked up.
            </p>
            <Link
              href={`/reveal/${session.id}`}
              className={buttonStyles({ variant: "primary", size: "lg", block: true, className: "mt-5" })}
            >
              See the results
            </Link>
          </Card>
        </div>
      </PageShell>
    );
  }

  if (existingParticipant) {
    return (
      <PageShell center>
        <div className="w-full">
          {header}
          <Card className="mt-8 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-accent-soft font-display text-2xl font-semibold text-accent">
              {existingParticipant.display_name.charAt(0).toUpperCase()}
            </div>
            <div className="mt-3 text-lg font-semibold">Welcome back, {existingParticipant.display_name}</div>
            <p className="mt-1 text-sm text-fg-muted">This phone is already in the tasting.</p>
            <Button variant="primary" size="lg" block className="mt-5" onClick={continueAsExisting}>
              Continue scoring <ChevronRight className="h-4 w-4" />
            </Button>
          </Card>
          <p className="mt-4 px-2 text-center text-xs text-fg-faint">
            Joining as someone else on this phone? Use a private browser tab.
          </p>
        </div>
      </PageShell>
    );
  }

  const chosenName = lockedProfileName || customProfileName.trim() || selectedProfile;

  return (
    <PageShell center>
      <div className="w-full">
        {header}

        <form onSubmit={submit} className="mt-8">
          <Card>
            {lockedProfileName ? (
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-accent-soft font-display text-lg font-semibold text-accent">
                  {lockedProfileName.charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <div className="text-xs text-fg-faint">Joining as</div>
                  <div className="truncate font-semibold">{lockedProfileName}</div>
                </div>
              </div>
            ) : (
              <>
                <div className="font-semibold">Who&apos;s tasting?</div>
                <p className="mt-0.5 text-sm text-fg-muted">
                  Your name shows up on the reveal next to your scores.
                </p>

                {profileOptions.length ? (
                  <div className="mt-4 flex flex-wrap gap-2" role="radiogroup" aria-label="Saved names">
                    {profileOptions.map((profile) => {
                      const active = !customProfileName.trim() && selectedProfile === profile;
                      return (
                        <button
                          key={profile}
                          type="button"
                          role="radio"
                          aria-checked={active}
                          onClick={() => {
                            setSelectedProfile(profile);
                            setCustomProfileName("");
                            setFormError("");
                          }}
                          className={cx(
                            "flex h-10 items-center gap-1.5 rounded-full border px-4 text-sm font-semibold",
                            active
                              ? "border-accent bg-accent text-on-accent"
                              : "border-line bg-raised text-fg hover:border-line-strong",
                          )}
                        >
                          <UserRound className="h-3.5 w-3.5" />
                          {profile}
                        </button>
                      );
                    })}
                  </div>
                ) : null}

                <label htmlFor="new-name" className="mt-4 block text-xs font-semibold text-fg-muted">
                  {profileOptions.length ? "Or a new name" : "Your name"}
                </label>
                <input
                  id="new-name"
                  value={customProfileName}
                  onChange={(e) => {
                    setCustomProfileName(e.target.value);
                    setFormError("");
                    if (e.target.value) setSelectedProfile("");
                  }}
                  maxLength={80}
                  autoComplete="nickname"
                  placeholder="Sam"
                  className="mt-1.5 h-12 w-full rounded-2xl border border-line bg-sunken px-4 text-fg placeholder:text-fg-faint focus:border-accent focus:outline-none"
                />
              </>
            )}

            {formError ? (
              <Notice tone="danger" className="mt-4">
                {formError}
              </Notice>
            ) : null}

            <Button type="submit" variant="primary" size="lg" block className="mt-5" disabled={submitting}>
              {submitting ? (
                "Joining…"
              ) : (
                <>
                  <GlassWater className="h-4 w-4" />
                  {chosenName ? `Join as ${chosenName}` : "Join tasting"}
                </>
              )}
            </Button>
          </Card>
        </form>

        <p className="mt-4 px-2 text-center text-xs text-fg-faint">
          {lockedProfileName
            ? "Your account name is used for every tasting."
            : "No account needed. Names you use are remembered on this phone."}
        </p>
      </div>
    </PageShell>
  );
}
