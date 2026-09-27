"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { isAuthSessionMissingError } from "@supabase/supabase-js";
import { ChevronLeft, EyeOff, GlassWater } from "lucide-react";
import { createHostedSession } from "@/lib/session-api";
import { Button, buttonStyles } from "@/components/ui/button";
import { Card, Eyebrow } from "@/components/ui/card";
import { Wordmark } from "@/components/ui/brand";
import { cx } from "@/components/ui/cx";
import { FieldLabel, inputStyles } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { PageShell } from "@/components/ui/page";

function defaultTitle() {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `Blind Flight - ${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}`;
}

export default function CreatePage() {
  const router = useRouter();

  const [title, setTitle] = useState(defaultTitle());
  const [isBlind, setIsBlind] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [createdId, setCreatedId] = useState<string>("");

  const createSession = async (e: FormEvent) => {
    e.preventDefault();
    try {
      setBusy(true);
      setError("");
      setCreatedId("");

      const cleanTitle = title.trim();
      if (!cleanTitle) {
        setError("Please enter a session title.");
        setBusy(false);
        return;
      }

      const supabase = createSupabaseBrowserClient();
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError && !isAuthSessionMissingError(userError)) {
        setError(userError.message);
        setBusy(false);
        return;
      }

      if (!user) {
        setBusy(false);
        router.push("/login?redirectTo=%2Fcreate");
        return;
      }

      const { data, error: insErr } = await createHostedSession(
        supabase,
        cleanTitle,
        isBlind,
      );

      if (insErr || !data) {
        setError(insErr?.message || "Could not create the session.");
        setBusy(false);
        return;
      }

      const sessionId = data.id as string;
      const key = data.host_key as string;

      console.log("[CREATE] New session:", sessionId);
      setCreatedId(sessionId);

      router.push(`/host/${sessionId}?key=${encodeURIComponent(key)}`);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Unknown error.");
      setBusy(false);
    }
  };

  return (
    <PageShell>
      <header className="flex items-center justify-between">
        <Link href="/" className={buttonStyles({ variant: "ghost", size: "sm", className: "-ml-3" })}>
          <ChevronLeft className="h-4 w-4" /> Home
        </Link>
        <Wordmark />
      </header>

      <form onSubmit={createSession} className="mt-6 animate-fade-slide-in">
        <Eyebrow>New tasting</Eyebrow>
        <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight">Host a tasting</h1>
        <p className="mt-1 text-sm text-fg-muted">
          Name the flight, then add pours and invite tasters from the host dashboard.
        </p>

        <Card className="mt-6 space-y-5">
          <div>
            <FieldLabel htmlFor="session-title">Session title</FieldLabel>
            <input
              id="session-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g., Super Bowl Blind Flight"
              maxLength={120}
              className={inputStyles()}
            />
          </div>

          <button
            type="button"
            role="switch"
            aria-checked={isBlind}
            onClick={() => setIsBlind((v) => !v)}
            className="flex w-full items-center gap-4 rounded-2xl border border-line bg-sunken px-4 py-3.5 text-left hover:border-line-strong"
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent">
              <EyeOff className="h-5 w-5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-semibold">Blind mode</span>
              <span className="block text-xs text-fg-muted">Bottle names stay hidden until the reveal</span>
            </span>
            <span
              aria-hidden
              className={cx(
                "relative h-7 w-12 shrink-0 rounded-full transition-colors",
                isBlind ? "bg-accent" : "bg-line-strong",
              )}
            >
              <span
                className={cx(
                  "absolute top-1 h-5 w-5 rounded-full bg-fg shadow transition-transform",
                  isBlind ? "translate-x-6" : "translate-x-1",
                )}
              />
            </span>
          </button>

          {error ? <Notice tone="danger">{error}</Notice> : null}

          <Button type="submit" variant="primary" size="lg" block disabled={busy}>
            {createdId ? (
              "Opening dashboard…"
            ) : busy ? (
              "Creating…"
            ) : (
              <>
                <GlassWater className="h-4 w-4" /> Create tasting
              </>
            )}
          </Button>
        </Card>

        <p className="mt-4 px-2 text-center text-xs text-fg-faint">
          You&apos;ll land on your private host dashboard next.
        </p>
      </form>
    </PageShell>
  );
}
