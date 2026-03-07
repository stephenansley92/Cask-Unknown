"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import {
  buildWhiskeyIdentityKey,
  buildWhiskeyInsertPayload,
  buildWhiskeySearchText,
  EMPTY_WHISKEY_FORM_VALUES,
  mapWhiskeyRow,
  type WhiskeyFormValues,
  type WhiskeyOption,
  WHISKEY_SELECT_COLUMNS,
} from "@/lib/whiskey/schema";

type SessionRow = {
  id: string;
  title: string;
  host_key: string;
  is_blind: boolean;
  status: string;
};

type PourRaw = {
  id: string;
  session_id: string;
  code: string;
  bottle_name: string | null;
  whiskey_id?: string | null;
  whiskey?: { name?: string | null } | { name?: string | null }[] | null;
  sort_order: number;
};

type PourRow = {
  id: string;
  session_id: string;
  code: string;
  bottle_name: string | null;
  whiskey_id: string | null;
  whiskey_name: string | null;
  sort_order: number;
};

const DEFAULT_CODES = ["A", "B", "C", "D"];

function getErrorMessage(error: unknown, fallback = "Unknown error.") {
  if (!error) return fallback;
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string" && error.trim()) return error;
  if (
    typeof error === "object" &&
    "message" in error &&
    typeof (error as { message?: unknown }).message === "string"
  ) {
    const message = (error as { message: string }).message.trim();
    if (message) return message;
  }
  return fallback;
}

function extractWhiskeyName(whiskey: PourRaw["whiskey"]) {
  if (!whiskey) return null;
  if (Array.isArray(whiskey)) return whiskey[0]?.name?.trim() || null;
  return whiskey.name?.trim() || null;
}

function mapPourRow(raw: PourRaw): PourRow {
  return {
    id: raw.id,
    session_id: raw.session_id,
    code: raw.code,
    bottle_name: raw.bottle_name ?? null,
    whiskey_id:
      typeof raw.whiskey_id === "string" && raw.whiskey_id.trim()
        ? raw.whiskey_id
        : null,
    whiskey_name: extractWhiskeyName(raw.whiskey),
    sort_order: Number(raw.sort_order ?? 0),
  };
}

function whiskeyIdentityKey(whiskey: WhiskeyOption) {
  if (whiskey.identityKey) return whiskey.identityKey;
  return buildWhiskeyIdentityKey({
    name: whiskey.name,
    distillery: whiskey.distillery,
    proof: whiskey.proof,
    bottleSize: whiskey.bottleSize,
  });
}

function nextCode(existingCodes: string[]) {
  const set = new Set(existingCodes.map((value) => value.trim().toUpperCase()));
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  for (const char of alphabet) {
    if (!set.has(char)) return char;
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
  const [whiskeys, setWhiskeys] = useState<WhiskeyOption[]>([]);
  const [libraryUserId, setLibraryUserId] = useState("");
  const [librarySearch, setLibrarySearch] = useState("");
  const [newWhiskey, setNewWhiskey] = useState<WhiskeyFormValues>(
    EMPTY_WHISKEY_FORM_VALUES
  );
  const [openPourId, setOpenPourId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [libraryError, setLibraryError] = useState("");
  const [creatingWhiskey, setCreatingWhiskey] = useState(false);
  const [saveHint, setSaveHint] = useState("");
  const saveHintTimer = useRef<number | null>(null);

  const hostUrl = useMemo(() => {
    if (!sessionId) return "";
    return `/host/${sessionId}${hostKey ? `?key=${encodeURIComponent(hostKey)}` : ""}`;
  }, [hostKey, sessionId]);

  const filteredWhiskeys = useMemo(() => {
    const q = librarySearch.trim().toLowerCase();
    if (!q) return whiskeys;
    return whiskeys.filter((item) => buildWhiskeySearchText(item).includes(q));
  }, [librarySearch, whiskeys]);

  const showSaved = (text = "Saved") => {
    setSaveHint(text);
    if (saveHintTimer.current) window.clearTimeout(saveHintTimer.current);
    saveHintTimer.current = window.setTimeout(() => setSaveHint(""), 1500);
  };

  const loadWhiskeys = async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setLibraryUserId("");
      setWhiskeys([]);
      return;
    }

    setLibraryUserId(user.id);
    const selectAttempts = [
      WHISKEY_SELECT_COLUMNS,
      "id,name,distillery,proof,bottle_size,category,subcategory,rarity,msrp,secondary,paid,status,notes,identity_key",
      "id,name,distillery,proof,age",
      "id,name,distillery,proof",
      "id,name",
    ];

    for (const selectColumns of selectAttempts) {
      const { data, error: whiskeysError } = await supabase
        .from("whiskeys")
        .select(selectColumns)
        .order("created_at", { ascending: false });

      if (whiskeysError) {
        continue;
      }

      setWhiskeys(
        ((data || []) as unknown as Record<string, unknown>[]).map(mapWhiskeyRow)
      );
      return;
    }

    setLibraryError("Could not load whiskey library.");
    setWhiskeys([]);
  };

  const loadPours = async () => {
    if (!sessionId) return [];

    const selectAttempts = [
      "id,session_id,code,bottle_name,whiskey_id,whiskey:whiskeys(name),sort_order",
      "id,session_id,code,bottle_name,whiskey_id,sort_order",
      "id,session_id,code,bottle_name,sort_order",
    ];

    let lastError: unknown = null;
    for (const selectColumns of selectAttempts) {
      const { data, error: poursError } = await supabase
        .from("pours")
        .select(selectColumns)
        .eq("session_id", sessionId)
        .order("sort_order", { ascending: true });

      if (poursError) {
        lastError = poursError;
        continue;
      }

      return ((data || []) as unknown as PourRaw[]).map(mapPourRow);
    }

    throw lastError;
  };

  const insertPours = async (
    rows: Array<{
      session_id: string;
      code: string;
      bottle_name: string | null;
      whiskey_id?: string | null;
      sort_order: number;
    }>
  ) => {
    const withWhiskeyId = await supabase
      .from("pours")
      .insert(rows)
      .select("id,session_id,code,bottle_name,whiskey_id,whiskey:whiskeys(name),sort_order");

    if (!withWhiskeyId.error) {
      return ((withWhiskeyId.data || []) as unknown as PourRaw[]).map(mapPourRow);
    }

    const rowsWithoutWhiskeyId = rows.map((row) =>
      Object.fromEntries(
        Object.entries(row).filter(([key]) => key !== "whiskey_id")
      )
    );
    const withoutWhiskeyId = await supabase
      .from("pours")
      .insert(rowsWithoutWhiskeyId)
      .select("id,session_id,code,bottle_name,sort_order");

    if (withoutWhiskeyId.error) {
      throw withoutWhiskeyId.error;
    }

    return ((withoutWhiskeyId.data || []) as PourRaw[]).map(mapPourRow);
  };

  const loadAll = async () => {
    try {
      setLoading(true);
      setError("");
      setLibraryError("");

      if (!sessionId || !hostKey) {
        setError("Missing session id or host key.");
        setLoading(false);
        return;
      }

      const { data: sess, error: sessErr } = await supabase
        .from("sessions")
        .select("id,title,host_key,is_blind,status")
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
      let loaded = await loadPours();

      if (loaded.length === 0) {
        const seedRows = DEFAULT_CODES.map((code, idx) => ({
          session_id: sessionId,
          code,
          bottle_name: null,
          whiskey_id: null,
          sort_order: idx + 1,
        }));
        loaded = await insertPours(seedRows);
      }

      setPours(loaded.sort((a, b) => a.sort_order - b.sort_order));
      setOpenPourId(loaded[0]?.id || null);
      await loadWhiskeys();
      setLoading(false);
    } catch (e: unknown) {
      setError(getErrorMessage(e));
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

  const updateNewWhiskey = (field: keyof WhiskeyFormValues, value: string) => {
    setNewWhiskey((prev) => ({ ...prev, [field]: value }));
  };

  const updatePour = (id: string, patch: Partial<PourRow>) => {
    setPours((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  };

  const savePour = async (pourId: string) => {
    const row = pours.find((item) => item.id === pourId);
    if (!row) return;
    const withWhiskeyUpdate = await supabase
      .from("pours")
      .update({ bottle_name: row.bottle_name, whiskey_id: row.whiskey_id })
      .eq("id", pourId);

    if (!withWhiskeyUpdate.error) {
      showSaved();
      return;
    }

    const fallbackUpdate = await supabase
      .from("pours")
      .update({ bottle_name: row.bottle_name })
      .eq("id", pourId);

    if (fallbackUpdate.error) {
      setError(getErrorMessage(fallbackUpdate.error));
      return;
    }

    showSaved();
  };

  const createWhiskey = async () => {
    const payload = buildWhiskeyInsertPayload(newWhiskey);
    if (!payload.name) {
      setLibraryError("Whiskey name is required.");
      return;
    }

    const identityKey = payload.identity_key || "";
    const existing = whiskeys.find((w) => whiskeyIdentityKey(w) === identityKey);
    if (existing) {
      setNewWhiskey(EMPTY_WHISKEY_FORM_VALUES);
      return;
    }

    if (!libraryUserId) {
      setLibraryError("Sign in to create whiskey records.");
      return;
    }

    setCreatingWhiskey(true);
    setLibraryError("");
    const payloadWithoutAge = Object.fromEntries(
      Object.entries(payload).filter(([key]) => key !== "age")
    );

    const insertAttempts = [
      { user_id: libraryUserId, ...payload },
      { user_id: libraryUserId, ...payloadWithoutAge },
      {
        user_id: libraryUserId,
        name: payload.name,
        distillery: payload.distillery,
        proof: payload.proof,
      },
      {
        user_id: libraryUserId,
        name: payload.name,
      },
    ];

    let data: unknown = null;
    let createError: unknown = null;

    for (const insertPayload of insertAttempts) {
      const result = await supabase
        .from("whiskeys")
        .insert(insertPayload)
        .select("id,name,distillery,proof,bottle_size,category,subcategory,rarity,msrp,secondary,paid,status,notes,identity_key")
        .single();

      if (!result.error && result.data) {
        data = result.data;
        createError = null;
        break;
      }

      createError = result.error;
    }

    setCreatingWhiskey(false);

    if (createError || !data) {
      setLibraryError(getErrorMessage(createError, "Could not create whiskey."));
      return;
    }

    const created = mapWhiskeyRow(data as unknown as Record<string, unknown>);
    setWhiskeys((prev) => [created, ...prev]);
    setNewWhiskey(EMPTY_WHISKEY_FORM_VALUES);
    showSaved("Whiskey created");
  };

  const selectWhiskeyForPour = async (pour: PourRow, whiskey: WhiskeyOption | null) => {
    const nextBottleName = whiskey?.name || null;
    updatePour(pour.id, {
      whiskey_id: whiskey?.id || null,
      whiskey_name: whiskey?.name || null,
      bottle_name: nextBottleName,
    });
    await savePour(pour.id);
  };

  const addPour = async () => {
    if (!sessionId) return;
    const code = nextCode(pours.map((p) => p.code));
    const sortOrder = pours.length > 0 ? Math.max(...pours.map((p) => p.sort_order)) + 1 : 1;
    let inserted: PourRow[] = [];
    try {
      inserted = await insertPours([
        {
          session_id: sessionId,
          code,
          bottle_name: null,
          whiskey_id: null,
          sort_order: sortOrder,
        },
      ]);
    } catch (insertError: unknown) {
      setError(getErrorMessage(insertError, "Could not add pour."));
      return;
    }

    const newPour = inserted[0];
    if (!newPour) {
      setError("Could not add pour.");
      return;
    }

    setPours((prev) => [...prev, newPour].sort((a, b) => a.sort_order - b.sort_order));
    setOpenPourId(newPour.id);
    showSaved("Added");
  };

  const deletePour = async (pourId: string) => {
    const row = pours.find((item) => item.id === pourId);
    if (!row) return;

    const ok = window.confirm(`Delete pour ${row.code}?`);
    if (!ok) return;

    const { error: deleteError } = await supabase.from("pours").delete().eq("id", pourId);
    if (deleteError) {
      setError(getErrorMessage(deleteError));
      return;
    }

    const remaining = pours
      .filter((item) => item.id !== pourId)
      .sort((a, b) => a.sort_order - b.sort_order);
    setPours(remaining);
    if (openPourId === pourId) {
      setOpenPourId(remaining[0]?.id || null);
    }
    showSaved("Deleted");
  };

  if (loading) {
    return (
      <main className="min-h-screen bg-zinc-900 text-white flex items-center justify-center p-6">
        <div className="text-zinc-300">Loading pours...</div>
      </main>
    );
  }

  if (error || !session) {
    return (
      <main className="min-h-screen bg-zinc-900 text-white flex items-center justify-center p-6">
        <div className="max-w-lg w-full bg-zinc-800 border border-zinc-700 rounded-2xl p-6">
          <h1 className="text-xl font-bold text-amber-400 mb-2">Pours Error</h1>
          <p className="text-zinc-300">{error || "Could not load session."}</p>
          <div className="mt-4">
            <Link href={hostUrl || "/"} className="inline-flex items-center justify-center bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-100 font-semibold px-4 py-2 rounded-xl">
              Back to Host Dashboard
            </Link>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-zinc-900 text-white p-6">
      <div className="max-w-2xl mx-auto">
        <div className="bg-zinc-800 border border-zinc-700 rounded-3xl p-6 md:p-8 shadow-lg space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl md:text-3xl font-extrabold text-amber-400">{session.title}</h1>
              <p className="text-zinc-500 text-sm mt-1">Blind and Rate now share the same whiskey fields.</p>
            </div>
            <Link href={hostUrl} className="inline-flex items-center justify-center bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-100 font-semibold px-4 py-2 rounded-xl">
              Back
            </Link>
          </div>

          {saveHint ? <div className="text-xs text-zinc-300">{saveHint}</div> : null}
          {libraryError ? <div className="text-xs text-red-300">{libraryError}</div> : null}

          <input
            value={librarySearch}
            onChange={(e) => setLibrarySearch(e.target.value)}
            placeholder="Search whiskey library"
            className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-4 py-3 text-zinc-200 placeholder:text-zinc-500"
          />

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {[
              { key: "name", placeholder: "Name (required)" },
              { key: "distillery", placeholder: "Distillery" },
              { key: "proof", placeholder: "Proof" },
              { key: "age", placeholder: "Age" },
              { key: "bottleSize", placeholder: "Bottle size" },
              { key: "category", placeholder: "Category" },
              { key: "subcategory", placeholder: "Subcategory" },
              { key: "rarity", placeholder: "Rarity" },
              { key: "msrp", placeholder: "MSRP" },
              { key: "secondary", placeholder: "Secondary" },
              { key: "paid", placeholder: "Paid" },
              { key: "status", placeholder: "Status" },
            ].map((field) => (
              <input
                key={field.key}
                value={newWhiskey[field.key as keyof WhiskeyFormValues]}
                onChange={(e) =>
                  updateNewWhiskey(field.key as keyof WhiskeyFormValues, e.target.value)
                }
                placeholder={field.placeholder}
                className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-4 py-3 text-zinc-200 placeholder:text-zinc-500"
              />
            ))}
          </div>
          <textarea
            value={newWhiskey.notes}
            onChange={(e) => updateNewWhiskey("notes", e.target.value)}
            placeholder="Notes"
            className="w-full min-h-[86px] bg-zinc-900 border border-zinc-700 rounded-xl px-4 py-3 text-zinc-200 placeholder:text-zinc-500"
          />
          <button
            onClick={createWhiskey}
            disabled={creatingWhiskey || !libraryUserId}
            className="bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-100 font-semibold px-4 py-2 rounded-xl disabled:opacity-60"
          >
            {creatingWhiskey ? "Creating..." : "Create Whiskey"}
          </button>

          <button onClick={addPour} className="bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-100 font-semibold px-4 py-2 rounded-xl">
            + Add Pour
          </button>

          <div className="space-y-2">
            {pours.map((pour) => {
              const isOpen = openPourId === pour.id;
              return (
                <div key={pour.id} className="rounded-2xl border border-zinc-700">
                  <button
                    type="button"
                    onClick={() => setOpenPourId(isOpen ? null : pour.id)}
                    className="w-full text-left px-4 py-3 flex items-center justify-between"
                  >
                    <div>
                      <div className="font-semibold">Pour {pour.code}</div>
                      <div className="text-xs text-zinc-500">
                        {pour.whiskey_name || pour.bottle_name || "No whiskey selected"}
                      </div>
                    </div>
                    <div className="text-xs text-zinc-500">{isOpen ? "Hide" : "Edit"}</div>
                  </button>
                  {isOpen ? (
                    <div className="px-4 pb-4 space-y-3">
                      <div className="max-h-48 overflow-y-auto space-y-2">
                        {filteredWhiskeys.slice(0, 20).map((item) => (
                          <button
                            key={`${pour.id}-${item.id}`}
                            type="button"
                            onClick={() => selectWhiskeyForPour(pour, item)}
                            className={[
                              "w-full text-left rounded-xl border px-3 py-2",
                              pour.whiskey_id === item.id
                                ? "border-amber-500 text-amber-200"
                                : "border-zinc-700 text-zinc-200",
                            ].join(" ")}
                          >
                            <div className="font-semibold">{item.name}</div>
                            <div className="text-xs text-zinc-500">
                              {[item.distillery, item.proof !== null ? `${item.proof} proof` : null, item.bottleSize]
                                .filter(Boolean)
                                .join(" - ")}
                            </div>
                          </button>
                        ))}
                      </div>
                      <button
                        type="button"
                        onClick={() => selectWhiskeyForPour(pour, null)}
                        className="text-xs text-zinc-300 hover:text-zinc-100 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 px-3 py-2 rounded-lg"
                      >
                        Clear whiskey selection
                      </button>
                      <input
                        value={pour.bottle_name ?? ""}
                        onChange={(e) => updatePour(pour.id, { bottle_name: e.target.value })}
                        onBlur={() => savePour(pour.id)}
                        placeholder="Reveal bottle name"
                        className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-4 py-3 text-zinc-200"
                      />
                      <button
                        type="button"
                        onClick={() => deletePour(pour.id)}
                        className="text-xs text-red-300 hover:text-red-200 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 px-3 py-2 rounded-lg"
                      >
                        Delete pour
                      </button>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </main>
  );
}
