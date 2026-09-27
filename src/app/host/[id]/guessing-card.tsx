"use client";

import { useEffect, useState } from "react";
import { DollarSign, Gauge, Target } from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { Card, Eyebrow } from "@/components/ui/card";
import { Notice } from "@/components/ui/notice";
import { SwitchRow } from "@/components/ui/switch";
import {
  getSessionGuessing,
  hostSetGuessing,
  type GuessingSettings,
} from "@/lib/session-api";

type GuessingCardProps = {
  sessionId: string;
  hostKey: string;
  isBlind: boolean;
  isRevealed: boolean;
  onSaved?: (message: string) => void;
};

/**
 * Host switches for the guessing game. Renders nothing until the
 * reveal-night migration is applied (the settings lookup fails before then).
 */
export function GuessingCard({ sessionId, hostKey, isBlind, isRevealed, onSaved }: GuessingCardProps) {
  const [settings, setSettings] = useState<GuessingSettings | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    getSessionGuessing(createSupabaseBrowserClient(), sessionId).then(({ data, error: loadError }) => {
      if (!cancelled && !loadError && data) setSettings(data);
    });
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  if (!settings) return null;

  const update = async (patch: Partial<GuessingSettings>) => {
    const previous = settings;
    setSettings({ ...settings, ...patch });
    setSaving(true);
    setError("");
    // Hosts are authorized by their signed-in account, so use the cookie client.
    const { data, error: saveError } = await hostSetGuessing(createSupabaseBrowserClient(), sessionId, patch, hostKey);
    setSaving(false);
    if (saveError || !data) {
      setSettings(previous);
      setError(saveError?.message || "Couldn't update the guessing game.");
      return;
    }
    setSettings(data);
    onSaved?.("Guessing game updated.");
  };

  const locked = saving || isRevealed;

  return (
    <Card className="mt-4">
      <div className="flex items-start gap-3">
        <Target className="mt-0.5 h-5 w-5 shrink-0 text-accent" />
        <div>
          <Eyebrow>Guessing game</Eyebrow>
          <p className="mt-1 text-sm text-fg-muted">
            Tasters guess each pour on their phone. The best guesser is crowned at the reveal.
          </p>
        </div>
      </div>

      <div className="mt-4 space-y-2">
        <SwitchRow
          checked={settings.bottles}
          onChange={(bottles) => void update({ bottles })}
          disabled={locked || !isBlind}
          icon={<Target className="h-5 w-5" />}
          label="Guess the bottle"
          description={
            isBlind
              ? "Tasters see the lineup in alphabetical order and match each glass. 3 points each."
              : "Only for blind tastings, where bottle names are hidden."
          }
        />
        <SwitchRow
          checked={settings.proof}
          onChange={(proof) => void update({ proof })}
          disabled={locked}
          icon={<Gauge className="h-5 w-5" />}
          label="Guess the proof"
          description="Within 2 proof scores 2 points, within 5 scores 1."
        />
        <SwitchRow
          checked={settings.price}
          onChange={(price) => void update({ price })}
          disabled={locked}
          icon={<DollarSign className="h-5 w-5" />}
          label="Guess the price"
          description="Within 10% of retail scores 2 points, within 25% scores 1."
        />
      </div>

      <p className="mt-3 text-xs text-fg-faint">
        {isRevealed
          ? "Guessing closed at the big reveal."
          : "Proof and price are scored against the bottle linked to each pour, so link bottles with those details filled in."}
      </p>

      {error ? (
        <Notice tone="danger" className="mt-3" onDismiss={() => setError("")}>
          {error}
        </Notice>
      ) : null}
    </Card>
  );
}
