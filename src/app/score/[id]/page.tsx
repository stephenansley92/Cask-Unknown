"use client";

import { useEffect, useMemo, useRef, useState, type TouchEvent } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { ConnectionBanner } from "@/components/connection-banner";
import { ConfirmModal } from "@/components/confirm-modal";
import { Lock, LockOpen, CheckCircle2 } from "lucide-react";
import { useWakeLock } from "@/lib/use-wake-lock";

type SessionRow = {
  id: string;
  title: string;
  is_blind: boolean;
  status: string; // setup | scoring | reveal_ready | revealed | closed
};

type PourRow = {
  id: string;
  session_id: string;
  code: string;
  sort_order: number;
};

type ParticipantRow = {
  id: string;
  session_id: string;
  display_name: string;
};

type ScoreRow = {
  id: string;
  session_id: string;
  pour_id: string;
  participant_id: string;

  nose: number;
  flavor: number;
  mouthfeel: number;
  complexity: number;
  balance: number;
  finish: number;
  uniqueness: number;
  drinkability: number;
  packaging: number;
  value: number;

  total: number;

  notes?: string | null;
  core_locked?: boolean | null;
  core_locked_at?: string | null;

  final_locked?: boolean | null;
  final_locked_at?: string | null;

  created_at?: string;
};

type SliderTouchState = {
  key: keyof ScoreDraft;
  startX: number;
  startY: number;
  input: HTMLInputElement;
  min: number;
  max: number;
  engaged: boolean;
  canceled: boolean;
};

function storageKey(sessionId: string) {
  return `cask_unknown_participant_${sessionId}`;
}

function activePourStorageKey(sessionId: string, participantId: string) {
  return `cask_unknown_active_pour_${sessionId}_${participantId}`;
}

// 0 allowed everywhere
const CATEGORY_SPEC = [
  {
    key: "nose",
    label: "Nose",
    min: 0,
    max: 10,
    group: "core",
    description: "How appealing the aroma is before you sip.",
    examples: "Examples: vanilla, caramel, oak, fruit, baking spice",
  },
  {
    key: "flavor",
    label: "Flavor",
    min: 0,
    max: 20,
    group: "core",
    description: "How much you enjoy the taste on the palate.",
    examples: "Examples: toffee, cherry, cinnamon, peanut, dark chocolate",
  },
  {
    key: "mouthfeel",
    label: "Mouthfeel",
    min: 0,
    max: 10,
    group: "core",
    description: "Texture and body in the mouth.",
    examples: "Examples: oily, creamy, silky, thin, hot",
  },
  {
    key: "complexity",
    label: "Complexity",
    min: 0,
    max: 10,
    group: "core",
    description: "How layered, interesting, and evolving it feels.",
    examples: "Examples: changing notes, depth, new flavors on revisit",
  },
  {
    key: "balance",
    label: "Balance",
    min: 0,
    max: 10,
    group: "core",
    description: "How well the sweetness, oak, proof, and spice fit together.",
    examples: "Examples: integrated, harmonious, not too sweet, not too sharp",
  },
  {
    key: "finish",
    label: "Finish",
    min: 0,
    max: 10,
    group: "core",
    description: "How pleasant and lasting the aftertaste is.",
    examples: "Examples: long, warm, drying, lingering spice, clean fade",
  },
  {
    key: "uniqueness",
    label: "Uniqueness",
    min: 0,
    max: 10,
    group: "core",
    description: "How distinctive or memorable it is versus the rest of the flight.",
    examples: "Examples: unusual profile, standout note, memorable finish",
  },
  {
    key: "drinkability",
    label: "Drinkability",
    min: 0,
    max: 10,
    group: "core",
    description: "How easy it is to keep sipping and enjoy.",
    examples: "Examples: approachable, smooth, easy to revisit, not harsh",
  },

  // unlocked at reveal_ready + revealed
  {
    key: "packaging",
    label: "Packaging / Looks",
    min: 0,
    max: 5,
    group: "reveal",
    description: "How much you like the bottle presentation once the host unlocks it.",
    examples: "Examples: label design, bottle shape, shelf appeal, presentation",
  },
  {
    key: "value",
    label: "Value",
    min: 0,
    max: 5,
    group: "reveal",
    description: "How fair the bottle feels for the price after reveal-stage scoring opens.",
    examples: "Examples: worth the money, overpriced, daily buy, special occasion buy",
  },
] as const;

type ScoreDraft = {
  nose: number;
  flavor: number;
  mouthfeel: number;
  complexity: number;
  balance: number;
  finish: number;
  uniqueness: number;
  drinkability: number;
  packaging: number;
  value: number;
  notes: string;
};

function makeEmptyDraft(): ScoreDraft {
  return {
    nose: 0,
    flavor: 0,
    mouthfeel: 0,
    complexity: 0,
    balance: 0,
    finish: 0,
    uniqueness: 0,
    drinkability: 0,
    packaging: 0,
    value: 0,
    notes: "",
  };
}

function computeTotal(d: ScoreDraft): number {
  return (
    d.nose +
    d.flavor +
    d.mouthfeel +
    d.complexity +
    d.balance +
    d.finish +
    d.uniqueness +
    d.drinkability +
    d.packaging +
    d.value
  );
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

export default function ScorePage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const sessionId = params?.id;

  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<SessionRow | null>(null);
  const [pours, setPours] = useState<PourRow[]>([]);
  const [participant, setParticipant] = useState<ParticipantRow | null>(null);
  const [error, setError] = useState("");

  const [activePourId, setActivePourId] = useState<string | null>(null);

  const [draftByPour, setDraftByPour] = useState<Record<string, ScoreDraft>>({});
  const [scoreIdByPour, setScoreIdByPour] = useState<Record<string, string>>({});
  const [coreLockedByPour, setCoreLockedByPour] = useState<Record<string, boolean>>({});
  const [finalLockedByPour, setFinalLockedByPour] = useState<Record<string, boolean>>({});

  const [saveHint, setSaveHint] = useState<string>("");
  const [saveError, setSaveError] = useState<string>("");
  const [isScrollLocked, setIsScrollLocked] = useState(false);
  const [draggingKey, setDraggingKey] = useState<string | null>(null);
  const [confirmLock, setConfirmLock] = useState<{ kind: "core" | "final"; message: string } | null>(null);
  const [flashedPour, setFlashedPour] = useState<string | null>(null);
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);
  const [prevTotal, setPrevTotal] = useState<number>(0);
  const [totalKey, setTotalKey] = useState<number>(0);
  const saveHintTimer = useRef<number | null>(null);
  const saveDebounceTimer = useRef<number | null>(null);
  const scrollLockTimer = useRef<number | null>(null);
  const activeSliderTouch = useRef<SliderTouchState | null>(null);
  const notesRef = useRef<HTMLTextAreaElement | null>(null);
  const coreLockedByPourRef = useRef<Record<string, boolean>>({});
  const finalLockedByPourRef = useRef<Record<string, boolean>>({});

  const joinUrl = useMemo(() => (sessionId ? `/join/${sessionId}` : "/"), [sessionId]);

  const hostDashboardUrl = useMemo(() => {
    if (!sessionId || typeof window === "undefined") return null;
    try {
      const raw = window.localStorage.getItem("cask_unknown_host_sessions");
      const saved: { id: string; key: string }[] = JSON.parse(raw || "[]");
      const match = saved.find((s) => s.id === sessionId);
      return match ? `/host/${sessionId}?key=${encodeURIComponent(match.key)}` : null;
    } catch {
      return null;
    }
  }, [sessionId]);

  const activePour = useMemo(
    () => pours.find((p) => p.id === activePourId) || null,
    [pours, activePourId]
  );

  const activePourIndex = useMemo(
    () => pours.findIndex((p) => p.id === activePourId),
    [pours, activePourId]
  );

  const canGoPrev = activePourIndex > 0;
  const canGoNext = activePourIndex >= 0 && activePourIndex < pours.length - 1;

  const activeDraft: ScoreDraft = useMemo(() => {
    if (!activePourId) return makeEmptyDraft();
    return draftByPour[activePourId] ?? makeEmptyDraft();
  }, [activePourId, draftByPour]);

  const total = useMemo(() => computeTotal(activeDraft), [activeDraft]);

  useEffect(() => {
    if (total !== prevTotal) {
      setPrevTotal(total);
      setTotalKey((k) => k + 1);
    }
  }, [total, prevTotal]);

  const status = (session?.status || "").toLowerCase();
  const isRevealed = status === "revealed";
  const isRevealReady = status === "reveal_ready";
  const revealScoringEnabled = isRevealReady || isRevealed;

  useWakeLock(Boolean(session && participant && !isRevealed));

  const activeCoreLocked = useMemo(() => {
    if (!activePourId) return false;
    if (isRevealed) return true;
    return coreLockedByPour[activePourId] ?? false;
  }, [activePourId, coreLockedByPour, isRevealed]);

  const activeFinalLocked = useMemo(() => {
    if (!activePourId) return false;
    if (isRevealed) return true;
    return finalLockedByPour[activePourId] ?? false;
  }, [activePourId, finalLockedByPour, isRevealed]);

  useEffect(() => {
    coreLockedByPourRef.current = coreLockedByPour;
  }, [coreLockedByPour]);

  useEffect(() => {
    finalLockedByPourRef.current = finalLockedByPour;
  }, [finalLockedByPour]);

  const completedCount = useMemo(() => {
    return pours.reduce((count, p) => {
      const d = draftByPour[p.id];
      if (!d) return count;
      const anyTouched =
        d.nose !== 0 ||
        d.flavor !== 0 ||
        d.mouthfeel !== 0 ||
        d.complexity !== 0 ||
        d.balance !== 0 ||
        d.finish !== 0 ||
        d.uniqueness !== 0 ||
        d.drinkability !== 0 ||
        d.packaging !== 0 ||
        d.value !== 0 ||
        (d.notes?.trim().length ?? 0) > 0;
      return count + (anyTouched ? 1 : 0);
    }, 0);
  }, [pours, draftByPour]);

  const showHint = (text: string) => {
    setSaveHint(text);
    if (saveHintTimer.current) window.clearTimeout(saveHintTimer.current);
    saveHintTimer.current = window.setTimeout(() => {
      setSaveHint("");
      saveHintTimer.current = null;
    }, 1500);
  };

  const clearScrollLock = () => {
    if (scrollLockTimer.current) window.clearTimeout(scrollLockTimer.current);
    scrollLockTimer.current = window.setTimeout(() => {
      setIsScrollLocked(false);
      scrollLockTimer.current = null;
    }, 140);
  };

  const setDraftForPour = (pourId: string, patch: Partial<ScoreDraft>) => {
    setDraftByPour((prev) => {
      const existing = prev[pourId] ?? makeEmptyDraft();
      return { ...prev, [pourId]: { ...existing, ...patch } };
    });
  };

  const applyScoreRow = (row: ScoreRow) => {
    setScoreIdByPour((prev) => ({ ...prev, [row.pour_id]: row.id }));
    setDraftForPour(row.pour_id, {
      nose: row.nose ?? 0,
      flavor: row.flavor ?? 0,
      mouthfeel: row.mouthfeel ?? 0,
      complexity: row.complexity ?? 0,
      balance: row.balance ?? 0,
      finish: row.finish ?? 0,
      uniqueness: row.uniqueness ?? 0,
      drinkability: row.drinkability ?? 0,
      packaging: row.packaging ?? 0,
      value: row.value ?? 0,
      notes: (row.notes ?? "") as string,
    });
    setCoreLockedByPour((prev) => ({ ...prev, [row.pour_id]: !!row.core_locked }));
    setFinalLockedByPour((prev) => ({ ...prev, [row.pour_id]: !!row.final_locked }));
  };

  const loadScoresForParticipant = async (participantId: string, poursList: PourRow[]) => {
    const pourIds = poursList.map((p) => p.id);
    if (!pourIds.length) return;

    const { data, error: sErr } = await supabase
      .from("scores")
      .select(
        "id,session_id,pour_id,participant_id,nose,flavor,mouthfeel,complexity,balance,finish,uniqueness,drinkability,packaging,value,total,notes,core_locked,core_locked_at,final_locked,final_locked_at,created_at"
      )
      .eq("participant_id", participantId)
      .in("pour_id", pourIds);

    if (sErr) throw sErr;

    const rows = (data || []) as ScoreRow[];
    const rowByPour = new Map(rows.map((row) => [row.pour_id, row]));

    poursList.forEach((pour) => {
      const row = rowByPour.get(pour.id);
      if (row) {
        applyScoreRow(row);
        return;
      }

      setDraftForPour(pour.id, makeEmptyDraft());
      setCoreLockedByPour((prev) => ({ ...prev, [pour.id]: false }));
      setFinalLockedByPour((prev) => ({ ...prev, [pour.id]: false }));
    });
  };

  const loadScoreForPour = async (pourId: string, participantId: string) => {
    const { data, error: sErr } = await supabase
      .from("scores")
      .select(
        "id,session_id,pour_id,participant_id,nose,flavor,mouthfeel,complexity,balance,finish,uniqueness,drinkability,packaging,value,total,notes,core_locked,core_locked_at,final_locked,final_locked_at,created_at"
      )
      .eq("pour_id", pourId)
      .eq("participant_id", participantId)
      .maybeSingle();

    if (sErr) {
      throw sErr;
    }

    if (data) {
      applyScoreRow(data as ScoreRow);
    } else {
      setDraftForPour(pourId, makeEmptyDraft());
      setCoreLockedByPour((prev) => ({ ...prev, [pourId]: false }));
      setFinalLockedByPour((prev) => ({ ...prev, [pourId]: false }));
    }
  };

  const upsertPour = async (
    pourId: string,
    extra?: { lockCore?: boolean; lockFinal?: boolean }
  ) => {
    if (!sessionId || !participant) return;
    const d = (draftByPour[pourId] ?? makeEmptyDraft()) as ScoreDraft;

    const payload: any = {
      session_id: sessionId,
      pour_id: pourId,
      participant_id: participant.id,

      nose: d.nose,
      flavor: d.flavor,
      mouthfeel: d.mouthfeel,
      complexity: d.complexity,
      balance: d.balance,
      finish: d.finish,
      uniqueness: d.uniqueness,
      drinkability: d.drinkability,
      packaging: d.packaging,
      value: d.value,

      total: computeTotal(d),
      notes: d.notes ?? "",
      ...(extra?.lockCore ? { core_locked_at: new Date().toISOString() } : {}),
      ...(extra?.lockFinal ? { final_locked_at: new Date().toISOString() } : {}),
    };

    if (extra?.lockCore) {
      payload.core_locked = true;
    }

    if (extra?.lockFinal) {
      payload.final_locked = true;
      if (coreLockedByPourRef.current[pourId]) {
        payload.core_locked = true;
      }
    }

    showHint(extra?.lockFinal ? "Locking final…" : extra?.lockCore ? "Locking…" : "Saving…");
    setSaveError("");

    let data: { id: string } | null = null;
    let uErr: { message: string } | null = null;

    if (extra?.lockCore || extra?.lockFinal) {
      const result = await supabase
        .from("scores")
        .upsert(payload, { onConflict: "pour_id,participant_id" })
        .select("id")
        .single();
      data = result.data as { id: string } | null;
      uErr = result.error;
    } else {
      const updateResult = await supabase
        .from("scores")
        .update(payload)
        .eq("pour_id", pourId)
        .eq("participant_id", participant.id)
        .select("id")
        .maybeSingle();

      if (updateResult.error) {
        uErr = updateResult.error;
      } else if (updateResult.data) {
        data = updateResult.data as { id: string };
      } else {
        const insertResult = await supabase.from("scores").insert(payload).select("id").single();
        data = insertResult.data as { id: string } | null;
        uErr = insertResult.error;
      }
    }

    if (uErr) {
      setSaveError(uErr.message);
      showHint("Failed ✗");
      // Revert optimistic lock state if a lock op failed
      if (extra?.lockCore) setCoreLockedByPour((prev) => ({ ...prev, [pourId]: false }));
      if (extra?.lockFinal) setFinalLockedByPour((prev) => ({ ...prev, [pourId]: false }));
      return;
    }

    if (data?.id) setScoreIdByPour((prev) => ({ ...prev, [pourId]: data.id as string }));

    if (extra?.lockCore) {
      setCoreLockedByPour((prev) => ({ ...prev, [pourId]: true }));
      setFlashedPour(pourId);
      setTimeout(() => setFlashedPour(null), 700);
      showHint("Locked ✓");
    } else if (extra?.lockFinal) {
      setFinalLockedByPour((prev) => ({ ...prev, [pourId]: true }));
      setFlashedPour(pourId);
      setTimeout(() => setFlashedPour(null), 700);
      showHint("Final locked ✓");
    } else {
      showHint("Saved ✓");
    }
  };

  const scheduleSave = (pourId: string) => {
    if (saveDebounceTimer.current) window.clearTimeout(saveDebounceTimer.current);
    saveDebounceTimer.current = window.setTimeout(() => {
      upsertPour(pourId);
      saveDebounceTimer.current = null;
    }, 500);
  };

  useEffect(() => {
    const run = async () => {
      try {
        setLoading(true);
        setError("");

        if (!sessionId) {
          setError("Missing session id.");
          setLoading(false);
          return;
        }

        const { data: sess, error: sessErr } = await supabase
          .from("sessions")
          .select("id,title,is_blind,status")
          .eq("id", sessionId)
          .single();

        if (sessErr) {
          setError(sessErr.message);
          setLoading(false);
          return;
        }
        setSession(sess as SessionRow);

        const { data: poursData, error: poursErr } = await supabase
          .from("pours")
          .select("id,session_id,code,sort_order")
          .eq("session_id", sessionId)
          .order("sort_order", { ascending: true });

        if (poursErr) {
          setError(poursErr.message);
          setLoading(false);
          return;
        }

        const poursList = (poursData || []) as PourRow[];
        setPours(poursList);

        const raw =
          typeof window !== "undefined" ? window.localStorage.getItem(storageKey(sessionId)) : null;
        if (!raw) {
          router.push(joinUrl);
          return;
        }

        let parsed: { participantId?: string } | null = null;
        try {
          parsed = JSON.parse(raw);
        } catch {
          parsed = null;
        }

        const participantId = parsed?.participantId;
        if (!participantId) {
          router.push(joinUrl);
          return;
        }

        const { data: p, error: pErr } = await supabase
          .from("participants")
          .select("id,session_id,display_name")
          .eq("id", participantId)
          .single();

        if (pErr || !p || (p as any).session_id !== sessionId) {
          window.localStorage.removeItem(storageKey(sessionId));
          router.push(joinUrl);
          return;
        }

        const participantRow = p as ParticipantRow;
        setParticipant(participantRow);

        await loadScoresForParticipant(participantRow.id, poursList);

        const savedPourId =
          typeof window !== "undefined"
            ? window.localStorage.getItem(activePourStorageKey(sessionId, participantRow.id))
            : null;
        const initialPourId =
          savedPourId && poursList.some((pour) => pour.id === savedPourId)
            ? savedPourId
            : poursList[0]?.id || null;
        setActivePourId(initialPourId);

        setLoading(false);
      } catch (e: any) {
        setError(e?.message || "Unknown error.");
        setLoading(false);
      }
    };

    run();

    return () => {
      if (saveHintTimer.current) window.clearTimeout(saveHintTimer.current);
      if (saveDebounceTimer.current) window.clearTimeout(saveDebounceTimer.current);
      if (scrollLockTimer.current) window.clearTimeout(scrollLockTimer.current);
    };
  }, [sessionId, router, joinUrl]);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrollLocked(true);
      activeSliderTouch.current = null;

      clearScrollLock();
    };

    window.addEventListener("scroll", handleScroll, { passive: true });

    return () => {
      window.removeEventListener("scroll", handleScroll);
    };
  }, []);

  // realtime: session status updates (unlock Packaging/Value instantly)
  useEffect(() => {
    if (!sessionId) return;

    const channel = supabase
      .channel(`score-session-${sessionId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "sessions", filter: `id=eq.${sessionId}` },
        (payload: any) => {
          const newStatus = (payload?.new?.status || "") as string;
          setSession((prev) => (prev ? { ...prev, status: newStatus } : prev));
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [sessionId]);

  useEffect(() => {
    if (!participant?.id) return;

    const channel = supabase
      .channel(`score-locks-${participant.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "scores", filter: `participant_id=eq.${participant.id}` },
        (payload: any) => {
          const nextRow = payload?.new ?? null;
          const prevRow = payload?.old ?? null;
          const row = nextRow || prevRow;
          const pourId = row?.pour_id as string | undefined;

          if (!pourId) return;
          if (sessionId && row?.session_id && row.session_id !== sessionId) return;

          if (payload?.eventType === "DELETE") {
            setCoreLockedByPour((prev) => ({ ...prev, [pourId]: false }));
            setFinalLockedByPour((prev) => ({ ...prev, [pourId]: false }));
            return;
          }

          setCoreLockedByPour((prev) => ({ ...prev, [pourId]: !!nextRow?.core_locked }));
          setFinalLockedByPour((prev) => ({ ...prev, [pourId]: !!nextRow?.final_locked }));
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [participant?.id, sessionId]);

  const switchPour = async (pourId: string) => {
    if (!participant) return;
    setActivePourId(pourId);
    if (sessionId) {
      window.localStorage.setItem(activePourStorageKey(sessionId, participant.id), pourId);
    }
    if (draftByPour[pourId]) return;

    try {
      await loadScoreForPour(pourId, participant.id);
    } catch (e: any) {
      setError(e?.message || "Could not load score for this pour.");
    }
  };

  const setSliderValue = (key: keyof ScoreDraft, value: number) => {
    if (!activePourId) return;

    const spec = CATEGORY_SPEC.find((c) => c.key === key);
    if (!spec) return;

    if (
      activeFinalLocked ||
      isScrollLocked ||
      (spec.group === "core" && activeCoreLocked) ||
      (spec.group === "reveal" && !revealScoringEnabled)
    ) {
      return;
    }

    const v = spec ? clamp(value, spec.min, spec.max) : value;

    setDraftForPour(activePourId, { [key]: v } as any);
    scheduleSave(activePourId);
  };

  const setSliderValueFromTouch = (
    key: keyof ScoreDraft,
    input: HTMLInputElement,
    clientX: number,
    min: number,
    max: number
  ) => {
    const rect = input.getBoundingClientRect();
    if (rect.width <= 0) return;

    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const raw = min + ratio * (max - min);
    setSliderValue(key, Math.round(raw));
  };

  const handleSliderTouchStart = (
    key: keyof ScoreDraft,
    min: number,
    max: number,
    e: TouchEvent<HTMLInputElement>
  ) => {
    if (isScrollLocked) return;

    const touch = e.touches[0];
    if (!touch) return;

    activeSliderTouch.current = {
      key,
      startX: touch.clientX,
      startY: touch.clientY,
      input: e.currentTarget,
      min,
      max,
      engaged: false,
      canceled: false,
    };
    setDraggingKey(key as string);
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
    setSliderValueFromTouch(gesture.key, gesture.input, touch.clientX, gesture.min, gesture.max);
  };

  const handleSliderTouchEnd = (e: TouchEvent<HTMLInputElement>) => {
    const gesture = activeSliderTouch.current;
    const touch = e.changedTouches[0];

    if (!gesture) return;

    if (!gesture.canceled && touch && !isScrollLocked) {
      const dx = Math.abs(touch.clientX - gesture.startX);
      const dy = Math.abs(touch.clientY - gesture.startY);

      if (gesture.engaged || (dx < 10 && dy < 10)) {
        setSliderValueFromTouch(gesture.key, gesture.input, touch.clientX, gesture.min, gesture.max);
      }
    }

    activeSliderTouch.current = null;
    setDraggingKey(null);
  };

  const setNotes = (text: string) => {
    if (!activePourId) return;
    setDraftForPour(activePourId, { notes: text });
    scheduleSave(activePourId);
  };

  const goNextPour = async () => {
    if (!activePourId || pours.length === 0) return;
    const idx = pours.findIndex((p) => p.id === activePourId);
    const next = idx >= 0 ? pours[idx + 1] : null;
    if (next) await switchPour(next.id);
  };

  const goPrevPour = async () => {
    if (!activePourId || pours.length === 0) return;
    const idx = pours.findIndex((p) => p.id === activePourId);
    const prev = idx > 0 ? pours[idx - 1] : null;
    if (prev) await switchPour(prev.id);
  };

  const lockCoreNow = () => {
    if (!activePourId) return;
    if (activeCoreLocked || activeFinalLocked) return;

    const missingCore = CATEGORY_SPEC.filter(
      (c) => c.group === "core" && (activeDraft as any)[c.key] === 0
    ).map((c) => c.label);

    setConfirmLock({
      kind: "core",
      message:
        missingCore.length > 0
          ? `These core categories are still 0 for Pour ${activePour?.code ?? ""}: ${missingCore.join(", ")}.\n\nLock CORE scores anyway?`
          : `Lock CORE scores for Pour ${activePour?.code ?? ""}?\n\nPackaging and Value can still be scored later after the host unlocks that stage.`,
    });
  };

  const lockFinalNow = () => {
    if (!activePourId) return;
    if (!revealScoringEnabled) {
      showHint("Wait for host unlock");
      return;
    }
    if (activeFinalLocked) return;

    const missingFinal = CATEGORY_SPEC.filter((c) => (activeDraft as any)[c.key] === 0).map(
      (c) => c.label
    );

    setConfirmLock({
      kind: "final",
      message:
        missingFinal.length > 0
          ? `These categories are still 0 for Pour ${activePour?.code ?? ""}: ${missingFinal.join(", ")}.\n\nLock FINAL scores anyway?`
          : `Lock FINAL scores for Pour ${activePour?.code ?? ""}?\n\nThis locks Packaging/Value for this pour before BIG REVEAL.`,
    });
  };

  const handleLockConfirm = async () => {
    if (!confirmLock || !activePourId) return;
    const kind = confirmLock.kind;
    const pourId = activePourId;
    setConfirmLock(null);

    if (saveDebounceTimer.current) {
      window.clearTimeout(saveDebounceTimer.current);
      saveDebounceTimer.current = null;
    }

    if (kind === "core") {
      coreLockedByPourRef.current = { ...coreLockedByPourRef.current, [pourId]: true };
      setCoreLockedByPour((prev) => ({ ...prev, [pourId]: true }));
    } else {
      finalLockedByPourRef.current = { ...finalLockedByPourRef.current, [pourId]: true };
      setFinalLockedByPour((prev) => ({ ...prev, [pourId]: true }));
    }

    await upsertPour(pourId, kind === "core" ? { lockCore: true } : { lockFinal: true });
  };

  if (loading) {
    return (
      <main className="min-h-screen bg-zinc-900 text-white flex items-center justify-center p-6">
        <div className="text-zinc-400">Loading scoring…</div>
      </main>
    );
  }

  if (error) {
    return (
      <main className="min-h-screen bg-zinc-900 text-white flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-zinc-800 border border-zinc-700 rounded-3xl p-6 shadow-sm">
          <div className="text-2xl font-extrabold tracking-tight">Scoring Error</div>
          <p className="text-zinc-400 mt-2">{error}</p>
        </div>
      </main>
    );
  }

  if (!session || !participant) return null;

  if (pours.length === 0) {
    return (
      <main className="min-h-screen bg-zinc-900 text-white flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-zinc-800 border border-zinc-700 rounded-3xl p-6 shadow-sm text-center">
          <div className="text-2xl font-extrabold tracking-tight">No pours yet</div>
          <p className="text-zinc-400 mt-2 text-sm">
            The host hasn&apos;t added any pours to this session. Check back once they set everything up.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-zinc-900 text-white px-4 pb-4 pt-20 sm:p-6">
      <ConnectionBanner />
      <ConfirmModal
        open={!!confirmLock}
        title={confirmLock?.kind === "core" ? "Lock Core Scores?" : "Lock Final Scores?"}
        message={confirmLock?.message ?? ""}
        confirmLabel="Lock"
        cancelLabel="Cancel"
        onConfirm={handleLockConfirm}
        onCancel={() => setConfirmLock(null)}
      />
      <div
        className="pointer-events-none fixed right-3 top-3 z-[60] min-w-[104px] rounded-2xl border border-amber-500/50 bg-zinc-950/95 px-3 py-2 text-right shadow-lg shadow-black/30 backdrop-blur sm:right-4 sm:top-4"
        style={{
          top: "calc(env(safe-area-inset-top, 0px) + 0.75rem)",
          right: "calc(env(safe-area-inset-right, 0px) + 0.75rem)",
        }}
        aria-live="polite"
      >
        <div className="text-[10px] font-semibold uppercase tracking-normal text-amber-400">Score</div>
        <div key={totalKey} className="text-2xl font-extrabold tabular-nums leading-none animate-score-pop">
          {total}
          <span className="text-sm text-zinc-400 font-semibold">/100</span>
        </div>
      </div>
      <div className="max-w-md mx-auto">
        {saveError ? (
          <div className="mb-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 font-semibold flex items-center justify-between gap-3">
            <span>Save failed: {saveError}</span>
            <button onClick={() => setSaveError("")} className="text-red-400 hover:text-red-600 font-bold text-lg leading-none">×</button>
          </div>
        ) : null}
        {/* Header */}
        <div className="bg-zinc-800 border border-zinc-700 rounded-3xl p-5 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-xs text-zinc-400">Cask Unknown</div>
              <div className="text-xl font-extrabold tracking-tight mt-1">{session.title}</div>
              <div className="text-sm text-zinc-400 mt-1">
                Joined as <span className="font-semibold text-white">{participant.display_name}</span>
              </div>
              <div className="text-xs text-zinc-400 mt-1">
                Progress: <span className="font-semibold text-zinc-200">{completedCount}</span> /{" "}
                {pours.length} pours
              </div>
              {/* Core category completion dots for active pour */}
              {activePourId && (
                <div className="mt-2 flex items-center gap-1.5">
                  {CATEGORY_SPEC.filter((c) => c.group === "core").map((c) => {
                    const val = (activeDraft as any)[c.key] as number;
                    return (
                      <div
                        key={c.key}
                        title={c.label}
                        className={[
                          "w-2 h-2 rounded-full transition-colors",
                          val > 0 ? "bg-amber-400" : "bg-zinc-600",
                        ].join(" ")}
                      />
                    );
                  })}
                  <span className="text-xs text-zinc-400 ml-1">
                    {CATEGORY_SPEC.filter((c) => c.group === "core" && (activeDraft as any)[c.key] > 0).length}/8 scored
                  </span>
                </div>
              )}
            </div>

            <div className="flex flex-col items-end gap-2">
              {saveHint ? (
                <div className="text-xs text-zinc-300 bg-zinc-700 border border-zinc-600 rounded-full px-3 py-1">
                  {saveHint}
                </div>
              ) : (
                <div className="text-xs text-transparent">Saved ✓</div>
              )}
              {hostDashboardUrl && (
                <button
                  onClick={() => router.push(hostDashboardUrl)}
                  className="rounded-2xl border border-amber-500/50 bg-amber-500/15 px-3 py-2 text-xs font-semibold text-amber-400 hover:bg-amber-500/25 active:scale-95"
                >
                  Host Dashboard
                </button>
              )}
              <button
                onClick={() => router.push("/profile")}
                className="rounded-2xl border border-zinc-700 bg-zinc-800 px-3 py-2 text-xs font-semibold text-zinc-300 hover:bg-zinc-700 active:scale-95"
              >
                View Profile
              </button>
            </div>
          </div>

          {/* Pour selector */}
          <div className="mt-4">
            <div className="text-xs text-zinc-500 mb-2">Select pour</div>
            <div className="relative">
            <div className="flex gap-2 overflow-x-auto pb-1">
              {pours.map((p) => {
                const isActive = p.id === activePourId;
                const lockedCore = (coreLockedByPour[p.id] ?? false) || isRevealed;
                const lockedFinal = (finalLockedByPour[p.id] ?? false) || isRevealed;

                return (
                  <button
                    key={p.id}
                    onClick={() => switchPour(p.id)}
                    className={[
                      "shrink-0 flex items-center gap-2 rounded-2xl border px-3 py-2 transition-colors",
                      lockedFinal
                        ? "border-emerald-500 bg-emerald-500 text-zinc-950"
                        : lockedCore && isActive
                        ? "border-emerald-500 bg-zinc-900 text-white"
                        : lockedCore
                        ? "border-emerald-500 bg-zinc-700 text-zinc-100"
                        : isActive
                        ? "border-zinc-900 bg-zinc-900 text-white"
                        : "border-zinc-700 bg-zinc-700 text-zinc-100",
                      flashedPour === p.id ? "animate-lock-flash" : "",
                    ].join(" ")}
                  >
                    <div
                      className={[
                        "w-8 h-8 rounded-full flex items-center justify-center font-bold",
                        lockedFinal
                          ? "bg-zinc-950/20 border border-zinc-950/30 text-zinc-950"
                          : lockedCore
                          ? "bg-emerald-500/15 border border-emerald-400 text-white"
                          : isActive
                          ? "bg-white/10 border border-white/15"
                          : "bg-zinc-900 border border-zinc-600",
                      ].join(" ")}
                    >
                      {p.code}
                    </div>
                    <div
                      className={[
                        "text-xs",
                        lockedFinal
                          ? "text-zinc-950"
                          : isActive
                          ? "text-white/80"
                          : lockedCore
                          ? "text-emerald-600"
                          : "text-zinc-500",
                      ].join(" ")}
                    >
                      {lockedFinal ? "Final" : lockedCore ? "Core" : "Score"}
                    </div>
                  </button>
                );
              })}
            </div>
            {pours.length > 3 && (
              <div className="pointer-events-none absolute right-0 top-0 bottom-1 w-10 bg-gradient-to-l from-zinc-800" />
            )}
            </div>
          </div>
        </div>

        {/* Scoring Card */}
        <div className="mt-4 bg-zinc-800 border border-zinc-700 rounded-3xl p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs text-zinc-400">Scoring</div>
              <div className="text-lg font-extrabold tracking-tight">Pour {activePour?.code ?? "—"}</div>
              <div className="text-xs text-zinc-400 mt-1">
                Core scores {activeCoreLocked ? "locked" : "editable"} • Packaging/Value{" "}
                {revealScoringEnabled ? "available" : "available after host unlocks"}
                {activeFinalLocked ? " • FINAL LOCKED" : ""}
              </div>
            </div>

            <div className="flex gap-2">
              <button
                onClick={goPrevPour}
                disabled={!canGoPrev}
                className={[
                  "rounded-2xl border px-4 py-3 text-sm font-semibold min-w-[64px]",
                  canGoPrev
                    ? "border-zinc-200 bg-white text-zinc-950 hover:bg-zinc-50 active:scale-95"
                    : "border-zinc-700 bg-zinc-900 text-zinc-600 cursor-not-allowed",
                ].join(" ")}
              >
                Prev
              </button>
              <button
                onClick={goNextPour}
                disabled={!canGoNext}
                className={[
                  "rounded-2xl border px-4 py-3 text-sm font-semibold min-w-[64px]",
                  canGoNext
                    ? "border-zinc-900 bg-zinc-900 text-white hover:bg-zinc-800 active:scale-95"
                    : "border-zinc-700 bg-zinc-900 text-zinc-600 cursor-not-allowed",
                ].join(" ")}
              >
                Next
              </button>
            </div>
          </div>

          {/* Lock core */}
          <div className="mt-4">
            <button
              onClick={lockCoreNow}
              disabled={activeCoreLocked || activeFinalLocked}
              className={[
                "w-full rounded-2xl px-4 py-3 text-sm font-semibold border flex items-center justify-center gap-2",
                activeCoreLocked || activeFinalLocked
                  ? "border-zinc-700 bg-zinc-900 text-zinc-500 cursor-not-allowed"
                  : "border-zinc-900 bg-zinc-900 text-white hover:bg-zinc-800 active:scale-95",
              ].join(" ")}
            >
              {activeCoreLocked ? <Lock size={15} /> : <LockOpen size={15} />}
              {activeCoreLocked ? "Core Scores Locked" : "Lock Core Scores"}
            </button>
            <div className="mt-2 text-xs text-zinc-500">
              Lock core first. Packaging/Value unlocks when host allows it.
            </div>
          </div>

          {/* Lock final (per pour) */}
          <div className="mt-3">
            <button
              onClick={lockFinalNow}
              disabled={!revealScoringEnabled || activeFinalLocked}
              className={[
                "w-full rounded-2xl px-4 py-3 text-sm font-extrabold border flex items-center justify-center gap-2",
                !revealScoringEnabled || activeFinalLocked
                  ? "border-zinc-700 bg-zinc-900 text-zinc-500 cursor-not-allowed"
                  : "border-amber-600 bg-amber-500 text-black hover:bg-amber-600 active:scale-95",
              ].join(" ")}
            >
              {activeFinalLocked ? <Lock size={15} /> : <CheckCircle2 size={15} />}
              {activeFinalLocked ? "Final Scores Locked" : "Lock Final Scores"}
            </button>
            <div className="mt-2 text-xs text-zinc-500">
              After Packaging/Value is open, lock FINAL scores for this pour so nothing changes before BIG REVEAL.
            </div>
          </div>

          <div className="mt-5 space-y-5">
            {CATEGORY_SPEC.map((c) => {
              const val = (activeDraft as any)[c.key] as number;

              const isCore = c.group === "core";
              const isRevealField = c.group === "reveal";

              // Rules:
              // - Core: editable only before core lock
              // - Packaging/Value: editable only after host unlocks and before final lock
                const disabled =
                  activeFinalLocked ||
                  isScrollLocked ||
                  (isCore ? activeCoreLocked : isRevealField ? !revealScoringEnabled : false);

              const isExpanded = expandedCategory === c.key;

              return (
                <div key={c.key} className="border-t border-zinc-700 pt-4 first:border-t-0 first:pt-0">
                  <button
                    type="button"
                    onClick={() => setExpandedCategory(isExpanded ? null : c.key)}
                    className="w-full flex items-center justify-between text-left"
                  >
                    <div className="font-semibold text-zinc-100">
                      {c.label}
                      {isRevealField && !revealScoringEnabled ? (
                        <span className="ml-2 text-[11px] font-semibold text-zinc-500">(locked)</span>
                      ) : null}
                      {activeFinalLocked ? (
                        <span className="ml-2 text-[11px] font-semibold text-amber-400">(final locked)</span>
                      ) : null}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-zinc-400">
                        [{c.min}–{c.max}]{" "}
                        <span className="font-semibold text-zinc-200 tabular-nums">{val}</span>
                      </span>
                      <span className={["text-zinc-400 text-xs transition-transform duration-150", isExpanded ? "rotate-90" : ""].join(" ")}>▸</span>
                    </div>
                  </button>

                  {isExpanded && (
                    <div className="mt-1.5 text-xs leading-5 text-zinc-500 animate-fade-in">
                      {c.description}
                      <br />
                      <span className="text-zinc-400">{c.examples}</span>
                    </div>
                  )}

                  <div className="mt-2">
                    <div className="relative">
                      <input
                        type="range"
                        min={c.min}
                        max={c.max}
                        step={1}
                        value={val}
                        onChange={(e) => {
                          if (activeSliderTouch.current) return;
                          setSliderValue(c.key as any, Number(e.target.value));
                        }}
                        onTouchStart={(e) => handleSliderTouchStart(c.key as any, c.min, c.max, e)}
                        onTouchMove={handleSliderTouchMove}
                        onTouchEnd={handleSliderTouchEnd}
                        onTouchCancel={() => {
                          activeSliderTouch.current = null;
                          setDraggingKey(null);
                        }}
                        disabled={disabled}
                        className={["w-full cask-slider", disabled ? "opacity-40" : "opacity-100"].join(" ")}
                        style={{
                          touchAction: "pan-y",
                          background: `linear-gradient(to right, #f59e0b 0%, #f59e0b ${((val - c.min) / (c.max - c.min)) * 100}%, #e4e4e7 ${((val - c.min) / (c.max - c.min)) * 100}%, #e4e4e7 100%)`,
                        }}
                      />
                      {draggingKey === c.key && (
                        <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-zinc-900 text-white text-sm font-extrabold px-3 py-1 rounded-xl pointer-events-none tabular-nums">
                          {val}
                        </div>
                      )}
                    </div>
                    <div className="mt-1 flex justify-between text-xs text-zinc-400 tabular-nums">
                      <span>{c.min}</span>
                      <span>{c.max}</span>
                    </div>
                  </div>
                </div>
              );
            })}

            {/* Notes */}
            <div className="border-t border-zinc-700 pt-4">
              <div className="flex items-center justify-between">
                <div className="font-semibold text-zinc-100">Notes</div>
                <div className="text-xs text-zinc-400">(optional)</div>
              </div>
              <textarea
                ref={notesRef}
                value={activeDraft.notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="e.g., vanilla + caramel"
                className="mt-2 w-full min-h-[84px] rounded-2xl border border-zinc-700 bg-zinc-900 px-4 py-3 text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-amber-500/30"
              />
              <div className="mt-2 text-xs text-zinc-500">Notes auto-save too.</div>
            </div>
          </div>
        </div>

        <div className="mt-4 text-center text-xs text-zinc-500">
          Flow: Lock core (each pour) → host Soft Reveal → score Packaging/Value → Lock FINAL (each pour) → BIG REVEAL.
        </div>
      </div>
    </main>
  );
}
