"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
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
  created_at?: string;
};

function storageKey(sessionId: string) {
  return `cask_unknown_participant_${sessionId}`;
}

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
          .select("id,session_id,display_name,created_at")
          .eq("id", participantId)
          .single();

        if (!pErr && p && (p as ParticipantRow).session_id === sessionId) {
          const row = p as ParticipantRow;
          setExistingParticipant(row);
          setSelectedProfile(row.display_name || "");
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
  }, [sessionId]);

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

      const clean = customProfileName.trim() || selectedProfile.trim();

      if (!clean) {
        setError("Please choose or enter a profile.");
        return;
      }

      setSubmitting(true);
      setError("");

      const { data: existing, error: existingErr } = await supabase
        .from("participants")
        .select("id,session_id,display_name,created_at")
        .eq("session_id", sessionId)
        .eq("display_name", clean)
        .maybeSingle();

      if (existingErr) {
        setError(existingErr.message);
        setSubmitting(false);
        return;
      }

      let row = existing as ParticipantRow | null;

      if (!row) {
        const { data: inserted, error: insErr } = await supabase
          .from("participants")
          .insert({
            session_id: sessionId,
            display_name: clean,
          })
          .select("id,session_id,display_name,created_at")
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
      <main className="min-h-screen bg-[#F8F8F6] text-zinc-900 flex items-center justify-center p-6">
        <div className="text-zinc-500">Loading...</div>
      </main>
    );
  }

  if (error) {
    return (
      <main className="min-h-screen bg-[#F8F8F6] text-zinc-900 flex items-center justify-center p-6">
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
    <main className="min-h-screen bg-[#F8F8F6] text-zinc-900 p-6">
      <div className="max-w-md mx-auto">
        <div className="bg-white border border-zinc-200 rounded-3xl p-6 shadow-sm">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-sm text-zinc-500">Cask Unknown</div>
              <h1 className="text-2xl font-extrabold tracking-tight mt-1">
                {session.title}
              </h1>
              <div className="text-sm text-zinc-500 mt-1">
                {session.is_blind ? "Blind tasting" : "Tasting"} - Status:{" "}
                <span className="text-zinc-800 font-semibold">
                  {session.status}
                </span>
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
                className="mt-4 w-full rounded-2xl px-4 py-3 font-semibold bg-zinc-900 text-white hover:bg-zinc-800"
              >
                Continue to Scoring
              </button>

              <div className="mt-4 text-xs text-zinc-500">
                Want to join as a different person on this same phone? Clear
                site data or open in an incognito tab.
              </div>
            </div>
          ) : (
            <div className="mt-6">
              <label className="block text-sm font-semibold text-zinc-800">
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
                className="mt-2 w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-900/10"
              >
                <option value="">Select a saved profile</option>
                {profileOptions.map((profile) => (
                  <option key={profile} value={profile}>
                    {profile}
                  </option>
                ))}
              </select>

              <div className="mt-3 text-center text-xs font-semibold uppercase tracking-[0.18em] text-zinc-400">
                Or
              </div>

              <label className="mt-3 block text-sm font-semibold text-zinc-800">
                Type a new profile name
              </label>

              <input
                value={customProfileName}
                onChange={(e) => {
                  setCustomProfileName(e.target.value);
                  if (e.target.value) {
                    setSelectedProfile("");
                  }
                }}
                className="mt-2 w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-900/10"
                placeholder="Select or type a new profile name"
              />

              <button
                onClick={submit}
                disabled={submitting}
                className="mt-4 w-full rounded-2xl px-4 py-3 font-semibold bg-zinc-900 text-white hover:bg-zinc-800 disabled:opacity-60"
              >
                {submitting ? "Joining..." : "Join Session"}
              </button>

              <div className="mt-4 text-xs text-zinc-500">
                Select a saved profile or type a new one. New profiles are
                saved automatically on this phone.
              </div>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
