"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Check, ChevronDown, ChevronLeft, Minus, Plus, Trash2 } from "lucide-react";
import { ConfirmModal } from "@/components/confirm-modal";
import { Button, buttonStyles } from "@/components/ui/button";
import { Card, Eyebrow } from "@/components/ui/card";
import { LoadingScreen, Wordmark } from "@/components/ui/brand";
import { Notice } from "@/components/ui/notice";
import { PageShell } from "@/components/ui/page";
import { cx } from "@/components/ui/cx";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  deleteHostPour,
  getHostSession,
  upsertHostPours,
  type SessionPour,
} from "@/lib/session-api";
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
  whiskey_name?: string | null;
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
    whiskey_name: raw.whiskey_name?.trim() || extractWhiskeyName(raw.whiskey),
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
  const supabase = createSupabaseBrowserClient();

  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<SessionRow | null>(null);
  const [pours, setPours] = useState<PourRow[]>([]);
  const [whiskeys, setWhiskeys] = useState<WhiskeyOption[]>([]);
  const [libraryUserId, setLibraryUserId] = useState("");
  const [newWhiskey, setNewWhiskey] = useState<WhiskeyFormValues>(
    EMPTY_WHISKEY_FORM_VALUES
  );
  const [openPourId, setOpenPourId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [libraryError, setLibraryError] = useState("");
  const [creatingWhiskey, setCreatingWhiskey] = useState(false);
  const [saveHint, setSaveHint] = useState("");
  const [quickCount, setQuickCount] = useState(4);
  const [quickBusy, setQuickBusy] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const saveHintTimer = useRef<number | null>(null);

  const hostUrl = useMemo(() => {
    if (!sessionId) return "";
    return `/host/${sessionId}${hostKey ? `?key=${encodeURIComponent(hostKey)}` : ""}`;
  }, [hostKey, sessionId]);

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

  const insertPours = async (
    rows: Array<{
      session_id: string;
      code: string;
      bottle_name: string | null;
      whiskey_id?: string | null;
      sort_order: number;
    }>
  ) => {
    const { data, error } = await upsertHostPours(supabase, sessionId, rows, hostKey);
    if (error) throw error;
    return (data || []).map((row) => mapPourRow(row as PourRaw));
  };

  const loadAll = async () => {
    try {
      setLoading(true);
      setError("");
      setLibraryError("");

      if (!sessionId) {
        setError("Missing session id.");
        setLoading(false);
        return;
      }

      const { data: snapshot, error: sessErr } = await getHostSession(
        supabase,
        sessionId,
        hostKey,
      );

      if (sessErr || !snapshot) {
        setError(sessErr?.message || "Host session not found.");
        setLoading(false);
        return;
      }

      setSession(snapshot.session as SessionRow);
      const loaded = (snapshot.pours as SessionPour[]).map((row) => mapPourRow(row as PourRaw));
      const sorted = loaded.sort((a, b) => a.sort_order - b.sort_order);
      setPours(sorted);
      setQuickCount(Math.max(4, sorted.length));
      setOpenPourId(sorted[0]?.id || null);
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

  const getLibraryMatchesForPour = (pour: PourRow) => {
    const q = (pour.bottle_name || "").trim().toLowerCase();
    if (!q) return [];
    return whiskeys
      .filter((item) => buildWhiskeySearchText(item).includes(q))
      .slice(0, 20);
  };

  const updatePourBottleSearch = (pour: PourRow, value: string) => {
    const keepsSelectedWhiskey =
      Boolean(pour.whiskey_name) && value.trim() === pour.whiskey_name;

    updatePour(pour.id, {
      bottle_name: value,
      whiskey_id: keepsSelectedWhiskey ? pour.whiskey_id : null,
      whiskey_name: keepsSelectedWhiskey ? pour.whiskey_name : null,
    });
  };

  const savePourBottleSearch = async (pour: PourRow, value: string) => {
    const keepsSelectedWhiskey =
      Boolean(pour.whiskey_name) && value.trim() === pour.whiskey_name;

    await savePour({
      ...pour,
      bottle_name: value,
      whiskey_id: keepsSelectedWhiskey ? pour.whiskey_id : null,
      whiskey_name: keepsSelectedWhiskey ? pour.whiskey_name : null,
    });
  };

  const savePour = async (row: PourRow) => {
    const { error: updateError } = await upsertHostPours(
      supabase,
      sessionId,
      [{ id: row.id, bottle_name: row.bottle_name, whiskey_id: row.whiskey_id }],
      hostKey,
    );

    if (updateError) {
      setError(getErrorMessage(updateError));
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
    const nextPour: PourRow = {
      ...pour,
      whiskey_id: whiskey?.id || null,
      whiskey_name: whiskey?.name || null,
      bottle_name: whiskey?.name || null,
    };
    updatePour(pour.id, {
      whiskey_id: nextPour.whiskey_id,
      whiskey_name: nextPour.whiskey_name,
      bottle_name: nextPour.bottle_name,
    });
    await savePour(nextPour);
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

    const next = [...pours, newPour].sort((a, b) => a.sort_order - b.sort_order);
    setPours(next);
    setQuickCount(Math.max(quickCount, next.length));
    setOpenPourId(newPour.id);
    showSaved("Added");
  };

  const bulkAddPours = async (targetCount: number) => {
    if (!sessionId) return;
    const toAdd = targetCount - pours.length;
    if (toAdd <= 0) return;

    setQuickBusy(true);
    setError("");
    try {
      const existingCodes = pours.map((p) => p.code);
      const newRows: Array<{
        session_id: string;
        code: string;
        bottle_name: null;
        whiskey_id: null;
        sort_order: number;
      }> = [];
      let nextSortOrder =
        pours.length > 0 ? Math.max(...pours.map((p) => p.sort_order)) + 1 : 1;

      for (let i = 0; i < toAdd; i++) {
        const code = nextCode([...existingCodes, ...newRows.map((r) => r.code)]);
        newRows.push({
          session_id: sessionId,
          code,
          bottle_name: null,
          whiskey_id: null,
          sort_order: nextSortOrder++,
        });
      }

      const inserted = await insertPours(newRows);
      const next = [...pours, ...inserted].sort((a, b) => a.sort_order - b.sort_order);
      setPours(next);
      setOpenPourId(inserted[0]?.id || openPourId);
      showSaved(`${toAdd} pour${toAdd > 1 ? "s" : ""} added`);
    } catch (e: unknown) {
      setError(getErrorMessage(e, "Could not add pours."));
    } finally {
      setQuickBusy(false);
    }
  };

  const deletePour = async (pourId: string) => {
    const row = pours.find((item) => item.id === pourId);
    if (!row) return;

    const { error: deleteError } = await deleteHostPour(
      supabase,
      sessionId,
      pourId,
      hostKey,
    );
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
    return <LoadingScreen label="Loading pours" />;
  }

  if (!session) {
    return (
      <PageShell center>
        <div className="w-full text-center">
          <Wordmark size="lg" />
          <Notice tone="danger" title="Pours didn't load" className="mt-8 text-left">
            {error || "We couldn't find this tasting."}
          </Notice>
          <Link href={hostUrl || "/"} className={buttonStyles({ variant: "secondary", size: "lg", block: true, className: "mt-4" })}>
            Back to the dashboard
          </Link>
        </div>
      </PageShell>
    );
  }

  const pendingDeletePour = pours.find((p) => p.id === pendingDeleteId) || null;

  return (
    <PageShell width="md">
      <ConfirmModal
        open={!!pendingDeletePour}
        title={`Delete Pour ${pendingDeletePour?.code ?? ""}?`}
        message="Any scores tasters saved for this pour are deleted too."
        confirmLabel="Delete pour"
        cancelLabel="Keep it"
        dangerous
        onConfirm={() => {
          const id = pendingDeleteId;
          setPendingDeleteId(null);
          if (id) void deletePour(id);
        }}
        onCancel={() => setPendingDeleteId(null)}
      />

      <header className="flex items-center justify-between">
        <Link href={hostUrl} className={buttonStyles({ variant: "ghost", size: "sm", className: "-ml-3" })}>
          <ChevronLeft className="h-4 w-4" /> Dashboard
        </Link>
        <span className="text-xs text-fg-muted" aria-live="polite">
          {saveHint}
        </span>
      </header>

      <div className="mt-6">
        <Eyebrow>{session.title}</Eyebrow>
        <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight">Pours and bottles</h1>
        <p className="mt-1 text-sm text-fg-muted">
          Tasters score these as Pour A, B, C…{" "}
          {session.is_blind ? "Bottle names stay hidden until the big reveal." : ""}
        </p>
      </div>

      {error ? (
        <Notice tone="danger" onDismiss={() => setError("")} className="mt-4">
          {error}
        </Notice>
      ) : null}
      {libraryError ? (
        <Notice tone="danger" onDismiss={() => setLibraryError("")} className="mt-4">
          {libraryError}
        </Notice>
      ) : null}

      {/* Bottle count quick-setup */}
      <Card className="mt-6">
        <div className="font-semibold">How many bottles are you pouring?</div>
        <p className="mt-0.5 text-sm text-fg-muted">
          Each bottle gets a numbered pour. You can fill in the bottle names any time.
        </p>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <div className="flex items-center rounded-2xl border border-line bg-sunken p-1">
            <button
              type="button"
              aria-label="Fewer bottles"
              onClick={() => setQuickCount((n) => Math.max(1, n - 1))}
              className="flex h-9 w-9 items-center justify-center rounded-xl text-fg-muted hover:bg-raised hover:text-fg"
            >
              <Minus className="h-4 w-4" />
            </button>
            <span className="w-10 text-center font-display text-2xl font-semibold tabular-nums" aria-live="polite">
              {quickCount}
            </span>
            <button
              type="button"
              aria-label="More bottles"
              onClick={() => setQuickCount((n) => Math.min(26, n + 1))}
              className="flex h-9 w-9 items-center justify-center rounded-xl text-fg-muted hover:bg-raised hover:text-fg"
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>

          {quickCount > pours.length ? (
            <Button variant="primary" onClick={() => bulkAddPours(quickCount)} disabled={quickBusy}>
              {quickBusy
                ? "Adding…"
                : pours.length === 0
                  ? `Set up ${quickCount} pours`
                  : `Add ${quickCount - pours.length} more pour${quickCount - pours.length > 1 ? "s" : ""}`}
            </Button>
          ) : (
            <span className="text-sm text-fg-muted">
              {pours.length} pour{pours.length !== 1 ? "s" : ""} ready
              {quickCount < pours.length ? ". Delete extras below." : ""}
            </span>
          )}
        </div>
      </Card>

      <section className="mt-6">
        <div className="mb-2 flex items-center justify-between px-1">
          <Eyebrow>Pours</Eyebrow>
          {pours.length ? (
            <Button variant="ghost" size="sm" onClick={addPour} className="-mr-3">
              <Plus className="h-3.5 w-3.5" /> Add one
            </Button>
          ) : null}
        </div>

        {!libraryUserId ? (
          <Notice className="mb-3">Sign in on this device to search the shared whiskey library.</Notice>
        ) : null}

        {pours.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-line-strong px-5 py-8 text-center text-sm text-fg-muted">
            No pours yet. Pick a bottle count above to set up the tasting.
          </div>
        ) : (
          <div className="overflow-hidden rounded-3xl border border-line bg-surface">
            {pours.map((pour) => {
              const isOpen = openPourId === pour.id;
              const libraryMatches = getLibraryMatchesForPour(pour);
              const hasBottleSearch = Boolean((pour.bottle_name || "").trim());
              const assignedName = pour.whiskey_name || pour.bottle_name;
              const inputId = `pour-${pour.id}-bottle`;
              return (
                <div key={pour.id} className="border-b border-line last:border-b-0">
                  <button
                    type="button"
                    onClick={() => setOpenPourId(isOpen ? null : pour.id)}
                    aria-expanded={isOpen}
                    className="flex w-full items-center gap-3 px-5 py-3.5 text-left hover:bg-raised"
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-line-strong font-display font-semibold">
                      {pour.code}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className={cx("block truncate font-semibold", !assignedName && "text-fg-faint")}>
                        {assignedName || "No bottle yet"}
                      </span>
                      {pour.whiskey_id ? (
                        <span className="flex items-center gap-1 text-xs text-success">
                          <Check className="h-3 w-3" /> Linked to library
                        </span>
                      ) : null}
                    </span>
                    <ChevronDown
                      className={cx("h-4 w-4 shrink-0 text-fg-faint transition-transform", isOpen && "rotate-180")}
                    />
                  </button>

                  {isOpen ? (
                    <div className="space-y-3 bg-sunken/60 px-5 pb-5 pt-3">
                      <div>
                        <label htmlFor={inputId} className="text-xs font-semibold text-fg-muted">
                          Bottle name
                        </label>
                        <input
                          id={inputId}
                          value={pour.bottle_name ?? ""}
                          onChange={(e) => updatePourBottleSearch(pour, e.target.value)}
                          onBlur={(e) => savePourBottleSearch(pour, e.currentTarget.value)}
                          placeholder="Search the library or type a name"
                          className="mt-1.5 h-11 w-full rounded-2xl border border-line bg-sunken px-4 text-fg placeholder:text-fg-faint focus:border-accent focus:outline-none"
                        />
                      </div>

                      <div className="max-h-56 space-y-1.5 overflow-y-auto">
                        {libraryMatches.length > 0 ? (
                          libraryMatches.map((item) => {
                            const selected = pour.whiskey_id === item.id;
                            return (
                              <button
                                key={`${pour.id}-${item.id}`}
                                type="button"
                                onClick={() => selectWhiskeyForPour(pour, item)}
                                aria-pressed={selected}
                                className={cx(
                                  "flex w-full items-center gap-3 rounded-2xl border px-3 py-2.5 text-left",
                                  selected
                                    ? "border-accent/50 bg-accent-soft"
                                    : "border-line bg-surface hover:border-line-strong",
                                )}
                              >
                                <span className="min-w-0 flex-1">
                                  <span className={cx("block truncate text-sm font-semibold", selected && "text-accent")}>
                                    {item.name}
                                  </span>
                                  <span className="block truncate text-xs text-fg-faint">
                                    {[
                                      item.distillery,
                                      item.proof !== null ? `${item.proof} proof` : null,
                                      item.bottleSize,
                                    ]
                                      .filter(Boolean)
                                      .join(" · ")}
                                  </span>
                                </span>
                                {selected ? <Check className="h-4 w-4 shrink-0 text-accent" /> : null}
                              </button>
                            );
                          })
                        ) : (
                          <p className="px-1 text-xs text-fg-faint">
                            {!libraryUserId
                              ? "Sign in to search the shared whiskey library."
                              : whiskeys.length === 0
                                ? "The shared library is empty."
                                : hasBottleSearch
                                  ? "No library matches. The name you typed is still saved."
                                  : "Start typing to search the shared library."}
                          </p>
                        )}
                      </div>

                      <div className="flex flex-wrap gap-2 pt-1">
                        {pour.whiskey_id ? (
                          <Button variant="secondary" size="sm" onClick={() => selectWhiskeyForPour(pour, null)}>
                            Unlink bottle
                          </Button>
                        ) : null}
                        <Button
                          variant="ghostDanger"
                          size="sm"
                          onClick={() => setPendingDeleteId(pour.id)}
                        >
                          <Trash2 className="h-3.5 w-3.5" /> Delete pour
                        </Button>
                      </div>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </section>

      <details className="group mt-6 rounded-3xl border border-line bg-surface">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-4 [&::-webkit-details-marker]:hidden">
          <span>
            <span className="block font-semibold">Bottle not in the library?</span>
            <span className="block text-xs text-fg-muted">Add it so you can link it to a pour.</span>
          </span>
          <ChevronDown className="h-4 w-4 shrink-0 text-fg-faint transition-transform group-open:rotate-180" />
        </summary>

        <div className="space-y-3 border-t border-line px-5 pb-5 pt-4">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
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
              { key: "secondary", placeholder: "Secondary price" },
              { key: "paid", placeholder: "Price paid" },
              { key: "status", placeholder: "Status" },
            ].map((field) => (
              <input
                key={field.key}
                aria-label={field.placeholder}
                value={newWhiskey[field.key as keyof WhiskeyFormValues]}
                onChange={(e) => updateNewWhiskey(field.key as keyof WhiskeyFormValues, e.target.value)}
                placeholder={field.placeholder}
                className="h-11 w-full rounded-2xl border border-line bg-sunken px-4 text-sm text-fg placeholder:text-fg-faint focus:border-accent focus:outline-none"
              />
            ))}
          </div>
          <textarea
            aria-label="Notes"
            value={newWhiskey.notes}
            onChange={(e) => updateNewWhiskey("notes", e.target.value)}
            placeholder="Notes"
            className="min-h-[86px] w-full rounded-2xl border border-line bg-sunken px-4 py-3 text-sm text-fg placeholder:text-fg-faint focus:border-accent focus:outline-none"
          />
          <Button variant="secondary" onClick={createWhiskey} disabled={creatingWhiskey || !libraryUserId}>
            {creatingWhiskey ? "Adding…" : "Add to library"}
          </Button>
        </div>
      </details>
    </PageShell>
  );
}
