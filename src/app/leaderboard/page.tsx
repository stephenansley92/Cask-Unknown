import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";

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
  const supabase = createSupabaseServerClient();
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
    return (
      <main className="min-h-screen bg-zinc-900 p-4 text-white sm:p-6">
        <div className="mx-auto max-w-4xl rounded-3xl border border-zinc-700 bg-zinc-800 p-6 shadow-sm">
          <div className="text-sm text-zinc-400">Cask Unknown</div>
          <h1 className="mt-2 text-3xl font-extrabold tracking-tight">
            Community
          </h1>
          <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 px-4 py-4">
            <div className="font-semibold text-red-700">
              Could not load community
            </div>
            <div className="mt-1 text-sm text-red-600">{error.message}</div>
          </div>
        </div>
      </main>
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
  }).sort((a, b) => b.averageScore - a.averageScore);

  return (
    <main className="min-h-screen bg-zinc-900 p-4 text-white sm:p-6">
      <div className="mx-auto max-w-4xl">
        <div className="rounded-3xl border border-zinc-700 bg-zinc-800 p-5 shadow-sm md:p-6">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <div className="text-sm text-zinc-400">Cask Unknown</div>
              <h1 className="mt-2 text-3xl font-extrabold tracking-tight">
                Community
              </h1>
              <p className="mt-2 text-sm text-zinc-400">
                Public profiles only. Click a name to open that user&apos;s public profile.
              </p>
            </div>

            <Link
              href="/"
              className="inline-flex items-center justify-center rounded-2xl border border-zinc-700 px-4 py-3 text-sm font-semibold text-zinc-200 hover:bg-zinc-700 active:scale-95"
            >
              Back Home
            </Link>
          </div>

          {rows.length === 0 ? (
            <div className="mt-6 rounded-3xl border border-zinc-700 p-6 text-center">
              <div className="text-lg font-semibold">No public profiles yet</div>
              <div className="mt-2 text-sm text-zinc-400">
                Community members will appear here once they have a public profile.
              </div>
            </div>
          ) : (
            <div className="mt-6 space-y-3">
              {rows.map((row, idx) => {
                const rank = idx + 1;
                const medal = rank === 1 ? "🥇" : rank === 2 ? "🥈" : rank === 3 ? "🥉" : null;
                return (
                  <Link
                    key={row.userId}
                    href={`/leaderboard/${row.userId}`}
                    className="block rounded-2xl border border-zinc-700 bg-zinc-900 px-4 py-4 hover:bg-zinc-700 active:scale-[0.98] transition-all"
                  >
                    <div className="flex items-center gap-3 md:gap-4">
                      <div className="shrink-0 w-9 text-center">
                        {medal ? (
                          <span className="text-2xl leading-none">{medal}</span>
                        ) : (
                          <span className="text-sm font-bold text-zinc-400 tabular-nums">#{rank}</span>
                        )}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-white truncate">
                          {row.displayName}
                        </div>
                        <div className="mt-0.5 text-xs text-zinc-400">
                          {row.ratingCount} rating{row.ratingCount === 1 ? "" : "s"}
                        </div>
                      </div>

                      <div className="shrink-0 text-right">
                        <div className="text-2xl font-extrabold tabular-nums text-white">
                          {row.averageScore.toFixed(1)}
                        </div>
                        <div className="text-xs text-zinc-400">avg</div>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
