"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Sparkles, Users } from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { getMyPalate } from "@/lib/session-api";
import {
  buildPalateProfile,
  matchLabel,
  summarizeMatches,
  type PalateEntry,
  type PalateMatchRow,
} from "@/lib/palate/profile";
import { FlavorTagList } from "@/components/flavor-tags";
import { Card, Eyebrow } from "@/components/ui/card";

const MIN_ENTRIES = 3;

function Insight({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div className="rounded-2xl bg-sunken px-4 py-3">
      <div className="text-[11px] font-semibold text-fg-faint">{label}</div>
      <div className="mt-0.5 font-semibold leading-snug">{value}</div>
      {detail ? <div className="mt-0.5 text-xs text-fg-muted">{detail}</div> : null}
    </div>
  );
}

function scoringStyle(delta: number) {
  if (delta >= 2) return "Generous scorer";
  if (delta <= -2) return "Tough critic";
  return "Right with the table";
}

/**
 * "Your palate": sweet spots, scoring style, flavor fingerprint, and the
 * tasters whose scores track yours. Hidden until the reveal-night migration
 * provides get_my_palate().
 */
export function PalateSection() {
  const [data, setData] = useState<{ entries: PalateEntry[]; matches: PalateMatchRow[] } | null>(null);

  useEffect(() => {
    let cancelled = false;
    getMyPalate(createSupabaseBrowserClient()).then(({ data: palate, error }) => {
      if (!cancelled && !error && palate) setData(palate);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const profile = useMemo(() => (data ? buildPalateProfile(data.entries) : null), [data]);
  const matches = useMemo(() => (data ? summarizeMatches(data.matches) : null), [data]);

  if (!data || !profile || !matches) return null;

  if (profile.count < MIN_ENTRIES) {
    return (
      <Card className="flex items-start gap-3">
        <Sparkles className="mt-0.5 h-5 w-5 shrink-0 text-accent" />
        <div>
          <div className="font-semibold">Your palate profile</div>
          <p className="mt-0.5 text-sm text-fg-muted">
            Rate {MIN_ENTRIES - profile.count} more {MIN_ENTRIES - profile.count === 1 ? "pour" : "pours"} to see your
            proof sweet spot, favorite style, and who shares your taste.
          </p>
        </div>
      </Card>
    );
  }

  const insights = [
    profile.proofSweetSpot && {
      label: "Proof sweet spot",
      value: profile.proofSweetSpot.label,
      detail: `${profile.proofSweetSpot.average.toFixed(1)} avg over ${profile.proofSweetSpot.count} pours`,
    },
    profile.favoriteStyle && {
      label: "Go-to style",
      value: profile.favoriteStyle.label,
      detail: `${profile.favoriteStyle.average.toFixed(1)} avg over ${profile.favoriteStyle.count} pours`,
    },
    profile.favoriteDistillery && {
      label: "Favorite distillery",
      value: profile.favoriteDistillery.label,
      detail: `${profile.favoriteDistillery.average.toFixed(1)} avg over ${profile.favoriteDistillery.count} pours`,
    },
    profile.generosity && {
      label: "Scoring style",
      value: scoringStyle(profile.generosity.delta),
      detail: `${profile.generosity.delta >= 0 ? "+" : ""}${profile.generosity.delta.toFixed(1)} vs the table over ${profile.generosity.pours} blind pours`,
    },
    profile.strongestCategory && {
      label: "You reward",
      value: profile.strongestCategory.label,
      detail: `Scored ${Math.round(profile.strongestCategory.pct * 100)}% of max on average`,
    },
    profile.weakestCategory && {
      label: "Hardest to impress on",
      value: profile.weakestCategory.label,
      detail: `Scored ${Math.round(profile.weakestCategory.pct * 100)}% of max on average`,
    },
  ].filter(Boolean) as { label: string; value: string; detail?: string }[];

  const people = [
    matches.twin && { kind: "Taste twin", match: matches.twin },
    matches.opposite && matches.opposite.correlation < 0.2 && { kind: "Opposite palate", match: matches.opposite },
  ].filter(Boolean) as { kind: string; match: NonNullable<typeof matches.twin> }[];

  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-accent" />
        <Eyebrow>Your palate</Eyebrow>
      </div>

      {insights.length ? (
        <div className="grid grid-cols-2 gap-2">
          {insights.map((item) => (
            <Insight key={item.label} {...item} />
          ))}
        </div>
      ) : (
        <Card className="text-sm text-fg-muted">
          Link bottles to your ratings so we can spot your favorite proofs, styles, and distilleries.
        </Card>
      )}

      {profile.favoriteTags.length || profile.topTags.length ? (
        <Card padded={false} className="p-4">
          {profile.favoriteTags.length ? (
            <>
              <div className="text-[11px] font-semibold text-fg-faint">In your highest-rated pours</div>
              <FlavorTagList tags={profile.favoriteTags} className="mt-2" />
            </>
          ) : null}
          {profile.topTags.length ? (
            <>
              <div className="mt-3 text-[11px] font-semibold text-fg-faint">Flavors you tag most</div>
              <FlavorTagList tags={profile.topTags} className="mt-2" />
            </>
          ) : null}
        </Card>
      ) : null}

      {people.length ? (
        <Card padded={false}>
          <div className="flex items-center gap-2 px-4 pt-4">
            <Users className="h-4 w-4 text-accent" />
            <div className="text-[11px] font-semibold text-fg-faint">Across your blind tastings</div>
          </div>
          <ul className="mt-2">
            {people.map(({ kind, match }) => (
              <li key={kind} className="flex items-center justify-between gap-3 border-t border-line px-4 py-3">
                <div className="min-w-0">
                  <div className="text-xs text-fg-faint">{kind}</div>
                  <div className="truncate font-semibold">
                    {match.userId ? (
                      <Link href={`/leaderboard/${match.userId}`} className="hover:text-accent">
                        {match.name}
                      </Link>
                    ) : (
                      match.name
                    )}
                  </div>
                  <div className="text-xs text-fg-muted">
                    {matchLabel(match.correlation)} · {match.shared} shared pours
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <div className="font-display text-xl font-semibold tabular-nums">{match.pointsApart.toFixed(1)}</div>
                  <div className="text-[11px] text-fg-faint">pts apart</div>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </section>
  );
}
