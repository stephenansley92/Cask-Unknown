"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import Link from "next/link";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { ConfirmModal } from "@/components/confirm-modal";
import { errorMessage } from "@/lib/log";
import { deleteHostParticipant, getHostSession } from "@/lib/session-api";
import { ChevronLeft, Users } from "lucide-react";
import { Button, buttonStyles } from "@/components/ui/button";
import { Card, Eyebrow } from "@/components/ui/card";
import { LoadingScreen, Wordmark } from "@/components/ui/brand";
import { Notice } from "@/components/ui/notice";
import { PageShell } from "@/components/ui/page";

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

export default function HostTastersPage() {
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();

  const sessionId = params?.id;
  const hostKey = searchParams.get("key") || "";

  // Host deletes (scores/participants) are restricted to authenticated users by
  // RLS, so use the cookie-based auth client. Reads are public so it covers both;
  // the plain anon client would be silently rejected on deletes.
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);

  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<SessionRow | null>(null);
  const [participants, setParticipants] = useState<ParticipantRow[]>([]);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [pendingRemove, setPendingRemove] = useState<ParticipantRow | null>(null);

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
      setParticipants(snapshot.participants as ParticipantRow[]);
      setLoading(false);
    } catch (e: unknown) {
      setError(errorMessage(e));
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
    setPendingRemove(participant);
  };

  const confirmRemoveTaster = async () => {
    const participant = pendingRemove;
    setPendingRemove(null);
    if (!participant || !sessionId) return;

    try {
      setBusyId(participant.id);
      setError("");

      const { error: partErr } = await deleteHostParticipant(
        supabase,
        sessionId,
        participant.id,
        hostKey,
      );

      if (partErr) {
        await loadAll();
        setError(
          `Could not remove ${participant.display_name} (${partErr.message}). Please try again.`
        );
        setBusyId(null);
        return;
      }

      setParticipants((prev) => prev.filter((p) => p.id !== participant.id));
      setBusyId(null);
      showSaved("Taster removed");
    } catch (e: unknown) {
      setError(errorMessage(e));
      setBusyId(null);
    }
  };

  if (loading) {
    return <LoadingScreen label="Loading tasters" />;
  }

  if (error) {
    return (
      <PageShell center>
        <div className="w-full text-center">
          <Wordmark size="lg" />
          <Notice tone="danger" title="Tasters didn't load" className="mt-8 text-left">
            {error}
          </Notice>
          <Link href={hostUrl || "/"} className={buttonStyles({ variant: "secondary", size: "lg", block: true, className: "mt-4" })}>
            Back to the dashboard
          </Link>
        </div>
      </PageShell>
    );
  }

  if (!session) return null;

  return (
    <PageShell width="md">
      <ConfirmModal
        open={!!pendingRemove}
        title={`Remove ${pendingRemove?.display_name ?? "this taster"}?`}
        message="Their saved scores for this tasting are deleted too. This can't be undone."
        confirmLabel="Remove taster"
        cancelLabel="Keep them"
        dangerous
        onConfirm={confirmRemoveTaster}
        onCancel={() => setPendingRemove(null)}
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
        <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight">
          Tasters <span className="text-fg-faint">{participants.length}</span>
        </h1>
        <p className="mt-1 text-sm text-fg-muted">Remove anyone who joined by mistake.</p>
      </div>

      <Card className="mt-6" padded={false}>
        {participants.length === 0 ? (
          <div className="px-5 py-8 text-center">
            <Users className="mx-auto h-7 w-7 text-fg-faint" />
            <div className="mt-2 font-semibold">Nobody has joined yet</div>
            <p className="mt-1 text-sm text-fg-muted">Share the QR code from the dashboard to invite tasters.</p>
          </div>
        ) : (
          <ul>
            {participants.map((participant) => {
              const removing = busyId === participant.id;

              return (
                <li
                  key={participant.id}
                  className="flex items-center gap-3 border-b border-line px-5 py-3.5 last:border-b-0"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent-soft font-display font-semibold text-accent">
                    {participant.display_name.charAt(0).toUpperCase()}
                  </span>
                  <span className="min-w-0 flex-1 truncate font-semibold">{participant.display_name}</span>
                  <Button
                    variant="ghostDanger"
                    size="sm"
                    onClick={() => removeTaster(participant)}
                    disabled={!!busyId}
                  >
                    {removing ? "Removing…" : "Remove"}
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <p className="mt-4 text-xs text-fg-faint">
        A removed taster&apos;s phone isn&apos;t signed out, but they drop out of the stats and their scores are gone.
      </p>
    </PageShell>
  );
}
