"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type TouchEvent,
} from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { ConnectionBanner } from "@/components/connection-banner";
import { ConfirmModal } from "@/components/confirm-modal";
import { Check, ChevronLeft, ChevronRight, GlassWater, Info, Lock, Trophy } from "lucide-react";
import { Button, buttonStyles } from "@/components/ui/button";
import { Card, Eyebrow } from "@/components/ui/card";
import { LoadingScreen, Wordmark } from "@/components/ui/brand";
import { Notice } from "@/components/ui/notice";
import { PageShell } from "@/components/ui/page";
import { cx } from "@/components/ui/cx";
import { useWakeLock } from "@/lib/use-wake-lock";
import {
  CATEGORY_SPEC,
  clamp,
  computeTotal,
  makeEmptyDraft,
  type ScoreDraft,
} from "@/lib/scoring/categories";
import { createScoreAutosave, type ScoreAutosave } from "@/lib/scoring/autosave";
import { getParticipantSession, saveParticipantScore } from "@/lib/session-api";
import {
  errorMessage,
  logEvent,
  newCorrelationId,
  userFacingError,
} from "@/lib/log";

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
  key: ScoreCategoryKey;
  startX: number;
  startY: number;
  input: HTMLInputElement;
  min: number;
  max: number;
  engaged: boolean;
  canceled: boolean;
};

type LockExtra = { lockCore?: boolean; lockFinal?: boolean };
type ScoreCategoryKey = (typeof CATEGORY_SPEC)[number]["key"];
function storageKey(sessionId: string) {
  return `cask_unknown_participant_${sessionId}`;
}

function activePourStorageKey(sessionId: string, participantId: string) {
  return `cask_unknown_active_pour_${sessionId}_${participantId}`;
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
  const scrollLockTimer = useRef<number | null>(null);
  const activeSliderTouch = useRef<SliderTouchState | null>(null);
  const notesRef = useRef<HTMLTextAreaElement | null>(null);
  const coreLockedByPourRef = useRef<Record<string, boolean>>({});
  const finalLockedByPourRef = useRef<Record<string, boolean>>({});
  const participantAccessTokenRef = useRef("");

  // The autosave engine calls through this ref so a debounced save always
  // runs the latest render's save implementation instead of a stale closure.
  const performSaveRef = useRef<
    (pourId: string, draft: ScoreDraft, extra?: LockExtra) => Promise<void>
  >(async () => {});
  const autosaveRef = useRef<ScoreAutosave<ScoreDraft, LockExtra> | null>(null);
  const getAutosave = () => {
    if (autosaveRef.current == null) {
      autosaveRef.current = createScoreAutosave<ScoreDraft, LockExtra>({
        debounceMs: 500,
        save: (pourId, draft, extra) => performSaveRef.current(pourId, draft, extra),
      });
    }
    return autosaveRef.current;
  };

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
    // The autosave engine's registry is the source of truth for what gets
    // saved; React state mirrors it for rendering.
    const autosave = getAutosave();
    const existing = autosave.getDraft(pourId) ?? makeEmptyDraft();
    const nextDraft = { ...existing, ...patch };
    autosave.setDraft(pourId, nextDraft);
    setDraftByPour((prev) => ({ ...prev, [pourId]: nextDraft }));
  };

  const applyScoreRow = (row: ScoreRow) => {
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

  const loadScoreForPour = async (pourId: string, participantId: string) => {
    if (!sessionId || !participantAccessTokenRef.current) return;
    const { data: snapshot, error: sErr } = await getParticipantSession(
      supabase,
      sessionId,
      participantId,
      participantAccessTokenRef.current,
    );

    if (sErr) {
      throw sErr;
    }

    const row = snapshot?.scores.find((score) => score.pour_id === pourId);
    if (row) {
      applyScoreRow(row as ScoreRow);
    } else {
      setDraftForPour(pourId, makeEmptyDraft());
      setCoreLockedByPour((prev) => ({ ...prev, [pourId]: false }));
      setFinalLockedByPour((prev) => ({ ...prev, [pourId]: false }));
    }
  };

  // Re-assigned every render so debounced saves use fresh state and props.
  useEffect(() => {
    performSaveRef.current = async (pourId, d, extra) => {
      if (!sessionId || !participant) return;

      const score = {
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
        notes: d.notes ?? "",
      };

    showHint(extra?.lockFinal ? "Locking final…" : extra?.lockCore ? "Locking…" : "Saving…");
    setSaveError("");

    const { error: uErr } = await saveParticipantScore(supabase, {
      sessionId,
      pourId,
      participantId: participant.id,
      accessToken: participantAccessTokenRef.current,
      score,
      lockCore: extra?.lockCore,
      lockFinal: extra?.lockFinal,
    });

    if (uErr) {
      const ref = newCorrelationId();
      logEvent("error", "score.save_failed", {
        ref,
        sessionId,
        pourId,
        lockCore: !!extra?.lockCore,
        lockFinal: !!extra?.lockFinal,
        message: uErr.message,
      });
      setSaveError(userFacingError("Check your connection and try again.", ref));
      showHint("Failed ✗");
      // Revert optimistic lock state if a lock op failed
      if (extra?.lockCore) setCoreLockedByPour((prev) => ({ ...prev, [pourId]: false }));
      if (extra?.lockFinal) setFinalLockedByPour((prev) => ({ ...prev, [pourId]: false }));
      return;
    }

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
  });

  const upsertPour = (pourId: string, extra?: LockExtra) => getAutosave().saveNow(pourId, extra);

  const scheduleSave = (pourId: string) => getAutosave().schedule(pourId);

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

        const raw =
          typeof window !== "undefined" ? window.localStorage.getItem(storageKey(sessionId)) : null;
        if (!raw) {
          router.push(joinUrl);
          return;
        }

        let parsed: { participantId?: string; accessToken?: string } | null = null;
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

        const accessToken = parsed?.accessToken || participantId;
        const { data: snapshot, error: snapshotError } = await getParticipantSession(
          supabase,
          sessionId,
          participantId,
          accessToken,
        );

        if (snapshotError || !snapshot) {
          window.localStorage.removeItem(storageKey(sessionId));
          router.push(joinUrl);
          return;
        }

        participantAccessTokenRef.current = accessToken;
        const participantRow = snapshot.participant as ParticipantRow;
        const poursList = snapshot.pours as PourRow[];
        setSession(snapshot.session as SessionRow);
        setPours(poursList);
        setParticipant(participantRow);
        const rowByPour = new Map(snapshot.scores.map((row) => [row.pour_id, row]));
        poursList.forEach((pour) => {
          const row = rowByPour.get(pour.id);
          if (row) {
            applyScoreRow(row as ScoreRow);
          } else {
            setDraftForPour(pour.id, makeEmptyDraft());
            setCoreLockedByPour((prev) => ({ ...prev, [pour.id]: false }));
            setFinalLockedByPour((prev) => ({ ...prev, [pour.id]: false }));
          }
        });

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
      } catch (e: unknown) {
        const ref = newCorrelationId();
        logEvent("error", "score.load_failed", {
          ref,
          sessionId,
          message: errorMessage(e),
        });
        setError(userFacingError("Something went wrong while loading scoring.", ref));
        setLoading(false);
      }
    };

    run();

    return () => {
      if (saveHintTimer.current) window.clearTimeout(saveHintTimer.current);
      if (scrollLockTimer.current) window.clearTimeout(scrollLockTimer.current);
      // Persist pending edits instead of dropping them on navigation.
      void autosaveRef.current?.flushAll();
    };
    // The loader is render-local and this effect must only restart when the
    // route identity changes; adding it would reload on every score render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, router, joinUrl]);

  // Flush pending saves when the tab is hidden or the page is being unloaded,
  // so backgrounding the phone mid-slider doesn't lose the last change.
  useEffect(() => {
    const flushPending = () => {
      void autosaveRef.current?.flushAll();
    };
    const handleVisibility = () => {
      if (document.visibilityState === "hidden") flushPending();
    };

    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("pagehide", flushPending);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("pagehide", flushPending);
    };
  }, []);

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
        (payload) => {
          const newStatus = String(payload.new?.status || "");
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
        (payload) => {
          const nextRow = payload.new as Partial<ScoreRow>;
          const prevRow = payload.old as Partial<ScoreRow>;
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
    // Save any pending edits on the pour we're leaving before it loses focus.
    if (activePourId && activePourId !== pourId) {
      void getAutosave().flush(activePourId);
    }
    setActivePourId(pourId);
    if (sessionId) {
      window.localStorage.setItem(activePourStorageKey(sessionId, participant.id), pourId);
    }
    if (draftByPour[pourId]) return;

    try {
      await loadScoreForPour(pourId, participant.id);
    } catch (e: unknown) {
      const ref = newCorrelationId();
      logEvent("error", "score.load_pour_score_failed", {
        ref,
        sessionId,
        pourId,
        message: errorMessage(e),
      });
      setError(userFacingError("Could not load your score for this pour.", ref));
    }
  };

  const setSliderValue = (key: ScoreCategoryKey, value: number) => {
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

    setDraftForPour(activePourId, { [key]: v });
    scheduleSave(activePourId);
  };

  const setSliderValueFromTouch = (
    key: ScoreCategoryKey,
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
    key: ScoreCategoryKey,
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
      (c) => c.group === "core" && activeDraft[c.key] === 0
    ).map((c) => c.label);

    setConfirmLock({
      kind: "core",
      message:
        missingCore.length > 0
          ? `${missingCore.join(", ")} ${missingCore.length === 1 ? "is" : "are"} still at 0 for Pour ${activePour?.code ?? ""}.\n\nLock your core scores anyway?`
          : `You won't be able to change them for Pour ${activePour?.code ?? ""}. Packaging and value can still be scored after the host starts the soft reveal.`,
    });
  };

  const lockFinalNow = () => {
    if (!activePourId) return;
    if (!revealScoringEnabled) {
      showHint("Waiting for the host");
      return;
    }
    if (activeFinalLocked) return;

    const missingFinal = CATEGORY_SPEC.filter((c) => activeDraft[c.key] === 0).map(
      (c) => c.label
    );

    setConfirmLock({
      kind: "final",
      message:
        missingFinal.length > 0
          ? `${missingFinal.join(", ")} ${missingFinal.length === 1 ? "is" : "are"} still at 0 for Pour ${activePour?.code ?? ""}.\n\nLock your final scores anyway?`
          : `This locks every score for Pour ${activePour?.code ?? ""} ahead of the big reveal.`,
    });
  };

  const handleLockConfirm = async () => {
    if (!confirmLock || !activePourId) return;
    const kind = confirmLock.kind;
    const pourId = activePourId;
    setConfirmLock(null);

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
    return <LoadingScreen label="Loading scoring" />;
  }

  if (error) {
    return (
      <PageShell center>
        <div className="w-full text-center">
          <Wordmark size="lg" />
          <Notice tone="danger" title="Scoring didn't load" className="mt-8 text-left">
            {error}
          </Notice>
          <Button variant="primary" size="lg" block className="mt-4" onClick={() => window.location.reload()}>
            Try again
          </Button>
        </div>
      </PageShell>
    );
  }

  if (!session || !participant) return null;

  if (pours.length === 0) {
    return (
      <PageShell center>
        <Card className="w-full text-center">
          <GlassWater className="mx-auto h-8 w-8 text-accent" />
          <h1 className="mt-3 font-display text-2xl font-semibold">No pours yet</h1>
          <p className="mt-2 text-sm text-fg-muted">
            The host hasn&apos;t set out any glasses for {session.title} yet. Refresh once they&apos;re
            ready.
          </p>
          <Button variant="secondary" className="mt-5" onClick={() => window.location.reload()}>
            Refresh
          </Button>
        </Card>
      </PageShell>
    );
  }

  const coreCategories = CATEGORY_SPEC.filter((c) => c.group === "core");
  const revealCategories = CATEGORY_SPEC.filter((c) => c.group === "reveal");
  const coreScoredCount = coreCategories.filter((c) => activeDraft[c.key] > 0).length;

  // Where this pour is in the core → soft reveal → final flow.
  const stage: "core" | "waiting" | "final" | "done" = activeFinalLocked
    ? "done"
    : !activeCoreLocked
      ? "core"
      : revealScoringEnabled
        ? "final"
        : "waiting";

  const stageSteps = [
    { label: "Core scores", done: activeCoreLocked, current: stage === "core" },
    { label: "Soft reveal", done: revealScoringEnabled, current: stage === "waiting" },
    { label: "Final lock", done: activeFinalLocked, current: stage === "final" },
  ];

  const stageMessage = {
    core: "Score the eight core categories, then lock them in.",
    waiting: "Core locked. Packaging and value open when the host starts the soft reveal.",
    final: "Soft reveal is live. Score packaging and value, then lock your final scores.",
    done: isRevealed
      ? "The bottles have been revealed."
      : "Final scores locked for this pour. Nothing changes before the big reveal.",
  }[stage];

  const renderCategory = (c: (typeof CATEGORY_SPEC)[number]) => {
    const val = activeDraft[c.key];
    const isCore = c.group === "core";

    // Core: editable only before core lock.
    // Packaging/Value: editable only after host unlocks and before final lock.
    const disabled =
      activeFinalLocked ||
      isScrollLocked ||
      (isCore ? activeCoreLocked : !revealScoringEnabled);

    const isExpanded = expandedCategory === c.key;
    const pct = ((val - c.min) / (c.max - c.min)) * 100;
    const detailsId = `category-${c.key}-details`;

    return (
      <div key={c.key} className="border-b border-line px-4 py-4 last:border-b-0">
        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => setExpandedCategory(isExpanded ? null : c.key)}
            aria-expanded={isExpanded}
            aria-controls={detailsId}
            className="-m-1 flex items-center gap-1.5 rounded-lg p-1 text-left font-semibold text-fg"
          >
            {c.label}
            <Info className={cx("h-3.5 w-3.5", isExpanded ? "text-accent" : "text-fg-faint")} />
          </button>
          <div className="tabular-nums">
            <span className={cx("text-lg font-bold", val > 0 ? "text-accent" : "text-fg-faint")}>{val}</span>
            <span className="text-sm text-fg-faint"> / {c.max}</span>
          </div>
        </div>

        {isExpanded ? (
          <p id={detailsId} className="mt-1 text-xs leading-5 text-fg-muted animate-fade-in">
            {c.description} <span className="text-fg-faint">{c.examples}</span>
          </p>
        ) : null}

        <div className="relative mt-3 py-1">
          <input
            type="range"
            min={c.min}
            max={c.max}
            step={1}
            value={val}
            aria-label={`${c.label} score`}
            aria-valuetext={`${val} of ${c.max}`}
            onChange={(e) => {
              if (activeSliderTouch.current) return;
              setSliderValue(c.key, Number(e.target.value));
            }}
            onTouchStart={(e) => handleSliderTouchStart(c.key, c.min, c.max, e)}
            onTouchMove={handleSliderTouchMove}
            onTouchEnd={handleSliderTouchEnd}
            onTouchCancel={() => {
              activeSliderTouch.current = null;
              setDraggingKey(null);
            }}
            disabled={disabled}
            className={cx("cask-slider block w-full", disabled && "opacity-50")}
            style={{ touchAction: "pan-y", "--fill": `${pct}%` } as CSSProperties}
          />
          {draggingKey === c.key && (
            <div
              className="pointer-events-none absolute -top-9 -translate-x-1/2 rounded-xl bg-accent px-3 py-1 text-sm font-extrabold tabular-nums text-on-accent shadow-lg"
              style={{ left: `calc(${pct}% + ${12 - pct * 0.24}px)` }}
            >
              {val}
            </div>
          )}
        </div>
      </div>
    );
  };

  let primaryAction: ReactNode;
  if (stage === "core") {
    primaryAction = (
      <Button variant="primary" size="lg" block onClick={lockCoreNow}>
        <Lock className="h-4 w-4" /> Lock core scores
      </Button>
    );
  } else if (stage === "final") {
    primaryAction = (
      <Button variant="primary" size="lg" block onClick={lockFinalNow}>
        <Lock className="h-4 w-4" /> Lock final scores
      </Button>
    );
  } else if (isRevealed) {
    primaryAction = (
      <Link href={`/reveal/${session.id}`} className={buttonStyles({ variant: "primary", size: "lg", block: true })}>
        <Trophy className="h-4 w-4" /> See the results
      </Link>
    );
  } else if (canGoNext) {
    primaryAction = (
      <Button variant="secondary" size="lg" block onClick={goNextPour}>
        Next pour <ChevronRight className="h-4 w-4" />
      </Button>
    );
  } else {
    primaryAction = (
      <div className="flex h-13 w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-line-strong text-sm font-semibold text-fg-muted">
        {stage === "done" ? <Check className="h-4 w-4 text-success" /> : null}
        {stage === "done" ? "Ready for the reveal" : "Waiting for the host"}
      </div>
    );
  }

  return (
    <main className="min-h-dvh bg-canvas px-4 pb-32 text-fg sm:px-6">
      <ConnectionBanner />
      <ConfirmModal
        open={!!confirmLock}
        title={confirmLock?.kind === "core" ? "Lock core scores?" : "Lock final scores?"}
        message={confirmLock?.message ?? ""}
        confirmLabel="Lock scores"
        cancelLabel="Keep editing"
        onConfirm={handleLockConfirm}
        onCancel={() => setConfirmLock(null)}
      />

      {/* Sticky header: which pour, running total, pour switcher */}
      <header
        className="sticky top-0 z-30 -mx-4 border-b border-line bg-canvas/90 px-4 pb-3 backdrop-blur-md sm:-mx-6 sm:px-6"
        style={{ paddingTop: "max(0.75rem, env(safe-area-inset-top))" }}
      >
        <div className="mx-auto max-w-md">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="truncate text-xs text-fg-faint">
                {session.title} · {participant.display_name}
              </div>
              <h1 className="font-display text-3xl font-semibold leading-tight">Pour {activePour?.code ?? "—"}</h1>
              <div className="h-4 text-xs text-fg-muted" aria-live="polite">
                {saveHint}
              </div>
            </div>
            <div className="shrink-0 text-right" aria-live="polite" aria-label={`Total ${total} of 100`}>
              <div
                key={totalKey}
                className="font-display text-4xl font-semibold leading-none tabular-nums text-accent animate-score-pop"
              >
                {total}
              </div>
              <div className="mt-1 text-[11px] text-fg-faint">of 100</div>
            </div>
          </div>

          <div className="no-scrollbar -mx-4 mt-3 flex gap-2 overflow-x-auto px-4" aria-label="Pours">
            {pours.map((p) => {
              const isActive = p.id === activePourId;
              const lockedCore = (coreLockedByPour[p.id] ?? false) || isRevealed;
              const lockedFinal = (finalLockedByPour[p.id] ?? false) || isRevealed;

              return (
                <button
                  key={p.id}
                  type="button"
                  aria-pressed={isActive}
                  aria-label={`Pour ${p.code}${lockedFinal ? ", final locked" : lockedCore ? ", core locked" : ""}`}
                  onClick={() => switchPour(p.id)}
                  className={cx(
                    "flex h-10 min-w-10 shrink-0 items-center justify-center gap-1 rounded-full border px-3 text-sm font-bold",
                    isActive
                      ? "border-accent bg-accent text-on-accent"
                      : lockedFinal
                        ? "border-success/40 bg-success-soft text-success"
                        : lockedCore
                          ? "border-success/40 bg-surface text-success"
                          : "border-line bg-surface text-fg-muted hover:border-line-strong",
                    flashedPour === p.id && "animate-lock-flash",
                  )}
                >
                  {lockedFinal ? <Check className="h-3.5 w-3.5" /> : lockedCore ? <Lock className="h-3 w-3" /> : null}
                  {p.code}
                </button>
              );
            })}
          </div>
          <div className="mt-2 text-[11px] text-fg-faint">
            {completedCount} of {pours.length} pours started
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-md pt-4">
        {saveError ? (
          <Notice tone="danger" title="Your last change didn't save" onDismiss={() => setSaveError("")} className="mb-4">
            {saveError}
          </Notice>
        ) : null}

        {/* Where this pour is in the flow */}
        <Card>
          <ol className="grid grid-cols-3 gap-2">
            {stageSteps.map((step) => (
              <li key={step.label}>
                <div
                  className={cx(
                    "h-1.5 rounded-full",
                    step.done ? "bg-success" : step.current ? "bg-accent" : "bg-line-strong",
                  )}
                />
                <div
                  className={cx(
                    "mt-1.5 text-[11px] font-semibold",
                    step.done ? "text-success" : step.current ? "text-fg" : "text-fg-faint",
                  )}
                >
                  {step.label}
                </div>
              </li>
            ))}
          </ol>
          <p className="mt-3 text-sm text-fg-muted">{stageMessage}</p>
        </Card>

        <section className="mt-6">
          <div className="mb-2 flex items-center justify-between px-1">
            <Eyebrow>Core</Eyebrow>
            <span className="flex items-center gap-1 text-xs text-fg-faint">
              {activeCoreLocked ? (
                <>
                  <Lock className="h-3 w-3 text-success" /> <span className="text-success">Locked</span>
                </>
              ) : (
                `${coreScoredCount} of ${coreCategories.length} scored`
              )}
            </span>
          </div>
          <div className="overflow-hidden rounded-3xl border border-line bg-surface">
            {coreCategories.map(renderCategory)}
          </div>
        </section>

        <section className="mt-6">
          <div className="mb-2 flex items-center justify-between px-1">
            <Eyebrow>After soft reveal</Eyebrow>
            <span className="flex items-center gap-1 text-xs text-fg-faint">
              {activeFinalLocked ? (
                <>
                  <Lock className="h-3 w-3 text-success" /> <span className="text-success">Locked</span>
                </>
              ) : revealScoringEnabled ? (
                "Open"
              ) : (
                <>
                  <Lock className="h-3 w-3" /> Opens when the host allows
                </>
              )}
            </span>
          </div>
          <div className="overflow-hidden rounded-3xl border border-line bg-surface">
            {revealCategories.map(renderCategory)}
          </div>
        </section>

        <section className="mt-6">
          <label htmlFor="pour-notes" className="mb-2 flex items-center justify-between px-1">
            <Eyebrow>Tasting notes</Eyebrow>
            <span className="text-xs text-fg-faint">Optional · saves as you type</span>
          </label>
          <textarea
            id="pour-notes"
            ref={notesRef}
            value={activeDraft.notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Vanilla, caramel, a little orange peel"
            className="min-h-[96px] w-full rounded-3xl border border-line bg-surface px-4 py-3 text-fg placeholder:text-fg-faint focus:border-accent focus:outline-none"
          />
        </section>

        <div className="mt-6 flex justify-center gap-2">
          {hostDashboardUrl ? (
            <Link href={hostDashboardUrl} className={buttonStyles({ variant: "ghost", size: "sm" })}>
              Host dashboard
            </Link>
          ) : null}
          <Link href="/profile" className={buttonStyles({ variant: "ghost", size: "sm" })}>
            Your profile
          </Link>
        </div>
      </div>

      {/* Thumb-reach action bar */}
      <div
        className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-canvas/95 backdrop-blur-md"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <div className="mx-auto flex max-w-md items-center gap-2 px-4 py-3">
          <Button
            variant="secondary"
            size="iconLg"
            onClick={goPrevPour}
            disabled={!canGoPrev}
            aria-label="Previous pour"
          >
            <ChevronLeft className="h-5 w-5" />
          </Button>
          <div className="min-w-0 flex-1">{primaryAction}</div>
          <Button
            variant="secondary"
            size="iconLg"
            onClick={goNextPour}
            disabled={!canGoNext}
            aria-label="Next pour"
          >
            <ChevronRight className="h-5 w-5" />
          </Button>
        </div>
      </div>
    </main>
  );
}
