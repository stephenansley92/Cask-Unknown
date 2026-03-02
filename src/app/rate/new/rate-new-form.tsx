"use client";

import { useEffect, useMemo, useRef, useState, type TouchEvent } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type {
  RateTemplate,
  RateTemplateItem,
} from "@/lib/rate/default-template";
import { getBlindModeCategorySetting } from "@/lib/rate/default-template";

type WhiskeyOption = {
  id: string;
  name: string;
  distillery: string | null;
  proof: number | null;
};

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

function parseProof(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;

  const parsed = Number(trimmed);
  if (Number.isNaN(parsed)) return null;
  return parsed;
}

export function RateNewForm({
  userId,
  template,
  items,
  initialWhiskeys,
}: RateNewFormProps) {
  const router = useRouter();
  const [whiskeys, setWhiskeys] = useState(initialWhiskeys);
  const [selectedWhiskeyId, setSelectedWhiskeyId] = useState(
    initialWhiskeys[0]?.id || ""
  );
  const [search, setSearch] = useState("");
  const [newName, setNewName] = useState("");
  const [newDistillery, setNewDistillery] = useState("");
  const [newProof, setNewProof] = useState("");
  const [newAge, setNewAge] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");
  const [creatingWhiskey, setCreatingWhiskey] = useState(false);
  const [savingRating, setSavingRating] = useState(false);
  const [isScrollLocked, setIsScrollLocked] = useState(false);
  const [scoresByItemId, setScoresByItemId] = useState<Record<string, number>>(
    () =>
      Object.fromEntries(items.map((item) => [item.id, 0]))
  );
  const scrollLockTimer = useRef<number | null>(null);
  const activeSliderTouch = useRef<SliderTouchState | null>(null);
  const notesRef = useRef<HTMLTextAreaElement | null>(null);

  const filteredWhiskeys = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return whiskeys;

    return whiskeys.filter((whiskey) => {
      const haystack = `${whiskey.name} ${whiskey.distillery || ""}`.toLowerCase();
      return haystack.includes(query);
    });
  }, [search, whiskeys]);

  const totalScore = useMemo(
    () =>
      items.reduce(
        (sum, item) => sum + Number(scoresByItemId[item.id] ?? 0),
        0
      ),
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

  const createWhiskey = async () => {
    const name = newName.trim();
    if (!name) {
      setError("Whiskey name is required.");
      return null;
    }

    setCreatingWhiskey(true);
    setError("");

    const supabase = createSupabaseBrowserClient();
    const proof = parseProof(newProof);
    const basePayload = {
      user_id: userId,
      name,
      distillery: newDistillery.trim() || null,
      proof,
    };

    const insertAttempts = [
      {
        ...basePayload,
        age: newAge.trim() || null,
      },
      basePayload,
      {
        user_id: userId,
        name,
      },
    ];

    let created:
      | {
          id: string;
          name: string;
          distillery: string | null;
          proof: number | null;
        }
      | null = null;
    let lastError = "";

    for (const payload of insertAttempts) {
      const { data, error: insertError } = await supabase
        .from("whiskeys")
        .insert(payload)
        .select("id,name,distillery,proof")
        .single();

      if (!insertError && data) {
        created = {
          id: data.id as string,
          name: data.name as string,
          distillery: (data.distillery as string | null) ?? null,
          proof:
            typeof data.proof === "number"
              ? data.proof
              : data.proof === null
              ? null
              : Number(data.proof ?? 0),
        };
        break;
      }

      lastError = insertError?.message || "Could not create whiskey.";
    }

    setCreatingWhiskey(false);

    if (!created) {
      setError(lastError || "Could not create whiskey.");
      return null;
    }

    setWhiskeys((prev) => [created!, ...prev]);
    setSelectedWhiskeyId(created.id);
    setSearch("");
    setNewName("");
    setNewDistillery("");
    setNewProof("");
    setNewAge("");

    return created.id;
  };

  const saveRating = async () => {
    setSavingRating(true);
    setError("");

    let whiskeyId = selectedWhiskeyId;

    if (!whiskeyId && newName.trim()) {
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
      const { error: insertError } = await supabase
        .from("ratings")
        .insert(payload);

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
    router.refresh();
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
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search your whiskeys"
            className="mt-2 w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-900/10"
          />
        </div>

        <div className="mt-4 space-y-2">
          {filteredWhiskeys.length === 0 ? (
            <div className="rounded-2xl bg-[#F8F8F6] border border-zinc-200 px-4 py-4 text-sm text-zinc-500">
              {whiskeys.length === 0
                ? "No whiskeys yet. Create one below to continue."
                : "No whiskeys match your search."}
            </div>
          ) : (
            filteredWhiskeys.map((whiskey) => {
              const isSelected = selectedWhiskeyId === whiskey.id;

              return (
                <button
                  key={whiskey.id}
                  type="button"
                  onClick={() => setSelectedWhiskeyId(whiskey.id)}
                  className={[
                    "w-full text-left rounded-2xl border px-4 py-3",
                    isSelected
                      ? "border-zinc-900 bg-zinc-900 text-white"
                      : "border-zinc-200 bg-white text-zinc-900 hover:bg-zinc-50",
                  ].join(" ")}
                >
                  <div className="font-semibold">{whiskey.name}</div>
                  {(whiskey.distillery || whiskey.proof !== null) && (
                    <div
                      className={[
                        "mt-1 text-xs",
                        isSelected ? "text-white/80" : "text-zinc-500",
                      ].join(" ")}
                    >
                      {[
                        whiskey.distillery || null,
                        whiskey.proof !== null ? `${whiskey.proof} proof` : null,
                      ]
                        .filter(Boolean)
                        .join(" • ")}
                    </div>
                  )}
                </button>
              );
            })
          )}
        </div>
      </div>

      <div className="rounded-3xl border border-zinc-200 p-5">
        <div className="text-sm font-semibold text-zinc-800">
          2. Create new whiskey
        </div>
        <div className="mt-3 grid grid-cols-1 gap-3">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Name (required)"
            className="w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-900/10"
          />
          <input
            value={newDistillery}
            onChange={(e) => setNewDistillery(e.target.value)}
            placeholder="Distillery (optional)"
            className="w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-900/10"
          />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <input
              value={newProof}
              onChange={(e) => setNewProof(e.target.value)}
              placeholder="Proof (optional)"
              inputMode="decimal"
              className="w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-900/10"
            />
            <input
              value={newAge}
              onChange={(e) => setNewAge(e.target.value)}
              placeholder="Age (optional)"
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
            <div className="text-2xl font-extrabold tabular-nums">
              {totalScore}
            </div>
            <div className="text-xs text-zinc-500">Total</div>
          </div>
        </div>

        <div className="mt-4 space-y-4">
          {items.map((item) => (
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
                      onTouchStart={(e) =>
                        handleSliderTouchStart(item.id, min, max, e)
                      }
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
          ))}
        </div>

        <div className="mt-4">
          <label className="block text-sm font-semibold text-zinc-800">
            Notes
          </label>
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
