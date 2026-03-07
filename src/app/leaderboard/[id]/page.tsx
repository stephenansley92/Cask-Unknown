import Link from "next/link";
import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type PublicProfileRow = {
  user_id: string;
  display_name: string | null;
  is_public: boolean;
};

type ParticipantRow = {
  id: string;
  session_id: string;
  display_name: string;
  user_id: string | null;
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
  created_at?: string;
};

type SessionRow = {
  id: string;
  title: string;
  is_blind: boolean;
  status: string;
};

type PourRow = {
  id: string;
  session_id: string;
  code: string;
  bottle_name: string | null;
};

type HistoryRow = {
  id: string;
  sessionId: string;
  sessionTitle: string;
  pourLabel: string;
  total: number;
  notes: string;
  createdAt: string;
  byCat: Record<string, number>;
};

type PublicRateSummaryRow = {
  display_name: string | null;
  user_id: string;
  rating_count: number | string | null;
  avg_total_score: number | string | null;
};

const CATEGORY = [
  { key: "nose", label: "Nose", max: 10 },
  { key: "flavor", label: "Palate", max: 20 },
  { key: "mouthfeel", label: "Mouthfeel", max: 10 },
  { key: "complexity", label: "Complexity", max: 10 },
  { key: "balance", label: "Balance", max: 10 },
  { key: "finish", label: "Finish", max: 10 },
  { key: "uniqueness", label: "Uniqueness", max: 10 },
  { key: "drinkability", label: "Drinkability", max: 10 },
  { key: "packaging", label: "Packaging", max: 5 },
  { key: "value", label: "Value", max: 5 },
] as const;

type ScoreCategoryKey = (typeof CATEGORY)[number]["key"];
type SortKey = "total" | ScoreCategoryKey;

function avg(nums: number[]) {
  if (!nums.length) return 0;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function formatDate(value?: string) {
  if (!value) return "Unknown date";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown date";
  return date.toLocaleDateString();
}

function formatDateTime(value?: string) {
  if (!value) return "Unknown date";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown date";
  return date.toLocaleString();
}

function toNumber(value: number | string | null | undefined) {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isNaN(parsed) ? 0 : parsed;
  }
  return 0;
}

type PublicUserProfilePageProps = {
  params: {
    id: string;
  };
  searchParams?: {
    sort?: string;
  };
};

export default async function PublicUserProfilePage({
  params,
  searchParams,
}: PublicUserProfilePageProps) {
  const supabase = createSupabaseServerClient();
  const requestedSortKey =
    typeof searchParams?.sort === "string" ? searchParams.sort : "total";
  const validSortKeys = new Set<string>([
    "total",
    ...CATEGORY.map((category) => category.key),
  ]);
  const sortKey = (validSortKeys.has(requestedSortKey)
    ? requestedSortKey
    : "total") as SortKey;

  const { data: publicProfileData, error: publicProfileError } = await supabase
    .from("public_profiles")
    .select("user_id,display_name,is_public")
    .eq("user_id", params.id)
    .maybeSingle();

  if (publicProfileError) {
    throw publicProfileError;
  }

  const publicProfile = publicProfileData as PublicProfileRow | null;

  if (!publicProfile || !publicProfile.is_public) {
    notFound();
  }

  const displayName = publicProfile.display_name?.trim() || "Anonymous";
  const { data: publicRateSummaryData, error: publicRateSummaryError } =
    await supabase.rpc("get_public_leaderboard");

  if (publicRateSummaryError) {
    throw publicRateSummaryError;
  }

  const publicRateSummary = ((publicRateSummaryData || []) as PublicRateSummaryRow[]).find(
    (row) => row.user_id === params.id
  );
  const rateModeRatingCount = toNumber(publicRateSummary?.rating_count);
  const rateModeAverage = toNumber(publicRateSummary?.avg_total_score);

  const [
    { data: ownedParticipantsData, error: ownedParticipantsError },
    { data: legacyParticipantsData, error: legacyParticipantsError },
  ] = await Promise.all([
    supabase
      .from("participants")
      .select("id,session_id,display_name,user_id")
      .eq("user_id", params.id),
    supabase
      .from("participants")
      .select("id,session_id,display_name,user_id")
      .eq("display_name", displayName)
      .is("user_id", null),
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

  const participants = [...participantMap.values()];

  let history: HistoryRow[] = [];

  if (participants.length > 0) {
    const participantIds = participants.map((participant) => participant.id);

    const { data: scoresData, error: scoresError } = await supabase
      .from("scores")
      .select(
        "id,session_id,pour_id,participant_id,nose,flavor,mouthfeel,complexity,balance,finish,uniqueness,drinkability,packaging,value,total,notes,created_at"
      )
      .in("participant_id", participantIds);

    if (scoresError) {
      throw scoresError;
    }

    const scores = (scoresData || []) as ScoreRow[];

    if (scores.length > 0) {
      const sessionIds = [...new Set(scores.map((score) => score.session_id))];
      const pourIds = [...new Set(scores.map((score) => score.pour_id))];

      const [
        { data: sessionsData, error: sessionsError },
        { data: poursData, error: poursError },
      ] = await Promise.all([
        supabase
          .from("sessions")
          .select("id,title,is_blind,status")
          .in("id", sessionIds),
        supabase.from("pours").select("id,session_id,code,bottle_name").in("id", pourIds),
      ]);

      if (sessionsError) {
        throw sessionsError;
      }

      if (poursError) {
        throw poursError;
      }

      const sessions = (sessionsData || []) as SessionRow[];
      const pours = (poursData || []) as PourRow[];
      const sessionById = new Map(sessions.map((session) => [session.id, session]));
      const pourById = new Map(pours.map((pour) => [pour.id, pour]));

      history = scores.map((score) => {
        const session = sessionById.get(score.session_id);
        const pour = pourById.get(score.pour_id);
        const revealLocked = Boolean(
          session?.is_blind && (session.status || "").toLowerCase() !== "revealed"
        );

        let pourLabel = session?.title || "Unknown Pour";
        if (pour) {
          pourLabel = revealLocked
            ? `${session?.title || "Session"} - Pour ${pour.code}`
            : pour.bottle_name || `${session?.title || "Session"} - Pour ${pour.code}`;
        }

        const byCat = Object.fromEntries(
          CATEGORY.map((category) => [
            category.key,
            Number(score[category.key as ScoreCategoryKey] ?? 0),
          ])
        ) as Record<string, number>;

        return {
          id: score.id,
          sessionId: score.session_id,
          sessionTitle: session?.title || "Unknown Session",
          pourLabel,
          total: Number(score.total ?? 0),
          notes: (score.notes || "").trim(),
          createdAt: score.created_at || "",
          byCat,
        };
      });
    }
  }

  let rateHistory: HistoryRow[] = [];
  const { data: ratingsData, error: ratingsError } = await supabase
    .from("ratings")
    .select("id,total_score,notes,rated_at")
    .eq("user_id", params.id)
    .order("rated_at", { ascending: false })
    .limit(25);

  if (!ratingsError) {
    rateHistory = ((ratingsData || []) as Record<string, unknown>[]).map((row) => ({
      id: row.id as string,
      sessionId: `rate:${row.id as string}`,
      sessionTitle: "Rate Mode",
      pourLabel: "Rate Mode Entry",
      total: Number(row.total_score ?? 0),
      notes: typeof row.notes === "string" ? row.notes.trim() : "",
      createdAt: (row.rated_at as string) || "",
      byCat: Object.fromEntries(
        CATEGORY.map((category) => [category.key, 0])
      ) as Record<string, number>,
    }));
  }

  if (rateModeRatingCount > 0 && rateHistory.length === 0) {
    rateHistory = [
      {
        id: `rate-summary-${params.id}`,
        sessionId: `rate-summary:${params.id}`,
        sessionTitle: "Rate Mode",
        pourLabel: "Rate Mode Summary",
        total: rateModeAverage,
        notes: `${rateModeRatingCount} total Rate Mode rating${
          rateModeRatingCount === 1 ? "" : "s"
        }`,
        createdAt: "",
        byCat: Object.fromEntries(
          CATEGORY.map((category) => [category.key, 0])
        ) as Record<string, number>,
      },
    ];
  }

  const blindRatedCount = history.length;
  const blindTotal = history.reduce((sum, row) => sum + row.total, 0);
  const summaryRatedCount = blindRatedCount + rateModeRatingCount;
  const summaryAverage =
    summaryRatedCount > 0
      ? (blindTotal + rateModeAverage * rateModeRatingCount) / summaryRatedCount
      : 0;
  const sessionCount =
    new Set(history.map((row) => row.sessionId)).size +
    (rateModeRatingCount > 0 ? 1 : 0);
  const rankableHistory = [...history, ...rateHistory].filter(
    (row) => !row.sessionId.startsWith("rate-summary:")
  );
  const topFive = [...rankableHistory].sort((a, b) => b.total - a.total).slice(0, 5);
  const bottomFive = [...rankableHistory].sort((a, b) => a.total - b.total).slice(0, 5);
  const categoryAverages = Object.fromEntries(
    CATEGORY.map((category) => [
      category.key,
      avg(history.map((row) => row.byCat[category.key] ?? 0)),
    ])
  ) as Record<string, number>;
  const sortedHistory = [...history, ...rateHistory].sort((a, b) => {
    const aValue = sortKey === "total" ? a.total : a.byCat[sortKey] ?? 0;
    const bValue = sortKey === "total" ? b.total : b.byCat[sortKey] ?? 0;

    if (bValue !== aValue) return bValue - aValue;
    return b.total - a.total;
  });

  return (
    <main className="min-h-screen bg-[#F8F8F6] p-4 text-zinc-900 sm:p-6">
      <div className="mx-auto max-w-6xl">
        <div className="rounded-3xl border border-zinc-200 bg-white p-5 shadow-sm md:p-6">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <div className="text-sm text-zinc-500">Public user</div>
              <h1 className="mt-2 text-3xl font-extrabold tracking-tight">
                {displayName}
              </h1>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row">
              <Link
                href="/leaderboard"
                className="inline-flex items-center justify-center rounded-2xl border border-zinc-200 px-4 py-3 text-sm font-semibold text-zinc-900 hover:bg-zinc-50"
              >
                Back to Users
              </Link>
              <Link
                href="/"
                className="inline-flex items-center justify-center rounded-2xl border border-zinc-200 px-4 py-3 text-sm font-semibold text-zinc-900 hover:bg-zinc-50"
              >
                Home
              </Link>
            </div>
          </div>

          <div className="mt-4 text-sm text-zinc-500">
            Active profile:{" "}
            <span className="font-semibold text-zinc-900">{displayName}</span>
          </div>
          <div className="mt-2 text-xs text-zinc-500">
            This name comes from the user&apos;s public profile and is used as their
            blind tasting identity.
          </div>

          {history.length === 0 && rateModeRatingCount === 0 ? (
            <div className="mt-6 rounded-3xl border border-zinc-200 p-6 text-center">
              <div className="text-lg font-semibold">No public history yet</div>
              <div className="mt-2 text-sm text-zinc-500">
                This user has not logged any visible blind or Rate Mode history under this public profile yet.
              </div>
            </div>
          ) : (
            <>
              <div className="mt-6 grid grid-cols-1 gap-3 md:grid-cols-3">
                <div className="rounded-2xl border border-zinc-200 bg-[#F8F8F6] px-4 py-3">
                  <div className="text-xs text-zinc-500">Overall Avg</div>
                  <div className="text-2xl font-extrabold tabular-nums">
                    {summaryAverage.toFixed(1)}
                  </div>
                </div>
                <div className="rounded-2xl border border-zinc-200 bg-[#F8F8F6] px-4 py-3">
                  <div className="text-xs text-zinc-500">Rated Pours</div>
                  <div className="text-2xl font-extrabold tabular-nums">
                    {summaryRatedCount}
                  </div>
                </div>
                <div className="rounded-2xl border border-zinc-200 bg-[#F8F8F6] px-4 py-3">
                  <div className="text-xs text-zinc-500">Sessions</div>
                  <div className="text-2xl font-extrabold tabular-nums">
                    {sessionCount}
                  </div>
                </div>
              </div>

              {rateModeRatingCount > 0 ? (
                <div className="mt-4 rounded-2xl border border-zinc-200 bg-[#F8F8F6] px-4 py-4 text-sm text-zinc-600">
                  Rate Mode: {rateModeRatingCount} rating
                  {rateModeRatingCount === 1 ? "" : "s"} averaging{" "}
                  <span className="font-semibold text-zinc-900">
                    {rateModeAverage.toFixed(1)}
                  </span>
                  .
                </div>
              ) : null}

              {rankableHistory.length > 0 ? (
                <>
                  <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
                    <div className="rounded-3xl border border-zinc-200 p-5">
                      <div className="text-sm text-zinc-500">Top 5 Highest Rated</div>
                      <div className="mt-4 space-y-3">
                        {topFive.map((row) => (
                          <div
                            key={`top-${row.id}`}
                            className="flex items-center justify-between gap-3 rounded-2xl border border-zinc-200 bg-[#F8F8F6] px-4 py-3"
                          >
                            <div>
                              <div className="font-semibold">{row.pourLabel}</div>
                              <div className="text-xs text-zinc-500">
                                {row.sessionTitle}
                              </div>
                            </div>
                            <div className="text-xl font-extrabold tabular-nums">
                              {row.total.toFixed(0)}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="rounded-3xl border border-zinc-200 p-5">
                      <div className="text-sm text-zinc-500">Bottom 5 Lowest Rated</div>
                      <div className="mt-4 space-y-3">
                        {bottomFive.map((row) => (
                          <div
                            key={`bottom-${row.id}`}
                            className="flex items-center justify-between gap-3 rounded-2xl border border-zinc-200 bg-[#F8F8F6] px-4 py-3"
                          >
                            <div>
                              <div className="font-semibold">{row.pourLabel}</div>
                              <div className="text-xs text-zinc-500">
                                {row.sessionTitle}
                              </div>
                            </div>
                            <div className="text-xl font-extrabold tabular-nums">
                              {row.total.toFixed(0)}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  {history.length > 0 ? (
                    <div className="mt-6 rounded-3xl border border-zinc-200 p-5">
                      <div className="text-sm text-zinc-500">Personal Averages By Category</div>
                      <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-5">
                        {CATEGORY.map((category) => (
                          <div
                            key={category.key}
                            className="rounded-2xl border border-zinc-200 bg-[#F8F8F6] px-4 py-3"
                          >
                            <div className="text-xs text-zinc-500">
                              {category.label}
                            </div>
                            <div className="text-2xl font-extrabold tabular-nums">
                              {categoryAverages[category.key].toFixed(1)}
                              <span className="text-xs font-semibold text-zinc-400">
                                /{category.max}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </>
              ) : null}
            </>
          )}

          <div className="mt-8 rounded-3xl border border-zinc-200 p-5">
            <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
              <div>
                <div className="text-sm text-zinc-500">All Ratings</div>
                <div className="mt-2 text-3xl font-extrabold tracking-tight">
                  Complete Rating History
                </div>
                <div className="mt-1 text-xs text-zinc-500">
                  Blind and Rate Mode entries, sorted by the metric you choose.
                </div>
              </div>

              <form
                method="get"
                className="flex flex-col gap-3 sm:flex-row sm:items-center"
              >
                <label className="text-sm font-semibold text-zinc-800">
                  Sort by{" "}
                  <select
                    name="sort"
                    defaultValue={sortKey}
                    className="ml-2 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                  >
                    <option value="total">Overall Rating</option>
                    {CATEGORY.map((category) => (
                      <option key={category.key} value={category.key}>
                        {category.label}
                      </option>
                    ))}
                  </select>
                </label>

                <button
                  type="submit"
                  className="inline-flex items-center justify-center rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm font-semibold text-zinc-900 hover:bg-zinc-50"
                >
                  Apply
                </button>
              </form>
            </div>

            {sortedHistory.length === 0 ? (
              <div className="mt-6 rounded-3xl border border-zinc-200 p-6 text-center">
                <div className="text-lg font-semibold">No ratings yet</div>
                <div className="mt-2 text-sm text-zinc-500">
                  This public user does not have any visible blind or Rate Mode history yet.
                </div>
              </div>
            ) : (
              <div className="mt-6 space-y-3">
                {sortedHistory.map((row) => {
                  const isRateMode = row.sessionId.startsWith("rate:");
                  const isRateSummary = row.sessionId.startsWith("rate-summary:");
                  const returnTo = encodeURIComponent(`/leaderboard/${params.id}`);
                  const detailHref = `/history/${isRateMode ? "rate" : "blind"}/${row.id}?owner=${encodeURIComponent(params.id)}&returnTo=${returnTo}`;

                  const cardContent = (
                    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                      <div>
                        <div className="font-semibold">{row.pourLabel}</div>
                        <div className="mt-1 text-xs text-zinc-500">
                          {row.sessionTitle} - Rated{" "}
                          {isRateMode
                            ? formatDateTime(row.createdAt)
                            : formatDate(row.createdAt)}
                        </div>
                        {row.notes ? (
                          <div className="mt-2 text-sm text-zinc-600">
                            <span className="font-semibold text-zinc-800">
                              Notes:
                            </span>{" "}
                            {row.notes}
                          </div>
                        ) : null}
                      </div>

                      <div className="text-right">
                        <div className="text-2xl font-extrabold tabular-nums">
                          {isRateMode
                            ? row.total.toFixed(1)
                            : row.total.toFixed(0)}
                        </div>
                        <div className="text-xs text-zinc-500">Overall / 100</div>
                      </div>
                    </div>
                  );

                  return (
                    isRateSummary ? (
                      <div
                        key={`${row.sessionId}-${row.id}`}
                        className="rounded-2xl border border-zinc-200 bg-[#F8F8F6] px-4 py-4"
                      >
                        {cardContent}
                      </div>
                    ) : (
                      <Link
                        key={`${row.sessionId}-${row.id}`}
                        href={detailHref}
                        className="block rounded-2xl border border-zinc-200 bg-[#F8F8F6] px-4 py-4 hover:bg-zinc-50 focus:outline-none focus:ring-2 focus:ring-zinc-900/10"
                      >
                        {cardContent}
                      </Link>
                    )
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
