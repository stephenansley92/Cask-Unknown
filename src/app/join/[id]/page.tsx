"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  ACTIVE_PROFILE_STORAGE_KEY,
  getProfileOptions,
  saveProfileOption,
} from "@/lib/profiles";

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
  const [error, setError] = useState("");

  const [selectedProfile, setSelectedProfile] = useState("");
  const [customProfileName, setCustomProfileName] = useState("");
  const [profileOptions, setProfileOptions] = useState<string[]>([]);
  const [lockedProfileName, setLockedProfileName] = useState("");
  const [authUserId, setAuthUserId] = useState("");
  const [isOwner, setIsOwner] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [existingParticipant, setExistingParticipant] =
    useState<ParticipantRow | null>(null);

  const scoreUrl = useMemo(() => {
    if (!sessionId) return "/";
    return `/score/${sessionId}`;
  }, [sessionId]);

  useEffect(() => {
    const run = async () => {
      try {
        setLoading(true);
        setError("");
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
        setIsOwner(ownerMatch);
        setAuthUserId(user?.id || "");

        let enforcedProfileName = "";

        if (user && !ownerMatch) {
          const { data: profileData, error: profileError } = await authClient
            .from("user_profiles")
            .select("display_name")
            .eq("user_id", user.id)
            .maybeSingle();

          if (profileError) {
            setError(profileError.message);
            setLoading(false);
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
          setError("Missing session id.");
          setLoading(false);
          return;
        }

        const { data: sess, error: sessErr } = await supabase
          .from("sessions")
          .select("id,title,is_blind,status,created_at")
          .eq("id", sessionId)
          .single();

        if (sessErr) {
          setError(sessErr.message);
          setLoading(false);
          return;
        }

        setSession(sess as SessionRow);

        // Block joining sessions that are already past the scoring phase
        const sStatus = ((sess as SessionRow).status || "").toLowerCase();
        if (sStatus === "revealed" || sStatus === "closed") {
          setError(
            `This session has already ended (status: ${(sess as SessionRow).status}). Ask the host to share the reveal link instead.`
          );
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

        let parsed: { participantId?: string; displayName?: string } | null =
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

        const { data: p, error: pErr } = await supabase
          .from("participants")
          .select("id,session_id,display_name,user_id,created_at")
          .eq("id", participantId)
          .single();

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
        setError(e instanceof Error ? e.message : "Unknown error.");
        setLoading(false);
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

  const submit = async () => {
    try {
      if (!sessionId) return;

      const enforcedProfile = lockedProfileName.trim();
      const clean = enforcedProfile || customProfileName.trim() || selectedProfile.trim();

      if (!clean) {
        setError("Please choose or enter a profile.");
        return;
      }

      if (enforcedProfile && clean !== enforcedProfile) {
        setError("Profile name is locked for this account.");
        return;
      }

      setSubmitting(true);
      setError("");

      // Use an authenticated client so RLS policies can verify auth.uid() = user_id
      const dbClient = authUserId ? createSupabaseBrowserClient() : supabase;

      let row: ParticipantRow | null = null;

      if (authUserId && !isOwner) {
        const { data: ownedParticipant, error: ownedParticipantError } =
          await dbClient
            .from("participants")
            .select("id,session_id,display_name,user_id,created_at")
            .eq("session_id", sessionId)
            .eq("user_id", authUserId)
            .maybeSingle();

        if (ownedParticipantError) {
          setError(ownedParticipantError.message);
          setSubmitting(false);
          return;
        }

        row = (ownedParticipant as ParticipantRow | null) || null;

        if (!row) {
          const { data: legacyParticipant, error: legacyParticipantError } =
            await dbClient
              .from("participants")
              .select("id,session_id,display_name,user_id,created_at")
              .eq("session_id", sessionId)
              .eq("display_name", clean)
              .is("user_id", null)
              .maybeSingle();

          if (legacyParticipantError) {
            setError(legacyParticipantError.message);
            setSubmitting(false);
            return;
          }

          if (legacyParticipant) {
            const { data: claimedParticipant, error: claimError } = await dbClient
              .from("participants")
              .update({ user_id: authUserId })
              .eq("id", legacyParticipant.id as string)
              .select("id,session_id,display_name,user_id,created_at")
              .single();

            if (claimError) {
              setError(claimError.message);
              setSubmitting(false);
              return;
            }

            row = claimedParticipant as ParticipantRow;
          }
        }
      } else {
        const { data: existing, error: existingErr } = await dbClient
          .from("participants")
          .select("id,session_id,display_name,user_id,created_at")
          .eq("session_id", sessionId)
          .eq("display_name", clean)
          .maybeSingle();

        if (existingErr) {
          setError(existingErr.message);
          setSubmitting(false);
          return;
        }

        row = (existing as ParticipantRow | null) || null;
      }

      if (!row) {
        const insertPayload: {
          session_id: string;
          display_name: string;
          user_id?: string;
        } = {
          session_id: sessionId,
          display_name: clean,
        };

        if (authUserId && !isOwner) {
          insertPayload.user_id = authUserId;
        }

        const { data: inserted, error: insErr } = await dbClient
          .from("participants")
          .insert(insertPayload)
          .select("id,session_id,display_name,user_id,created_at")
          .single();

        if (insErr) {
          setError(insErr.message);
          setSubmitting(false);
          return;
        }

        row = inserted as ParticipantRow;
      }

      saveProfileOption(clean);

      if (typeof window !== "undefined") {
        window.localStorage.setItem(
          storageKey(sessionId),
          JSON.stringify({
            participantId: row.id,
            displayName: row.display_name,
          })
        );
        window.localStorage.setItem(ACTIVE_PROFILE_STORAGE_KEY, clean);
      }

      setProfileOptions(getProfileOptions());
      setExistingParticipant(row);
      setSubmitting(false);

      router.push(scoreUrl);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Unknown error.");
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <main className="min-h-screen bg-zinc-900 text-white flex items-center justify-center p-6">
        <div className="text-zinc-500">Loading...</div>
      </main>
    );
  }

  if (error) {
    return (
      <main className="min-h-screen bg-zinc-900 text-white flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-white border border-zinc-200 rounded-3xl p-6 shadow-sm">
          <div className="text-2xl font-extrabold tracking-tight">
            Join Error
          </div>
          <p className="text-zinc-600 mt-2">{error}</p>
        </div>
      </main>
    );
  }

  if (!session) return null;

  return (
    <main className="min-h-screen bg-zinc-900 text-white p-6">
      <div className="max-w-md mx-auto">
        <div className="bg-zinc-800 border border-zinc-700 rounded-3xl p-6 shadow-sm">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-sm text-zinc-500">Cask Unknown</div>
              <h1 className="text-2xl font-extrabold tracking-tight mt-1">
                {session.title}
              </h1>
              <div className="text-sm text-zinc-500 mt-1">
                {session.is_blind ? "Blind tasting" : "Open tasting"}
              </div>
            </div>
          </div>

          {existingParticipant ? (
            <div className="mt-6">
              <div className="text-zinc-700">
                Welcome back,{" "}
                <span className="font-semibold text-zinc-900">
                  {existingParticipant.display_name}
                </span>
                .
              </div>
              <div className="text-sm text-zinc-500 mt-1">
                This phone is already joined to this session.
              </div>

              <button
                onClick={continueAsExisting}
                className="mt-4 w-full rounded-2xl px-4 py-3 font-semibold bg-amber-500 hover:bg-amber-600 active:scale-95 text-black flex items-center justify-center gap-2"
              >
                Continue to Scoring <ChevronRight size={16} />
              </button>

              <div className="mt-4 text-xs text-zinc-500">
                Want to join as a different person on this same phone? Clear
                site data or open in an incognito tab.
              </div>
            </div>
          ) : (
            <div className="mt-6">
              {lockedProfileName ? (
                <div className="rounded-2xl border border-zinc-700 bg-zinc-900 px-4 py-4">
                  <div className="text-xs text-zinc-400">Your profile</div>
                  <div className="mt-1 font-semibold text-white">
                    {lockedProfileName}
                  </div>
                  <div className="mt-2 text-xs text-zinc-400">
                    Profile names are locked after setup. Ask the admin to
                    change it.
                  </div>
                </div>
              ) : (
                <>
                  <label className="block text-sm font-semibold text-zinc-200">
                    Your profile
                  </label>

                  <select
                    value={selectedProfile}
                    onChange={(e) => {
                      setSelectedProfile(e.target.value);
                      if (e.target.value) {
                        setCustomProfileName("");
                      }
                    }}
                    className="mt-2 w-full rounded-2xl border border-zinc-700 bg-zinc-900 px-4 py-3 text-zinc-100 focus:outline-none focus:ring-2 focus:ring-amber-500/30"
                  >
                    <option value="">Select a saved profile</option>
                    {profileOptions.map((profile) => (
                      <option key={profile} value={profile}>
                        {profile}
                      </option>
                    ))}
                  </select>

                  <div className="mt-4 flex items-center gap-3">
                    <div className="flex-1 h-px bg-zinc-200" />
                    <span className="text-xs font-semibold text-zinc-400">or enter a new name</span>
                    <div className="flex-1 h-px bg-zinc-200" />
                  </div>

                  <label className="mt-3 block text-sm font-semibold text-zinc-800">
                    New profile name
                  </label>

                  <input
                    value={customProfileName}
                    onChange={(e) => {
                      setCustomProfileName(e.target.value);
                      if (e.target.value) {
                        setSelectedProfile("");
                      }
                    }}
                    className="mt-2 w-full rounded-2xl border border-zinc-700 bg-zinc-900 px-4 py-3 text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-amber-500/30"
                    placeholder="Select or type a new profile name"
                  />
                </>
              )}

              <button
                onClick={submit}
                disabled={submitting}
                className="mt-4 w-full rounded-2xl px-4 py-3 font-semibold bg-amber-500 hover:bg-amber-600 active:scale-95 text-black disabled:opacity-60 flex items-center justify-center gap-2"
              >
                {submitting ? "Joining..." : "Join Session"}
                {!submitting && <ChevronRight size={16} />}
              </button>

              <div className="mt-4 text-xs text-zinc-500">
                {lockedProfileName
                  ? "Your account profile is used automatically for blind sessions."
                  : "Select a saved profile or type a new one. New profiles are saved automatically on this phone."}
              </div>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
