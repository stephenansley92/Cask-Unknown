"use client";

import { useEffect, useMemo, useRef, useState, type TouchEvent } from "react";
import { useRouter } from "next/navigation";
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

      if (notesRef.current && document.activeElement === notesRef.current) {
        notesRef.current.blur();
      }

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
    if (isScrollLocked) return;

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
        setSearch("");
        setNewWhiskey(EMPTY_WHISKEY_FORM_VALUES);
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
    setSearch("");
    setNewWhiskey(EMPTY_WHISKEY_FORM_VALUES);

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
    <div className="space-y-6">
      <div className="rounded-3xl border border-zinc-200 p-5">
        <div className="text-sm font-semibold text-zinc-800">
          1. Select a whiskey
        </div>
        <div className="mt-3">
          <label className="block text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">
            Search
          </label>
          <input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setShowSearchResults(true);
            }}
            placeholder="Search whiskey library"
            className="mt-2 w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-900/10"
          />
        </div>

        {showSearchResults ? (
          <div className="mt-4 space-y-2">
            {filteredWhiskeys.length === 0 ? (
              <div className="rounded-2xl bg-[#F8F8F6] border border-zinc-200 px-4 py-4 text-sm text-zinc-500">
                {!shouldSearchWhiskeyLibrary
                  ? whiskeys.length === 0
                    ? "No whiskeys yet. Create one below to continue."
                    : "Start typing to search the whiskey library."
                  : "No whiskeys match your search."}
              </div>
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
                    className={[
                      "w-full text-left rounded-2xl border px-4 py-3",
                      isSelected
                        ? "border-zinc-900 bg-zinc-900 text-white"
                        : "border-zinc-200 bg-white text-zinc-900 hover:bg-zinc-50",
                    ].join(" ")}
                  >
                    <div className="font-semibold">{whiskey.name}</div>
                    {primaryMeta ? (
                      <div
                        className={[
                          "mt-1 text-xs",
                          isSelected ? "text-white/80" : "text-zinc-500",
                        ].join(" ")}
                      >
                        {primaryMeta}
                      </div>
                    ) : null}
                    {secondaryMeta ? (
                      <div
                        className={[
                          "mt-1 text-[11px]",
                          isSelected ? "text-white/70" : "text-zinc-500",
                        ].join(" ")}
                      >
                        {secondaryMeta}
                      </div>
                    ) : null}
                  </button>
                );
              })
            )}
          </div>
        ) : null}

        {selectedWhiskey ? (
          <div className="mt-4 rounded-2xl bg-[#F8F8F6] border border-zinc-200 px-4 py-4">
            <div className="text-xs text-zinc-500">Selected whiskey</div>
            <div className="mt-1 font-semibold text-zinc-900">
              {selectedWhiskey.name}
            </div>
            {whiskeyPrimaryMeta(selectedWhiskey) ? (
              <div className="mt-1 text-xs text-zinc-500">
                {whiskeyPrimaryMeta(selectedWhiskey)}
              </div>
            ) : null}
            <div className="mt-1 text-xs text-zinc-500">
              You can start scoring below.
            </div>
          </div>
        ) : null}
      </div>

      <div className="rounded-3xl border border-zinc-200 p-5">
        <div className="text-sm font-semibold text-zinc-800">
          2. Create new whiskey
        </div>
        <div className="mt-3 grid grid-cols-1 gap-3">
          <input
            value={newWhiskey.name}
            onChange={(e) => updateNewWhiskey("name", e.target.value)}
            placeholder="Name (required, e.g. Eagle Rare 10)"
            className="w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-900/10"
          />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <input
              value={newWhiskey.distillery}
              onChange={(e) => updateNewWhiskey("distillery", e.target.value)}
              placeholder="Distillery (optional, e.g. Buffalo Trace)"
              className="w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-900/10"
            />
            <input
              value={newWhiskey.proof}
              onChange={(e) => updateNewWhiskey("proof", e.target.value)}
              placeholder="Proof (optional, e.g. 125)"
              inputMode="decimal"
              className="w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-900/10"
            />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <input
              value={newWhiskey.bottleSize}
              onChange={(e) => updateNewWhiskey("bottleSize", e.target.value)}
              placeholder="Bottle size (optional, e.g. 750ml)"
              className="w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-900/10"
            />
            <input
              value={newWhiskey.age}
              onChange={(e) => updateNewWhiskey("age", e.target.value)}
              placeholder="Age (optional, e.g. 10 years)"
              className="w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-900/10"
            />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <input
              value={newWhiskey.category}
              onChange={(e) => updateNewWhiskey("category", e.target.value)}
              placeholder="Category (optional, e.g. Whiskey)"
              className="w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-900/10"
            />
            <input
              value={newWhiskey.subcategory}
              onChange={(e) => updateNewWhiskey("subcategory", e.target.value)}
              placeholder="Subcategory (optional, e.g. Bourbon)"
              className="w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-900/10"
            />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <input
              value={newWhiskey.rarity}
              onChange={(e) => updateNewWhiskey("rarity", e.target.value)}
              placeholder="Rarity (optional, e.g. Limited release)"
              className="w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-900/10"
            />
            <input
              value={newWhiskey.status}
              onChange={(e) => updateNewWhiskey("status", e.target.value)}
              placeholder="Status (optional, e.g. Open)"
              className="w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-900/10"
            />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <input
              value={newWhiskey.msrp}
              onChange={(e) => updateNewWhiskey("msrp", e.target.value)}
              placeholder="MSRP (optional, e.g. 59.99)"
              inputMode="decimal"
              className="w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-900/10"
            />
            <input
              value={newWhiskey.secondary}
              onChange={(e) => updateNewWhiskey("secondary", e.target.value)}
              placeholder="Secondary (optional, e.g. 149.99)"
              inputMode="decimal"
              className="w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-900/10"
            />
            <input
              value={newWhiskey.paid}
              onChange={(e) => updateNewWhiskey("paid", e.target.value)}
              placeholder="Paid (optional, e.g. 79.99)"
              inputMode="decimal"
              className="w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-900/10"
            />
          </div>
          <button
            type="button"
            onClick={createWhiskey}
            disabled={creatingWhiskey}
            className="inline-flex items-center justify-center rounded-2xl px-5 py-3 font-semibold border border-zinc-200 bg-white text-zinc-900 hover:bg-zinc-50 disabled:opacity-60"
          >
            {creatingWhiskey ? "Creating..." : "Create & Select"}
          </button>
        </div>
      </div>

      <div className="rounded-3xl border border-zinc-200 p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-zinc-800">
              3. Score with {template.name}
            </div>
            <div className="mt-1 text-xs text-zinc-500">
              Uses the Blind Mode scoring template in the same order and weights.
            </div>
          </div>

          <div className="text-right">
            <div className="text-2xl font-extrabold tabular-nums">{totalScore}</div>
            <div className="text-xs text-zinc-500">Total</div>
          </div>
        </div>

        <div className="mt-4 space-y-4">
          {items.map((item) =>
            (() => {
              const blindSetting = getBlindModeCategorySetting(item.itemKey);
              const min = blindSetting?.min ?? 0;
              const max = blindSetting?.max ?? item.maxPoints;
              const value = scoresByItemId[item.id] ?? 0;

              return (
                <div
                  key={item.id}
                  className="rounded-2xl bg-[#F8F8F6] border border-zinc-200 px-4 py-4"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="font-semibold text-zinc-900">
                      {blindSetting?.label || item.label}
                    </div>
                    <div className="text-xs text-zinc-500">
                      [{min}-{max}]{" "}
                      <span className="ml-2 font-semibold text-zinc-800 tabular-nums">
                        {value}
                      </span>
                    </div>
                  </div>

                  {blindSetting ? (
                    <div className="mt-1 text-xs leading-5 text-zinc-500">
                      {blindSetting.description}
                      <br />
                      {blindSetting.examples}
                    </div>
                  ) : null}

                  <div className="mt-3">
                    <input
                      type="range"
                      min={min}
                      max={max}
                      step={1}
                      value={value}
                      onChange={(e) => {
                        if (activeSliderTouch.current) return;
                        setSliderValue(item.id, Number(e.target.value), min, max);
                      }}
                      onTouchStart={(e) => handleSliderTouchStart(item.id, min, max, e)}
                      onTouchMove={handleSliderTouchMove}
                      onTouchEnd={handleSliderTouchEnd}
                      onTouchCancel={() => {
                        activeSliderTouch.current = null;
                      }}
                      className="w-full accent-zinc-900"
                      style={{ touchAction: "pan-y" }}
                    />
                    <div className="mt-1 flex justify-between text-[11px] text-zinc-400 tabular-nums">
                      <span>{min}</span>
                      <span>{max}</span>
                    </div>
                  </div>
                </div>
              );
            })()
          )}
        </div>

        <div className="mt-4">
          <label className="block text-sm font-semibold text-zinc-800">Notes</label>
          <textarea
            ref={notesRef}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Optional notes"
            className="mt-2 w-full min-h-[96px] rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-900/10"
          />
        </div>

        {error ? (
          <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        ) : null}

        <button
          type="button"
          onClick={saveRating}
          disabled={savingRating || creatingWhiskey || items.length === 0}
          className="mt-4 w-full rounded-2xl px-5 py-3 font-semibold bg-zinc-900 text-white hover:bg-zinc-800 disabled:opacity-60"
        >
          {savingRating ? "Saving..." : "Save Rating"}
        </button>
      </div>
    </div>
  );
}
