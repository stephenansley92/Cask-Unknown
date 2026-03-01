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

type PourRow = {
  id: string;
  session_id: string;
  code: string; // A, B, C...
  bottle_name: string | null; // reveal name (optional)
  sort_order: number; // position/order
  created_at?: string;
};

const DEFAULT_CODES = ["A", "B", "C", "D"];

function nextCode(existingCodes: string[]): string {
  const set = new Set(
    existingCodes.map((x) => (x || "").trim().toUpperCase()).filter(Boolean)
  );

  const toLabel = (n: number) => {
    // 0 -> A, 25 -> Z, 26 -> AA ...
    let s = "";
    let x = n;
    while (x >= 0) {
      s = String.fromCharCode((x % 26) + 65) + s;
      x = Math.floor(x / 26) - 1;
    }
    return s;
  };

  for (let i = 0; i < 5000; i++) {
    const candidate = toLabel(i);
    if (!set.has(candidate)) return candidate;
  }
  return `P${existingCodes.length + 1}`;
}

export default function HostPoursPage() {
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();

  const sessionId = params?.id;
  const hostKey = searchParams.get("key") || "";

  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<SessionRow | null>(null);
  const [pours, setPours] = useState<PourRow[]>([]);
  const [error, setError] = useState<string>("");

  const [openPourId, setOpenPourId] = useState<string | null>(null);
  const [saveHint, setSaveHint] = useState<string>("");
  const saveHintTimer = useRef<number | null>(null);

  const hostUrl = useMemo(() => {
    if (!sessionId) return "";
    const keyPart = hostKey ? `?key=${encodeURIComponent(hostKey)}` : "";
    return `/host/${sessionId}${keyPart}`;
  }, [sessionId, hostKey]);

  const showSaved = (text = "Saved ✓") => {
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

      const { data: poursData, error: poursErr } = await supabase
        .from("pours")
        .select("id,session_id,code,bottle_name,sort_order,created_at")
        .eq("session_id", sessionId)
        .order("sort_order", { ascending: true });

      if (poursErr) {
        setError(poursErr.message);
        setLoading(false);
        return;
      }

      let list = (poursData || []) as PourRow[];

      // Auto-create A–D if none exist
      if (list.length === 0) {
        const seedRows = DEFAULT_CODES.map((code, idx) => ({
          session_id: sessionId,
          code,
          bottle_name: null,
          sort_order: idx + 1,
        }));

        const { data: inserted, error: insErr } = await supabase
          .from("pours")
          .insert(seedRows)
          .select("id,session_id,code,bottle_name,sort_order,created_at")
          .order("sort_order", { ascending: true });

        if (insErr) {
          setError(insErr.message);
          setLoading(false);
          return;
        }

        list = ((inserted || []) as PourRow[]).sort(
          (a, b) => a.sort_order - b.sort_order
        );
      }

      setPours(list);
      setOpenPourId(list[0]?.id || null);

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

  const updatePourLocal = (pourId: string, patch: Partial<PourRow>) => {
    setPours((prev) =>
      prev.map((p) => (p.id === pourId ? { ...p, ...patch } : p))
    );
  };

  const savePour = async (pourId: string) => {
    const p = pours.find((x) => x.id === pourId);
    if (!p) return;

    const { error: upErr } = await supabase
      .from("pours")
      .update({
        bottle_name: p.bottle_name,
      })
      .eq("id", pourId);

    if (upErr) {
      setError(upErr.message);
      return;
    }

    showSaved();
  };

  const addPour = async () => {
    if (!sessionId) return;

    const existingCodes = pours.map((p) => p.code);
    const code = nextCode(existingCodes);
    const sort_order =
      pours.length > 0 ? Math.max(...pours.map((p) => p.sort_order)) + 1 : 1;

    const { data: inserted, error: insErr } = await supabase
      .from("pours")
      .insert({
        session_id: sessionId,
        code,
        bottle_name: null,
        sort_order,
      })
      .select("id,session_id,code,bottle_name,sort_order,created_at")
      .single();

    if (insErr) {
      setError(insErr.message);
      return;
    }

    const newPour = inserted as PourRow;
    setPours((prev) =>
      [...prev, newPour].sort((a, b) => a.sort_order - b.sort_order)
    );
    setOpenPourId(newPour.id);
    showSaved("Added ✓");
  };

  const deletePour = async (pourId: string) => {
    const p = pours.find((x) => x.id === pourId);
    if (!p) return;

    const ok = window.confirm(`Delete pour ${p.code}?`);
    if (!ok) return;

    const { error: delErr } = await supabase.from("pours").delete().eq("id", pourId);
    if (delErr) {
      setError(delErr.message);
      return;
    }

    const remaining = pours
      .filter((x) => x.id !== pourId)
      .sort((a, b) => a.sort_order - b.sort_order);

    setPours(remaining);
    if (openPourId === pourId) {
      setOpenPourId(remaining[0]?.id || null);
    }
    showSaved("Deleted ✓");
  };

  if (loading) {
    return (
      <main className="min-h-screen bg-zinc-900 text-white flex items-center justify-center p-6">
        <div className="text-zinc-300">Loading pours…</div>
      </main>
    );
  }

  if (error) {
    return (
      <main className="min-h-screen bg-zinc-900 text-white flex items-center justify-center p-6">
        <div className="max-w-lg w-full bg-zinc-800 border border-zinc-700 rounded-2xl p-6">
          <h1 className="text-xl font-bold text-amber-400 mb-2">Pours Error</h1>
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
              <h1 className="text-2xl md:text-3xl font-extrabold text-amber-400">
                {session.title}
              </h1>
              <p className="text-zinc-400 mt-1">
                Pours Setup • <span className="text-zinc-200 font-semibold">Auto-save</span>
              </p>
              <p className="text-zinc-500 text-sm mt-1">
                Codes are locked (A, B, C…). Bottle name is optional (you might not know it yet).
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

          <div className="mt-6">
            <div className="flex items-center justify-between gap-3">
              <div className="text-zinc-300 font-semibold">Pours</div>
              <button
                onClick={addPour}
                className="bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-100 font-semibold px-4 py-2 rounded-xl"
              >
                + Add Pour
              </button>
            </div>

            <div className="mt-3 bg-zinc-900 border border-zinc-700 rounded-2xl overflow-hidden">
              {pours.map((p) => {
                const isOpen = openPourId === p.id;
                const hasReveal = !!(p.bottle_name && p.bottle_name.trim().length > 0);

                return (
                  <div key={p.id} className="border-b border-zinc-800 last:border-b-0">
                    <button
                      type="button"
                      onClick={() => setOpenPourId(isOpen ? null : p.id)}
                      className="w-full text-left flex items-center justify-between gap-4 px-4 py-4 hover:bg-zinc-950/40"
                    >
                      <div className="flex items-center gap-3">
                        {/* Premium badge for the code */}
                        <div className="w-9 h-9 flex items-center justify-center rounded-full bg-zinc-800 border border-zinc-700 text-zinc-100 font-bold">
                          {p.code}
                        </div>

                        <div className="text-sm text-zinc-500">
                          {hasReveal ? "Reveal set" : "Reveal not set"}
                        </div>
                      </div>

                      <div className="text-xs text-zinc-500">{isOpen ? "Hide" : "Edit"}</div>
                    </button>

                    {isOpen && (
                      <div className="px-4 pb-5">
                        <div className="grid grid-cols-1 gap-3">
                          <div>
                            <label className="block text-xs text-zinc-400 mb-1">
                              Bottle name (optional — can be blank)
                            </label>
                            <input
                              value={p.bottle_name ?? ""}
                              onChange={(e) =>
                                updatePourLocal(p.id, { bottle_name: e.target.value })
                              }
                              onBlur={() => savePour(p.id)}
                              placeholder="e.g., Stagg Jr Batch 17 (if/when you know it)"
                              className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-zinc-200"
                            />
                          </div>
                        </div>

                        <div className="mt-4 flex items-center justify-between gap-3">
                          <div className="text-xs text-zinc-500">
                            Participants will only see {p.code}. Reveal info stays hidden until reveal.
                          </div>

                          <button
                            onClick={() => deletePour(p.id)}
                            className="text-sm text-red-300 hover:text-red-200 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 px-4 py-2 rounded-xl"
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="mt-4 text-xs text-zinc-500">
              Tip: Don’t know what’s in the blind? Leave bottle names blank and fill them in later.
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
