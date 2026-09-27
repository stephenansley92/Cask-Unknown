import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { logEvent, newCorrelationId, userFacingError } from "@/lib/log";
import { ChevronRight } from "lucide-react";
import { buttonStyles } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Wordmark } from "@/components/ui/brand";
import { cx } from "@/components/ui/cx";
import { Notice } from "@/components/ui/notice";
import { PageShell } from "@/components/ui/page";
import { TabBar } from "@/components/ui/tab-bar";

type PublicProfileRow = {
  user_id: string;
  display_name: string | null;
};

type ParticipantRow = {
  id: string;
  display_name: string;
  user_id: string | null;
};

type ScoreRow = {
  participant_id: string;
  total: number | null;
};

type PublicRateSummaryRow = {
  display_name: string | null;
  user_id: string;
  rating_count: number | string | null;
  avg_total_score: number | string | null;
};

function toNumber(value: number | string | null | undefined) {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isNaN(parsed) ? 0 : parsed;
  }
  return 0;
}

export default async function LeaderboardPage() {
  const supabase = await createSupabaseServerClient();
  const [
    { data, error },
    { data: publicRateSummaryData, error: publicRateSummaryError },
  ] = await Promise.all([
    supabase
      .from("public_profiles")
      .select("user_id,display_name")
      .eq("is_public", true)
      .order("display_name", { ascending: true }),
    supabase.rpc("get_public_leaderboard"),
  ]);

  if (error) {
    const ref = newCorrelationId();
    logEvent("error", "community.load_failed", { ref, code: error.code, message: error.message });
    return (
      <PageShell width="md" bottomInset>
        <TabBar />
        <Wordmark />
        <h1 className="mt-6 font-display text-3xl font-semibold tracking-tight">Community</h1>
        <Notice tone="danger" title="The community board didn't load" className="mt-6">
          {userFacingError("Try again in a moment.", ref)}
        </Notice>
        <Link href="/" className={buttonStyles({ variant: "secondary", className: "mt-4" })}>
          Back home
        </Link>
      </PageShell>
    );
  }

  if (publicRateSummaryError) {
    throw publicRateSummaryError;
  }

  const profiles = (data || []) as PublicProfileRow[];
  const profileDisplayNameByUserId = new Map(
    profiles.map((profile) => [
      profile.user_id,
      profile.display_name?.trim() || "Anonymous",
    ])
  );
  const displayNames = [...new Set([...profileDisplayNameByUserId.values()])];
  const userIds = profiles.map((profile) => profile.user_id);
  const knownUserIds = new Set(userIds);
  const userIdsByDisplayName = displayNames.reduce((map, name) => {
    const matchingUserIds = profiles
      .filter((profile) => (profile.display_name?.trim() || "Anonymous") === name)
      .map((profile) => profile.user_id);
    map.set(name, matchingUserIds);
    return map;
  }, new Map<string, string[]>());

  let participants: ParticipantRow[] = [];

  if (userIds.length > 0 || displayNames.length > 0) {
    const [
      { data: ownedParticipantsData, error: ownedParticipantsError },
      { data: legacyParticipantsData, error: legacyParticipantsError },
    ] = await Promise.all([
      userIds.length > 0
        ? supabase
            .from("participants")
            .select("id,display_name,user_id")
            .in("user_id", userIds)
        : Promise.resolve({ data: [], error: null }),
      displayNames.length > 0
        ? supabase
            .from("participants")
            .select("id,display_name,user_id")
            .is("user_id", null)
            .in("display_name", displayNames)
        : Promise.resolve({ data: [], error: null }),
    ]);

    if (ownedParticipantsError) {
      throw ownedParticipantsError;
    }

    if (legacyParticipantsError) {
      throw legacyParticipantsError;
    }

    const participantMap = new Map<string, ParticipantRow>();
    for (const participant of [
      ...((ownedParticipantsData || []) as ParticipantRow[]),
      ...((legacyParticipantsData || []) as ParticipantRow[]),
    ]) {
      participantMap.set(participant.id, participant);
    }
    participants = [...participantMap.values()];
  }

  const participantUserIdByParticipantId = new Map<string, string>();
  for (const participant of participants) {
    if (participant.user_id && knownUserIds.has(participant.user_id)) {
      participantUserIdByParticipantId.set(participant.id, participant.user_id);
      continue;
    }

    const matchingUserIds = userIdsByDisplayName.get(participant.display_name) || [];
    if (matchingUserIds.length === 1) {
      participantUserIdByParticipantId.set(participant.id, matchingUserIds[0]);
    }
  }

  const participantIds = [...participantUserIdByParticipantId.keys()];
  let scoreTotalsByParticipantId = new Map<string, number[]>();

  if (participantIds.length > 0) {
    const { data: scoresData, error: scoresError } = await supabase
      .from("scores")
      .select("participant_id,total")
      .in("participant_id", participantIds);

    if (scoresError) {
      throw scoresError;
    }

    scoreTotalsByParticipantId = ((scoresData || []) as ScoreRow[]).reduce(
      (map, score) => {
        const existing = map.get(score.participant_id) || [];
        existing.push(Number(score.total ?? 0));
        map.set(score.participant_id, existing);
        return map;
      },
      new Map<string, number[]>()
    );
  }

  const publicRateSummaryByUserId = new Map(
    ((publicRateSummaryData || []) as PublicRateSummaryRow[]).map((row) => [
      row.user_id,
      {
        ratingCount: toNumber(row.rating_count),
        averageScore: toNumber(row.avg_total_score),
      },
    ])
  );

  const rows = profiles.map((row) => {
    const displayName = row.display_name?.trim() || "Anonymous";
    const participantIdsForUser = [...participantUserIdByParticipantId.entries()]
      .filter(([, userId]) => userId === row.user_id)
      .map(([participantId]) => participantId);
    const totals = participantIdsForUser.flatMap(
      (participantId) => scoreTotalsByParticipantId.get(participantId) || []
    );
    const blindCount = totals.length;
    const blindTotal = totals.reduce((sum, value) => sum + value, 0);
    const rateSummary = publicRateSummaryByUserId.get(row.user_id) || {
      ratingCount: 0,
      averageScore: 0,
    };
    const rateCount = rateSummary.ratingCount;
    const rateTotal = rateSummary.averageScore * rateCount;
    const visibleCount = blindCount + rateCount;
    const visibleAverage =
      visibleCount > 0 ? (blindTotal + rateTotal) / visibleCount : 0;

    return {
      userId: row.user_id,
      displayName,
      ratingCount: visibleCount,
      averageScore: visibleAverage,
    };
  }).sort((a, b) => b.ratingCount - a.ratingCount);

  return (
    <PageShell width="md" bottomInset>
      <TabBar />
      <div className="animate-fade-slide-in">
        <header className="flex items-center justify-between">
          <Wordmark />
        </header>

        <h1 className="mt-8 font-display text-3xl font-semibold tracking-tight">Community</h1>
        <p className="mt-1 text-sm text-fg-muted">
          Tasters with public profiles, ranked by how many pours they&apos;ve scored.
        </p>

        {rows.length === 0 ? (
          <Card className="mt-6 text-center">
            <div className="font-semibold">No public profiles yet</div>
            <p className="mt-1 text-sm text-fg-muted">
              Community members will appear here once they make their profile public.
            </p>
          </Card>
        ) : (
          <ol className="mt-6 overflow-hidden rounded-3xl border border-line bg-surface">
            {rows.map((row, idx) => {
              const rank = idx + 1;
              const podium = rank <= 3;
              return (
                <li key={row.userId} className="border-b border-line last:border-b-0">
                  <Link
                    href={`/leaderboard/${row.userId}`}
                    className="flex items-center gap-3 px-4 py-3.5 hover:bg-raised"
                  >
                    <span
                      className={cx(
                        "w-7 shrink-0 text-center font-display font-semibold tabular-nums",
                        podium ? "text-lg text-accent" : "text-sm text-fg-faint",
                      )}
                      aria-label={`Rank ${rank}`}
                    >
                      {rank}
                    </span>
                    <span
                      aria-hidden
                      className={cx(
                        "flex h-10 w-10 shrink-0 items-center justify-center rounded-full font-display font-semibold",
                        podium ? "bg-accent-soft text-accent" : "bg-raised text-fg-muted",
                      )}
                    >
                      {row.displayName.charAt(0).toUpperCase()}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold">{row.displayName}</span>
                      <span className="block text-xs text-fg-faint">
                        {row.ratingCount} rating{row.ratingCount === 1 ? "" : "s"}
                      </span>
                    </span>
                    <span className="shrink-0 text-right">
                      <span className="block font-display text-2xl font-semibold tabular-nums">
                        {row.ratingCount ? row.averageScore.toFixed(1) : "–"}
                      </span>
                      <span className="block text-[11px] text-fg-faint">avg</span>
                    </span>
                    <ChevronRight className="h-4 w-4 shrink-0 text-fg-faint" />
                  </Link>
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </PageShell>
  );
}
