"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";

type SessionRow = {
  id: string;
  title: string;
  host_key: string;
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

export default function HostTastersPage() {
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();

  const sessionId = params?.id;
  const hostKey = searchParams.get("key") || "";

  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<SessionRow | null>(null);
  const [participants, setParticipants] = useState<ParticipantRow[]>([]);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const [saveHint, setSaveHint] = useState("");
  const saveHintTimer = useRef<number | null>(null);

  const hostUrl = useMemo(() => {
    if (!sessionId) return "";
    const keyPart = hostKey ? `?key=${encodeURIComponent(hostKey)}` : "";
    return `/host/${sessionId}${keyPart}`;
  }, [sessionId, hostKey]);

  const showSaved = (text: string) => {
    setSaveHint(text);
    if (saveHintTimer.current) window.clearTimeout(saveHintTimer.current);
    saveHintTimer.current = window.setTimeout(() => {
      setSaveHint("");
      saveHintTimer.current = null;
    }, 1500);
  };

  const loadAll = async () => {
    try {
      setLoading(true);
      setError("");

      if (!sessionId) {
        setError("Missing session id.");
        setLoading(false);
        return;
      }
      if (!hostKey) {
        setError("Missing host key (this link is the host-only link).");
        setLoading(false);
        return;
      }

      const { data: sess, error: sessErr } = await supabase
        .from("sessions")
        .select("id,title,host_key,is_blind,status,created_at")
        .eq("id", sessionId)
        .single();

      if (sessErr) {
        setError(sessErr.message);
        setLoading(false);
        return;
      }

      if (!sess || sess.host_key !== hostKey) {
        setError("Host key mismatch. This link is not authorized.");
        setLoading(false);
        return;
      }

      setSession(sess as SessionRow);

      const { data: participantRows, error: partErr } = await supabase
        .from("participants")
        .select("id,session_id,display_name,created_at")
        .eq("session_id", sessionId)
        .order("created_at", { ascending: true });

      if (partErr) {
        setError(partErr.message);
        setLoading(false);
        return;
      }

      setParticipants((participantRows || []) as ParticipantRow[]);
      setLoading(false);
    } catch (e: any) {
      setError(e?.message || "Unknown error.");
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
    return () => {
      if (saveHintTimer.current) window.clearTimeout(saveHintTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, hostKey]);

  const removeTaster = async (participant: ParticipantRow) => {
    if (!sessionId) return;

    const ok = window.confirm(
      `Remove taster ${participant.display_name}?\n\nThis deletes their saved scores for this session too.`
    );
    if (!ok) return;

    try {
      setBusyId(participant.id);
      setError("");

      const { error: scoreErr } = await supabase
        .from("scores")
        .delete()
        .eq("session_id", sessionId)
        .eq("participant_id", participant.id);

      if (scoreErr) {
        setError(scoreErr.message);
        setBusyId(null);
        return;
      }

      const { error: partErr } = await supabase.from("participants").delete().eq("id", participant.id);

      if (partErr) {
        setError(partErr.message);
        setBusyId(null);
        return;
      }

      setParticipants((prev) => prev.filter((p) => p.id !== participant.id));
      setBusyId(null);
      showSaved("Taster removed");
    } catch (e: any) {
      setError(e?.message || "Unknown error.");
      setBusyId(null);
    }
  };

  if (loading) {
    return (
      <main className="min-h-screen bg-zinc-900 text-white flex items-center justify-center p-6">
        <div className="text-zinc-300">Loading tasters...</div>
      </main>
    );
  }

  if (error) {
    return (
      <main className="min-h-screen bg-zinc-900 text-white flex items-center justify-center p-6">
        <div className="max-w-lg w-full bg-zinc-800 border border-zinc-700 rounded-2xl p-6">
          <h1 className="text-xl font-bold text-amber-400 mb-2">Tasters Error</h1>
          <p className="text-zinc-300">{error}</p>
          <div className="mt-4">
            <Link
              href={hostUrl || "/"}
              className="inline-flex items-center justify-center bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-100 font-semibold px-4 py-2 rounded-xl"
            >
              Back to Host Dashboard
            </Link>
          </div>
        </div>
      </main>
    );
  }

  if (!session) return null;

  return (
    <main className="min-h-screen bg-zinc-900 text-white p-6">
      <div className="max-w-2xl mx-auto">
        <div className="bg-zinc-800 border border-zinc-700 rounded-3xl p-6 md:p-8 shadow-lg">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl md:text-3xl font-extrabold text-amber-400">{session.title}</h1>
              <p className="text-zinc-400 mt-1">
                Tasters • <span className="text-zinc-200 font-semibold">{participants.length}</span>
              </p>
              <p className="text-zinc-500 text-sm mt-1">
                Remove a taster here if someone joined by mistake. Their saved scores for this session are removed too.
              </p>
            </div>

            <div className="flex flex-col items-end gap-2">
              {saveHint ? (
                <div className="text-xs text-zinc-300 bg-zinc-900 border border-zinc-700 rounded-full px-3 py-1">
                  {saveHint}
                </div>
              ) : (
                <div className="text-xs text-zinc-600"> </div>
              )}

              <Link
                href={hostUrl}
                className="inline-flex items-center justify-center bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-100 font-semibold px-4 py-2 rounded-xl"
              >
                Back
              </Link>
            </div>
          </div>

          <div className="mt-6 bg-zinc-900 border border-zinc-700 rounded-2xl overflow-hidden">
            {participants.length === 0 ? (
              <div className="px-4 py-5 text-sm text-zinc-500">No tasters have joined this session yet.</div>
            ) : (
              participants.map((participant) => {
                const removing = busyId === participant.id;

                return (
                  <div
                    key={participant.id}
                    className="flex items-center justify-between gap-4 px-4 py-4 border-b border-zinc-800 last:border-b-0"
                  >
                    <div>
                      <div className="font-semibold text-zinc-100">{participant.display_name}</div>
                      <div className="text-xs text-zinc-500">Joined this session</div>
                    </div>

                    <button
                      onClick={() => removeTaster(participant)}
                      disabled={!!busyId}
                      className={[
                        "text-sm px-4 py-2 rounded-xl border",
                        busyId
                          ? "text-zinc-500 bg-zinc-800 border-zinc-800 cursor-not-allowed"
                          : "text-red-300 hover:text-red-200 bg-zinc-800 hover:bg-zinc-700 border-zinc-700",
                      ].join(" ")}
                    >
                      {removing ? "Removing..." : "Remove"}
                    </button>
                  </div>
                );
              })
            )}
          </div>

          <div className="mt-4 text-xs text-zinc-500">
            Removing someone does not clear their phone automatically, but they will not count in stats and their old
            scores will be gone.
          </div>
        </div>
      </div>
    </main>
  );
}
