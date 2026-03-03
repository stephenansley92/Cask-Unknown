import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type PublicProfileRow = {
  user_id: string;
  display_name: string | null;
};

type ParticipantRow = {
  id: string;
  display_name: string;
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

function avg(nums: number[]) {
  if (!nums.length) return 0;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
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
      <main className="min-h-screen bg-[#F8F8F6] p-4 text-zinc-900 sm:p-6">
        <div className="mx-auto max-w-4xl rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm">
          <div className="text-sm text-zinc-500">Cask Unknown</div>
          <h1 className="mt-2 text-3xl font-extrabold tracking-tight">
            Users
          </h1>
          <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 px-4 py-4">
            <div className="font-semibold text-red-700">
              Could not load users
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
  const displayNames = [...new Set(
    profiles
      .map((profile) => profile.display_name?.trim() || "Anonymous")
      .filter(Boolean)
  )];

  let participantsByDisplayName = new Map<string, ParticipantRow[]>();
  let scoreTotalsByParticipantId = new Map<string, number[]>();

  if (displayNames.length > 0) {
    const { data: participantsData, error: participantsError } = await supabase
      .from("participants")
      .select("id,display_name")
      .in("display_name", displayNames);

    if (participantsError) {
      throw participantsError;
    }

    const participants = (participantsData || []) as ParticipantRow[];

    participantsByDisplayName = participants.reduce((map, participant) => {
      const key = participant.display_name;
      const existing = map.get(key) || [];
      existing.push(participant);
      map.set(key, existing);
      return map;
    }, new Map<string, ParticipantRow[]>());

    const participantIds = participants.map((participant) => participant.id);

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
    const participants = participantsByDisplayName.get(displayName) || [];
    const totals = participants.flatMap(
      (participant) => scoreTotalsByParticipantId.get(participant.id) || []
    );
    const blindCount = totals.length;
    const blindAverage = avg(totals);
    const rateSummary = publicRateSummaryByUserId.get(row.user_id) || {
      ratingCount: 0,
      averageScore: 0,
    };
    const visibleCount = blindCount > 0 ? blindCount : rateSummary.ratingCount;
    const visibleAverage = blindCount > 0 ? blindAverage : rateSummary.averageScore;

    return {
      userId: row.user_id,
      displayName,
      ratingCount: visibleCount,
      averageScore: visibleAverage,
    };
  });

  return (
    <main className="min-h-screen bg-[#F8F8F6] p-4 text-zinc-900 sm:p-6">
      <div className="mx-auto max-w-4xl">
        <div className="rounded-3xl border border-zinc-200 bg-white p-5 shadow-sm md:p-6">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <div className="text-sm text-zinc-500">Cask Unknown</div>
              <h1 className="mt-2 text-3xl font-extrabold tracking-tight">
                Users
              </h1>
              <p className="mt-2 text-sm text-zinc-500">
                Public profiles only. Click a name to open that user&apos;s public profile.
              </p>
            </div>

            <Link
              href="/"
              className="inline-flex items-center justify-center rounded-2xl border border-zinc-200 px-4 py-3 text-sm font-semibold text-zinc-900 hover:bg-zinc-50"
            >
              Back Home
            </Link>
          </div>

          {rows.length === 0 ? (
            <div className="mt-6 rounded-3xl border border-zinc-200 p-6 text-center">
              <div className="text-lg font-semibold">No public profiles yet</div>
              <div className="mt-2 text-sm text-zinc-500">
                Public users will appear here once they have a public profile.
              </div>
            </div>
          ) : (
            <div className="mt-6 space-y-3">
              {rows.map((row) => (
                <Link
                  key={row.userId}
                  href={`/leaderboard/${row.userId}`}
                  className="block rounded-2xl border border-zinc-200 bg-[#F8F8F6] px-4 py-4 hover:bg-zinc-50"
                >
                  <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div>
                      <div>
                        <div className="font-semibold text-zinc-900 hover:underline">
                          {row.displayName}
                        </div>
                        <div className="mt-1 text-xs text-zinc-500">
                          {row.ratingCount} total rating
                          {row.ratingCount === 1 ? "" : "s"}
                        </div>
                      </div>
                    </div>

                    <div className="text-right">
                      <div className="text-xs text-zinc-500">Average score</div>
                      <div className="text-2xl font-extrabold tabular-nums text-zinc-900">
                        {row.averageScore.toFixed(1)}
                      </div>
                      <div className="mt-1 text-xs font-semibold text-zinc-600">
                        View profile
                      </div>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
