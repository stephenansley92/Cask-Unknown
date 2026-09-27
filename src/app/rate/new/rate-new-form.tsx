"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type TouchEvent,
} from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronDown, Info, Plus, Search } from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type {
  RateTemplate,
  RateTemplateItem,
} from "@/lib/rate/default-template";
import { getBlindModeCategorySetting } from "@/lib/rate/default-template";
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
import { Button } from "@/components/ui/button";
import { Card, Eyebrow } from "@/components/ui/card";
import { cx } from "@/components/ui/cx";
import { inputStyles } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";

type RateNewFormProps = {
  userId: string;
  template: RateTemplate;
  items: RateTemplateItem[];
  initialWhiskeys: WhiskeyOption[];
};

type SliderTouchState = {
  itemId: string;
  startX: number;
  startY: number;
  input: HTMLInputElement;
  min: number;
  max: number;
  engaged: boolean;
  canceled: boolean;
};

const SEARCH_MIN_CHARS = 1;

function whiskeyIdentityKey(whiskey: WhiskeyOption) {
  if (whiskey.identityKey) return whiskey.identityKey;
  return buildWhiskeyIdentityKey({
    name: whiskey.name,
    distillery: whiskey.distillery,
    proof: whiskey.proof,
    bottleSize: whiskey.bottleSize,
  });
}

function formatCurrencyValue(value: number | null) {
  if (value === null) return null;
  return `$${value}`;
}

function whiskeyPrimaryMeta(whiskey: WhiskeyOption) {
  return [
    whiskey.distillery,
    whiskey.proof !== null ? `${whiskey.proof} proof` : null,
    whiskey.bottleSize,
    whiskey.category,
    whiskey.subcategory,
  ]
    .filter(Boolean)
    .join(" - ");
}

function whiskeySecondaryMeta(whiskey: WhiskeyOption) {
  return [
    whiskey.rarity,
    whiskey.status,
    formatCurrencyValue(whiskey.msrp)
      ? `MSRP ${formatCurrencyValue(whiskey.msrp)}`
      : null,
    formatCurrencyValue(whiskey.secondary)
      ? `Secondary ${formatCurrencyValue(whiskey.secondary)}`
      : null,
    formatCurrencyValue(whiskey.paid)
      ? `Paid ${formatCurrencyValue(whiskey.paid)}`
      : null,
  ]
    .filter(Boolean)
    .join(" - ");
}

function whiskeyToFormValues(whiskey: WhiskeyOption): WhiskeyFormValues {
  return {
    name: whiskey.name,
    distillery: whiskey.distillery || "",
    proof: whiskey.proof !== null ? String(whiskey.proof) : "",
    age: whiskey.age || "",
    bottleSize: whiskey.bottleSize || "",
    category: whiskey.category || "",
    subcategory: whiskey.subcategory || "",
    rarity: whiskey.rarity || "",
    msrp: whiskey.msrp !== null ? String(whiskey.msrp) : "",
    secondary: whiskey.secondary !== null ? String(whiskey.secondary) : "",
    paid: whiskey.paid !== null ? String(whiskey.paid) : "",
    status: whiskey.status || "",
    notes: whiskey.notes || "",
  };
}

const INPUT_CLS = inputStyles({ size: "sm" });

export function RateNewForm({
  userId,
  template,
  items,
  initialWhiskeys,
}: RateNewFormProps) {
  const router = useRouter();
  const [whiskeys, setWhiskeys] = useState(initialWhiskeys);
  const [selectedWhiskeyId, setSelectedWhiskeyId] = useState("");
  const [search, setSearch] = useState("");
  const [showSearchResults, setShowSearchResults] = useState(true);
  const [isCreateWhiskeyOpen, setIsCreateWhiskeyOpen] = useState(false);
  const [newWhiskey, setNewWhiskey] = useState<WhiskeyFormValues>(
    EMPTY_WHISKEY_FORM_VALUES
  );
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");
  const [creatingWhiskey, setCreatingWhiskey] = useState(false);
  const [savingRating, setSavingRating] = useState(false);
  const [isScrollLocked, setIsScrollLocked] = useState(false);
  const [scoresByItemId, setScoresByItemId] = useState<Record<string, number>>(
    () => Object.fromEntries(items.map((item) => [item.id, 0]))
  );
  const [draggingItemId, setDraggingItemId] = useState<string | null>(null);
  const [expandedItemId, setExpandedItemId] = useState<string | null>(null);
  const scrollLockTimer = useRef<number | null>(null);
  const activeSliderTouch = useRef<SliderTouchState | null>(null);
  const notesRef = useRef<HTMLTextAreaElement | null>(null);
  const normalizedSearch = search.trim().toLowerCase();
  const shouldSearchWhiskeyLibrary =
    normalizedSearch.length >= SEARCH_MIN_CHARS;

  const filteredWhiskeys = useMemo(() => {
    if (!shouldSearchWhiskeyLibrary) return [];

    return whiskeys.filter((whiskey) =>
      buildWhiskeySearchText(whiskey).includes(normalizedSearch)
    );
  }, [normalizedSearch, shouldSearchWhiskeyLibrary, whiskeys]);
  const selectedWhiskey = useMemo(
    () => whiskeys.find((whiskey) => whiskey.id === selectedWhiskeyId) || null,
    [selectedWhiskeyId, whiskeys]
  );

  const totalScore = useMemo(
    () => items.reduce((sum, item) => sum + Number(scoresByItemId[item.id] ?? 0), 0),
    [items, scoresByItemId]
  );

  useEffect(() => {
    const clearScrollLock = () => {
      if (scrollLockTimer.current) {
        window.clearTimeout(scrollLockTimer.current);
      }

      scrollLockTimer.current = window.setTimeout(() => {
        setIsScrollLocked(false);
        scrollLockTimer.current = null;
      }, 140);
    };

    const handleScroll = () => {
      setIsScrollLocked(true);
      activeSliderTouch.current = null;

      clearScrollLock();
    };

    window.addEventListener("scroll", handleScroll, { passive: true });

    return () => {
      window.removeEventListener("scroll", handleScroll);

      if (scrollLockTimer.current) {
        window.clearTimeout(scrollLockTimer.current);
      }
    };
  }, []);

  const setSliderValue = (
    itemId: string,
    value: number,
    min: number,
    max: number
  ) => {
    const safeValue = Number.isNaN(value) ? 0 : Math.max(min, Math.min(max, value));

    setScoresByItemId((prev) => ({
      ...prev,
      [itemId]: safeValue,
    }));
  };

  const setSliderValueFromTouch = (
    itemId: string,
    input: HTMLInputElement,
    clientX: number,
    min: number,
    max: number
  ) => {
    const rect = input.getBoundingClientRect();
    if (rect.width <= 0) return;

    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const raw = min + ratio * (max - min);
    setSliderValue(itemId, Math.round(raw), min, max);
  };

  const handleSliderTouchStart = (
    itemId: string,
    min: number,
    max: number,
    e: TouchEvent<HTMLInputElement>
  ) => {
    if (isScrollLocked) return;

    const touch = e.touches[0];
    if (!touch) return;

    activeSliderTouch.current = {
      itemId,
      startX: touch.clientX,
      startY: touch.clientY,
      input: e.currentTarget,
      min,
      max,
      engaged: false,
      canceled: false,
    };
    setDraggingItemId(itemId);
  };

  const handleSliderTouchMove = (e: TouchEvent<HTMLInputElement>) => {
    const gesture = activeSliderTouch.current;
    const touch = e.touches[0];

    if (!gesture || !touch || isScrollLocked) return;

    const dx = touch.clientX - gesture.startX;
    const dy = touch.clientY - gesture.startY;

    if (!gesture.engaged) {
      if (Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx)) {
        gesture.canceled = true;
        activeSliderTouch.current = gesture;
        return;
      }

      if (Math.abs(dx) > 10 && Math.abs(dx) >= Math.abs(dy)) {
        gesture.engaged = true;
        activeSliderTouch.current = gesture;
      } else {
        return;
      }
    }

    if (gesture.canceled) return;

    e.preventDefault();
    setSliderValueFromTouch(
      gesture.itemId,
      gesture.input,
      touch.clientX,
      gesture.min,
      gesture.max
    );
  };

  const handleSliderTouchEnd = (e: TouchEvent<HTMLInputElement>) => {
    const gesture = activeSliderTouch.current;
    const touch = e.changedTouches[0];

    if (!gesture) return;

    if (!gesture.canceled && touch && !isScrollLocked) {
      const dx = Math.abs(touch.clientX - gesture.startX);
      const dy = Math.abs(touch.clientY - gesture.startY);

      if (gesture.engaged || (dx < 10 && dy < 10)) {
        setSliderValueFromTouch(
          gesture.itemId,
          gesture.input,
          touch.clientX,
          gesture.min,
          gesture.max
        );
      }
    }

    activeSliderTouch.current = null;
    setDraggingItemId(null);
  };

  const updateNewWhiskey = (field: keyof WhiskeyFormValues, value: string) => {
    setNewWhiskey((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleSelectWhiskey = (whiskey: WhiskeyOption) => {
    setSelectedWhiskeyId(whiskey.id);
    setNewWhiskey(whiskeyToFormValues(whiskey));
    setShowSearchResults(false);
    setIsCreateWhiskeyOpen(false);
    setError("");
  };

  const createWhiskey = async () => {
    const payload = buildWhiskeyInsertPayload(newWhiskey);
    if (!payload.name) {
      setError("Whiskey name is required.");
      return null;
    }

    const identityKey = payload.identity_key || "";
    if (identityKey) {
      const existingLocal = whiskeys.find(
        (whiskey) => whiskeyIdentityKey(whiskey) === identityKey
      );
      if (existingLocal) {
        setSelectedWhiskeyId(existingLocal.id);
        setShowSearchResults(false);
        setSearch("");
        setNewWhiskey(EMPTY_WHISKEY_FORM_VALUES);
        setIsCreateWhiskeyOpen(false);
        return existingLocal.id;
      }
    }

    setCreatingWhiskey(true);
    setError("");

    const supabase = createSupabaseBrowserClient();
    const basePayload = {
      user_id: userId,
      ...payload,
    };

    const insertAttempts = [
      basePayload,
      {
        user_id: userId,
        name: payload.name,
        distillery: payload.distillery,
        proof: payload.proof,
        age: payload.age,
      },
      {
        user_id: userId,
        name: payload.name,
        distillery: payload.distillery,
        proof: payload.proof,
      },
      {
        user_id: userId,
        name: payload.name,
      },
    ];

    let created: WhiskeyOption | null = null;
    let lastError = "";
    const createSelectAttempts = [
      WHISKEY_SELECT_COLUMNS,
      "id,name,distillery,proof,bottle_size,category,subcategory,rarity,msrp,secondary,paid,status,notes,identity_key",
      "id,name,distillery,proof,age",
      "id,name,distillery,proof",
      "id,name",
    ];

    for (const insertPayload of insertAttempts) {
      for (const selectColumns of createSelectAttempts) {
        const { data, error: insertError } = await supabase
          .from("whiskeys")
          .insert(insertPayload)
          .select(selectColumns)
          .single();

        if (!insertError && data) {
          created = mapWhiskeyRow(data as Record<string, unknown>);
          break;
        }

        lastError = insertError?.message || "Could not create whiskey.";
      }

      if (created) break;
    }

    if (!created && identityKey) {
      for (const selectColumns of createSelectAttempts) {
        const { data: existingData, error: existingError } = await supabase
          .from("whiskeys")
          .select(selectColumns)
          .eq("identity_key", identityKey)
          .limit(1)
          .maybeSingle();

        if (!existingError && existingData) {
          created = mapWhiskeyRow(existingData as Record<string, unknown>);
          break;
        }

        if (existingError) {
          lastError = existingError.message || lastError;
        }
      }
    }

    setCreatingWhiskey(false);

    if (!created) {
      setError(lastError || "Could not create whiskey.");
      return null;
    }

    setWhiskeys((prev) => {
      if (prev.some((item) => item.id === created!.id)) return prev;
      return [created!, ...prev];
    });
    setSelectedWhiskeyId(created.id);
    setShowSearchResults(false);
    setSearch("");
    setNewWhiskey(EMPTY_WHISKEY_FORM_VALUES);
    setIsCreateWhiskeyOpen(false);

    return created.id;
  };

  const saveRating = async () => {
    setSavingRating(true);
    setError("");

    let whiskeyId = selectedWhiskeyId;

    if (!whiskeyId && newWhiskey.name.trim()) {
      whiskeyId = (await createWhiskey()) || "";
    }

    if (!whiskeyId) {
      setSavingRating(false);
      setError("Select a whiskey or create one before saving.");
      return;
    }

    const supabase = createSupabaseBrowserClient();
    const scoresJson = Object.fromEntries(
      items.map((item) => [item.id, Number(scoresByItemId[item.id] ?? 0)])
    );

    const basePayload = {
      user_id: userId,
      whiskey_id: whiskeyId,
      template_id: template.id,
      total_score: totalScore,
      notes: notes.trim() || null,
    };

    const insertAttempts = [
      {
        ...basePayload,
        scores_json: scoresJson,
      },
      {
        ...basePayload,
        scores: scoresJson,
      },
    ];

    let lastError = "";
    let saved = false;

    for (const payload of insertAttempts) {
      const { error: insertError } = await supabase.from("ratings").insert(payload);

      if (!insertError) {
        saved = true;
        break;
      }

      lastError = insertError.message;
    }

    setSavingRating(false);

    if (!saved) {
      setError(lastError || "Could not save rating.");
      return;
    }

    router.push("/rate?saved=1");
  };

  return (
    <div className="space-y-3">
      {/* ── 1. Select whiskey ─────────────────────────────────── */}
      <Card>
        <Eyebrow>1 · Whiskey</Eyebrow>

        {selectedWhiskey && !showSearchResults ? (
          <div className="mt-3 flex items-center gap-3 rounded-2xl border border-accent/40 bg-accent-soft px-4 py-3">
            <Check className="h-5 w-5 shrink-0 text-accent" />
            <div className="min-w-0 flex-1">
              <div className="truncate font-semibold">{selectedWhiskey.name}</div>
              {whiskeyPrimaryMeta(selectedWhiskey) ? (
                <div className="truncate text-xs text-fg-muted">{whiskeyPrimaryMeta(selectedWhiskey)}</div>
              ) : null}
            </div>
            <Button variant="ghost" size="sm" onClick={() => setShowSearchResults(true)}>
              Change
            </Button>
          </div>
        ) : (
          <>
            <div className="relative mt-3">
              <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-faint" />
              <label htmlFor="whiskey-search" className="sr-only">
                Search the whiskey library
              </label>
              <input
                id="whiskey-search"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setShowSearchResults(true);
                }}
                placeholder="Search the whiskey library"
                autoComplete="off"
                className={inputStyles({ className: "pl-10" })}
              />
            </div>

            <div className="mt-3 space-y-2">
              {filteredWhiskeys.length === 0 ? (
                <p className="px-1 text-sm text-fg-faint">
                  {!shouldSearchWhiskeyLibrary
                    ? whiskeys.length === 0
                      ? "No whiskeys yet. Add one below to continue."
                      : "Start typing to search the library."
                    : "No whiskeys match. Add it as a new bottle below."}
                </p>
              ) : (
                filteredWhiskeys.map((whiskey) => {
                  const isSelected = selectedWhiskeyId === whiskey.id;
                  const primaryMeta = whiskeyPrimaryMeta(whiskey);
                  const secondaryMeta = whiskeySecondaryMeta(whiskey);

                  return (
                    <button
                      key={whiskey.id}
                      type="button"
                      onClick={() => handleSelectWhiskey(whiskey)}
                      aria-pressed={isSelected}
                      className={cx(
                        "w-full rounded-2xl border px-4 py-3 text-left",
                        isSelected
                          ? "border-accent bg-accent-soft"
                          : "border-line bg-sunken hover:border-line-strong",
                      )}
                    >
                      <div className="font-semibold">{whiskey.name}</div>
                      {primaryMeta ? <div className="mt-0.5 text-xs text-fg-muted">{primaryMeta}</div> : null}
                      {secondaryMeta ? (
                        <div className="mt-0.5 text-[11px] text-fg-faint">{secondaryMeta}</div>
                      ) : null}
                    </button>
                  );
                })
              )}
            </div>
          </>
        )}
      </Card>

      {/* ── 2. Create new whiskey ──────────────────────────────── */}
      <Card>
        <button
          type="button"
          onClick={() => setIsCreateWhiskeyOpen((open) => !open)}
          aria-expanded={isCreateWhiskeyOpen}
          className="flex w-full items-center justify-between gap-4 text-left"
        >
          <span className="flex min-w-0 items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-raised text-accent">
              <Plus className="h-4 w-4" aria-hidden="true" />
            </span>
            <span className="min-w-0">
              <span className="block font-semibold">Add a new bottle</span>
              <span className="mt-0.5 block text-xs text-fg-muted">
                Only if it isn&apos;t already in the library.
              </span>
            </span>
          </span>
          <ChevronDown
            className={cx(
              "h-5 w-5 shrink-0 text-fg-faint transition-transform duration-150",
              isCreateWhiskeyOpen && "rotate-180",
            )}
            aria-hidden="true"
          />
        </button>

        {isCreateWhiskeyOpen ? (
          <div className="mt-4 grid grid-cols-1 gap-3 border-t border-line pt-4">
            <input
              value={newWhiskey.name}
              onChange={(e) => updateNewWhiskey("name", e.target.value)}
              placeholder="Name (required, e.g. Eagle Rare 10)"
              aria-label="Name"
              className={INPUT_CLS}
            />
            <div className="grid grid-cols-2 gap-3">
              <input
                value={newWhiskey.distillery}
                onChange={(e) => updateNewWhiskey("distillery", e.target.value)}
                placeholder="Distillery"
                aria-label="Distillery"
                className={INPUT_CLS}
              />
              <input
                value={newWhiskey.proof}
                onChange={(e) => updateNewWhiskey("proof", e.target.value)}
                placeholder="Proof"
                aria-label="Proof"
                inputMode="decimal"
                className={INPUT_CLS}
              />
              <input
                value={newWhiskey.bottleSize}
                onChange={(e) => updateNewWhiskey("bottleSize", e.target.value)}
                placeholder="Size (750ml)"
                aria-label="Bottle size"
                className={INPUT_CLS}
              />
              <input
                value={newWhiskey.age}
                onChange={(e) => updateNewWhiskey("age", e.target.value)}
                placeholder="Age (10 years)"
                aria-label="Age"
                className={INPUT_CLS}
              />
              <input
                value={newWhiskey.category}
                onChange={(e) => updateNewWhiskey("category", e.target.value)}
                placeholder="Category"
                aria-label="Category"
                className={INPUT_CLS}
              />
              <input
                value={newWhiskey.subcategory}
                onChange={(e) => updateNewWhiskey("subcategory", e.target.value)}
                placeholder="Subcategory"
                aria-label="Subcategory"
                className={INPUT_CLS}
              />
              <input
                value={newWhiskey.rarity}
                onChange={(e) => updateNewWhiskey("rarity", e.target.value)}
                placeholder="Rarity"
                aria-label="Rarity"
                className={INPUT_CLS}
              />
              <input
                value={newWhiskey.status}
                onChange={(e) => updateNewWhiskey("status", e.target.value)}
                placeholder="Status (Open)"
                aria-label="Status"
                className={INPUT_CLS}
              />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <input
                value={newWhiskey.msrp}
                onChange={(e) => updateNewWhiskey("msrp", e.target.value)}
                placeholder="MSRP"
                aria-label="MSRP"
                inputMode="decimal"
                className={INPUT_CLS}
              />
              <input
                value={newWhiskey.secondary}
                onChange={(e) => updateNewWhiskey("secondary", e.target.value)}
                placeholder="Secondary"
                aria-label="Secondary price"
                inputMode="decimal"
                className={INPUT_CLS}
              />
              <input
                value={newWhiskey.paid}
                onChange={(e) => updateNewWhiskey("paid", e.target.value)}
                placeholder="Paid"
                aria-label="Price paid"
                inputMode="decimal"
                className={INPUT_CLS}
              />
            </div>
            <Button variant="secondary" onClick={createWhiskey} disabled={creatingWhiskey}>
              {creatingWhiskey ? "Adding…" : "Add & select"}
            </Button>
          </div>
        ) : null}
      </Card>

      {/* ── 3. Score ──────────────────────────────────────────── */}
      <Card padded={false}>
        <div className="px-4 pt-4">
          <Eyebrow>2 · Score</Eyebrow>
          <p className="mt-1 text-xs text-fg-faint">
            {template.name} · same categories and weights as a blind tasting.
          </p>
        </div>

        <div className="mt-2">
          {items.map((item) => {
            const blindSetting = getBlindModeCategorySetting(item.itemKey);
            const min = blindSetting?.min ?? 0;
            const max = blindSetting?.max ?? item.maxPoints;
            const value = scoresByItemId[item.id] ?? 0;
            const isExpanded = expandedItemId === item.id;
            const label = blindSetting?.label || item.label;
            const pct = max > min ? ((value - min) / (max - min)) * 100 : 0;
            const detailsId = `rate-item-${item.id}-details`;

            return (
              <div key={item.id} className="border-b border-line px-4 py-4 last:border-b-0">
                <div className="flex items-center justify-between gap-3">
                  {blindSetting ? (
                    <button
                      type="button"
                      onClick={() => setExpandedItemId(isExpanded ? null : item.id)}
                      aria-expanded={isExpanded}
                      aria-controls={detailsId}
                      className="-m-1 flex items-center gap-1.5 rounded-lg p-1 text-left font-semibold text-fg"
                    >
                      {label}
                      <Info className={cx("h-3.5 w-3.5", isExpanded ? "text-accent" : "text-fg-faint")} />
                    </button>
                  ) : (
                    <span className="font-semibold">{label}</span>
                  )}
                  <div className="tabular-nums">
                    <span className={cx("text-lg font-bold", value > 0 ? "text-accent" : "text-fg-faint")}>
                      {value}
                    </span>
                    <span className="text-sm text-fg-faint"> / {max}</span>
                  </div>
                </div>

                {isExpanded && blindSetting ? (
                  <p id={detailsId} className="mt-1 text-xs leading-5 text-fg-muted animate-fade-in">
                    {blindSetting.description} <span className="text-fg-faint">{blindSetting.examples}</span>
                  </p>
                ) : null}

                <div className="relative mt-3 py-1">
                  <input
                    type="range"
                    min={min}
                    max={max}
                    step={1}
                    value={value}
                    aria-label={`${label} score`}
                    aria-valuetext={`${value} of ${max}`}
                    onChange={(e) => {
                      if (activeSliderTouch.current) return;
                      setSliderValue(item.id, Number(e.target.value), min, max);
                    }}
                    onTouchStart={(e) => handleSliderTouchStart(item.id, min, max, e)}
                    onTouchMove={handleSliderTouchMove}
                    onTouchEnd={handleSliderTouchEnd}
                    onTouchCancel={() => {
                      activeSliderTouch.current = null;
                      setDraggingItemId(null);
                    }}
                    disabled={isScrollLocked}
                    className={cx("cask-slider block w-full", isScrollLocked && "opacity-50")}
                    style={{ touchAction: "pan-y", "--fill": `${pct}%` } as CSSProperties}
                  />
                  {draggingItemId === item.id && (
                    <div
                      className="pointer-events-none absolute -top-9 -translate-x-1/2 rounded-xl bg-accent px-3 py-1 text-sm font-extrabold tabular-nums text-on-accent shadow-lg"
                      style={{ left: `calc(${pct}% + ${12 - pct * 0.24}px)` }}
                    >
                      {value}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      {/* ── 4. Notes ──────────────────────────────────────────── */}
      <Card>
        <label htmlFor="rate-notes">
          <Eyebrow>3 · Notes</Eyebrow>
        </label>
        <textarea
          id="rate-notes"
          ref={notesRef}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Nose, palate, finish… anything you want to remember."
          className={inputStyles({ kind: "textarea", className: "mt-3 min-h-[96px]" })}
        />
      </Card>

      {error ? <Notice tone="danger">{error}</Notice> : null}

      {/* Thumb-reach action bar with the live total */}
      <div
        className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-canvas/95 backdrop-blur-md"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <div className="mx-auto flex max-w-md items-center gap-4 px-4 py-3">
          <div className="shrink-0" aria-live="polite">
            <div className="text-[11px] font-semibold text-fg-faint">Total</div>
            <div className="font-display text-3xl font-semibold leading-none tabular-nums">
              <span className={totalScore > 0 ? "text-accent" : "text-fg-faint"}>{totalScore}</span>
              <span className="text-sm text-fg-faint">/100</span>
            </div>
          </div>
          <Button
            variant="primary"
            size="lg"
            block
            onClick={saveRating}
            disabled={savingRating || creatingWhiskey || items.length === 0}
          >
            {savingRating ? "Saving…" : "Save rating"}
          </Button>
        </div>
      </div>
    </div>
  );
}
