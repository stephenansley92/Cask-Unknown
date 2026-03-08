import type { SupabaseClient } from "@supabase/supabase-js";

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
  sort_order?: number;
};

type ParticipantRow = {
  id: string;
  session_id: string;
  display_name: string;
  user_id?: string | null;
};

type ScoreRow = {
  id: string;
  session_id: string;
  pour_id: string;
  participant_id: string;
  nose: number | null;
  flavor: number | null;
  mouthfeel: number | null;
  complexity: number | null;
  balance: number | null;
  finish: number | null;
  uniqueness: number | null;
  drinkability: number | null;
  packaging: number | null;
  value: number | null;
  total: number;
  notes?: string | null;
  created_at?: string;
};

export const CATEGORY = [
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

export type ScoreCategoryKey = (typeof CATEGORY)[number]["key"];
export type SortKey = "recent" | "total" | ScoreCategoryKey;

export type HistoryRow = {
  id: string;
  sessionId: string;
  sessionTitle: string;
  pourLabel: string;
  total: number;
  notes: string;
  createdAt: string;
  byCat: Record<string, number | null>;
};

export type RateHistoryRow = {
  id: string;
  totalScore: number;
  notes: string;
  createdAt: string;
  whiskeyName: string;
  byCat: Record<string, number | null>;
};

export type PublicRateHistoryRecord = {
  id: string;
  userId: string;
  totalScore: number;
  notes: string;
  createdAt: string;
  whiskeyName: string;
  whiskeyDistillery: string;
  whiskeyProof: number | null;
  whiskeyAge: string;
  byCat: Record<string, number | null>;
};

type CategoryEntry = (typeof CATEGORY)[number];

function avg(nums: number[]) {
  if (!nums.length) return 0;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

export function formatDate(value?: string) {
  if (!value) return "Unknown date";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown date";
  return date.toLocaleDateString();
}

export function formatDateTime(value?: string) {
  if (!value) return "Unknown date";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown date";
  return date.toLocaleString();
}

function getTimestampMs(value?: string) {
  if (!value) return 0;
  const date = new Date(value);
  const time = date.getTime();
  return Number.isNaN(time) ? 0 : time;
}

function getDateOnlyKey(value?: string) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate()
  ).padStart(2, "0")}`;
}

function toNumberOrNull(value: unknown) {
  if (value === null || value === undefined) return null;
  const raw = typeof value === "string" ? value.trim() : value;
  if (raw === "") return null;

  const parsed = Number(raw);
  if (Number.isNaN(parsed)) return null;
  return parsed;
}

function isUuidLike(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    value
  );
}

function normalizeCategoryKey(value: string): ScoreCategoryKey | null {
  const key = value.trim().toLowerCase();
  if (!key) return null;

  if (CATEGORY.some((entry) => entry.key === key)) {
    return key as ScoreCategoryKey;
  }

  if (key === "palate") return "flavor";
  if (key === "taste") return "flavor";

  return null;
}

function normalizeScoreMap(value: unknown): Record<string, number | null> {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return {};

    try {
      return normalizeScoreMap(JSON.parse(trimmed));
    } catch {
      return {};
    }
  }

  if (Array.isArray(value)) {
    const map: Record<string, number | null> = {};
    for (const entry of value) {
      if (!entry || typeof entry !== "object") continue;

      const row = entry as Record<string, unknown>;
      const rawKey = row.item_id ?? row.itemId ?? row.id ?? row.key ?? row.item_key;
      const rawScore = row.score ?? row.value ?? row.points;
      if (typeof rawKey !== "string" || !rawKey.trim()) continue;

      map[rawKey.trim()] = toNumberOrNull(rawScore);
    }
    return map;
  }

  if (!value || typeof value !== "object") {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, rawValue]) => [
      key,
      toNumberOrNull(rawValue),
    ])
  );
}

function getWhiskeyName(
  whiskey: { name?: string } | { name?: string }[] | null | undefined
) {
  if (Array.isArray(whiskey)) {
    const name = whiskey[0]?.name;
    return typeof name === "string" && name.trim() ? name.trim() : "Unknown whiskey";
  }
  if (whiskey && typeof whiskey.name === "string" && whiskey.name.trim()) {
    return whiskey.name.trim();
  }
  return "Unknown whiskey";
}

function buildRateCategoryMapFromRow(row: Record<string, unknown>) {
  return CATEGORY.reduce((map, category) => {
    map[category.key] = toNumberOrNull(row[category.key]);
    return map;
  }, {} as Record<string, number | null>);
}

function mapPublicRateHistoryRecord(
  row: Record<string, unknown>
): PublicRateHistoryRecord {
  const whiskeyName =
    typeof row.whiskey_name === "string" && row.whiskey_name.trim()
      ? row.whiskey_name.trim()
      : "Unknown whiskey";
  const whiskeyDistillery =
    typeof row.whiskey_distillery === "string" ? row.whiskey_distillery.trim() : "";
  const whiskeyAge = typeof row.whiskey_age === "string" ? row.whiskey_age.trim() : "";

  return {
    id: typeof row.id === "string" ? row.id : "",
    userId: typeof row.user_id === "string" ? row.user_id : "",
    totalScore: Number(row.total_score ?? 0),
    notes: typeof row.notes === "string" ? row.notes.trim() : "",
    createdAt: typeof row.rated_at === "string" ? row.rated_at : "",
    whiskeyName,
    whiskeyDistillery,
    whiskeyProof: toNumberOrNull(row.whiskey_proof),
    whiskeyAge,
    byCat: buildRateCategoryMapFromRow(row),
  };
}

export async function loadPublicRateHistoryRecords(
  supabase: SupabaseClient,
  userId: string
) {
  const { data, error } = await supabase.rpc("get_public_rate_history", {
    p_user_id: userId,
  });

  if (error) throw error;

  return ((data || []) as Record<string, unknown>[]).map(mapPublicRateHistoryRecord);
}

export async function loadCanonicalPublicRateHistory(
  supabase: SupabaseClient,
  userId: string
) {
  const rows = await loadPublicRateHistoryRecords(supabase, userId);

  return rows.map((row) => ({
    id: row.id,
    totalScore: row.totalScore,
    notes: row.notes,
    createdAt: row.createdAt,
    whiskeyName: row.whiskeyName,
    byCat: row.byCat,
  })) as RateHistoryRow[];
}

export async function loadCanonicalProfileDisplayName(
  supabase: SupabaseClient,
  userId: string,
  fallbackDisplayName: string
) {
  const fallback = fallbackDisplayName.trim() || "Anonymous";
  const { data, error } = await supabase
    .from("user_profiles")
    .select("display_name")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    return fallback;
  }

  const displayName =
    data && typeof data === "object" && "display_name" in data
      ? (data.display_name as string | null)
      : null;

  return displayName?.trim() || fallback;
}

type LoadBlindHistoryOptions = {
  userId: string | null;
  profileName: string;
  ownerView: boolean;
};

export async function loadCanonicalBlindHistory(
  supabase: SupabaseClient,
  options: LoadBlindHistoryOptions
) {
  const profileName = options.profileName.trim();
  if (!profileName) {
    return [] as HistoryRow[];
  }

  let participants: ParticipantRow[] = [];

  if (!options.ownerView && options.userId) {
    const [
      { data: ownedParticipantsData, error: ownedParticipantsErr },
      { data: legacyParticipantsData, error: legacyParticipantsErr },
    ] = await Promise.all([
      supabase
        .from("participants")
        .select("id,session_id,display_name,user_id")
        .eq("user_id", options.userId),
      supabase
        .from("participants")
        .select("id,session_id,display_name,user_id")
        .eq("display_name", profileName)
        .is("user_id", null),
    ]);

    if (ownedParticipantsErr) throw ownedParticipantsErr;
    if (legacyParticipantsErr) throw legacyParticipantsErr;

    const participantMap = new Map<string, ParticipantRow>();
    for (const participant of [
      ...((ownedParticipantsData || []) as ParticipantRow[]),
      ...((legacyParticipantsData || []) as ParticipantRow[]),
    ]) {
      participantMap.set(participant.id, participant);
    }
    participants = [...participantMap.values()];
  } else {
    const { data: participantsData, error: participantsErr } = await supabase
      .from("participants")
      .select("id,session_id,display_name,user_id")
      .eq("display_name", profileName);

    if (participantsErr) throw participantsErr;

    participants = (participantsData || []) as ParticipantRow[];
  }

  if (!participants.length) {
    return [] as HistoryRow[];
  }

  const participantIds = participants.map((participant) => participant.id);

  const { data: scoresData, error: scoresErr } = await supabase
    .from("scores")
    .select(
      "id,session_id,pour_id,participant_id,nose,flavor,mouthfeel,complexity,balance,finish,uniqueness,drinkability,packaging,value,total,notes,created_at"
    )
    .in("participant_id", participantIds);

  if (scoresErr) throw scoresErr;

  const scores = (scoresData || []) as ScoreRow[];
  if (!scores.length) {
    return [] as HistoryRow[];
  }

  const sessionIds = [...new Set(scores.map((score) => score.session_id))];
  const pourIds = [...new Set(scores.map((score) => score.pour_id))];

  const [{ data: sessionsData, error: sessionsErr }, { data: poursData, error: poursErr }] =
    await Promise.all([
      supabase.from("sessions").select("id,title,is_blind,status").in("id", sessionIds),
      supabase
        .from("pours")
        .select("id,session_id,code,bottle_name,sort_order")
        .in("id", pourIds),
    ]);

  if (sessionsErr) throw sessionsErr;
  if (poursErr) throw poursErr;

  const sessions = (sessionsData || []) as SessionRow[];
  const pours = (poursData || []) as PourRow[];
  const sessionById = new Map(sessions.map((session) => [session.id, session]));
  const pourById = new Map(pours.map((pour) => [pour.id, pour]));

  return scores.map((score) => {
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

    const byCat: Record<string, number | null> = {};
    for (const category of CATEGORY) {
      byCat[category.key] = toNumberOrNull(score[category.key as ScoreCategoryKey]);
    }

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

export async function loadCanonicalRateHistory(
  supabase: SupabaseClient,
  userId: string
) {
  const withScoresJson = await supabase
    .from("ratings")
    .select("id,total_score,notes,rated_at,template_id,scores_json,whiskey:whiskeys(name)")
    .eq("user_id", userId)
    .order("rated_at", { ascending: false });

  let ratingsData = withScoresJson.data as Record<string, unknown>[] | null;
  let scoreColumnKey: "scores_json" | "scores" = "scores_json";

  if (withScoresJson.error) {
    const withScores = await supabase
      .from("ratings")
      .select("id,total_score,notes,rated_at,template_id,scores,whiskey:whiskeys(name)")
      .eq("user_id", userId)
      .order("rated_at", { ascending: false });

    if (withScores.error) throw withScores.error;

    ratingsData = withScores.data as Record<string, unknown>[] | null;
    scoreColumnKey = "scores";
  }

  const rawRows = ((ratingsData || []) as Record<string, unknown>[]).map((row) => {
    const whiskey = row.whiskey as
      | { name?: string }
      | { name?: string }[]
      | null
      | undefined;

    return {
      id: row.id as string,
      totalScore: Number(row.total_score ?? 0),
      notes: typeof row.notes === "string" ? row.notes.trim() : "",
      createdAt: (row.rated_at as string) || "",
      whiskeyName: getWhiskeyName(whiskey),
      templateId: (row.template_id as string) || "",
      scoreMap: normalizeScoreMap(row[scoreColumnKey]),
    };
  });

  const templateIds = [...new Set(rawRows.map((row) => row.templateId).filter(Boolean))];
  let templateItemKeyById = new Map<string, string>();

  if (templateIds.length > 0) {
    const { data: templateItemsData, error: templateItemsErr } = await supabase
      .from("template_items")
      .select("id,template_id,item_key")
      .in("template_id", templateIds)
      .order("sort_order", { ascending: true });

    if (templateItemsErr) throw templateItemsErr;

    templateItemKeyById = new Map(
      ((templateItemsData || []) as Record<string, unknown>[]).map((item) => [
        item.id as string,
        item.item_key as string,
      ])
    );
  }

  const unresolvedTemplateItemIds = [
    ...new Set(
      rawRows
        .flatMap((row) => Object.keys(row.scoreMap))
        .map((key) => key.trim())
        .filter(
          (key) =>
            key.length > 0 &&
            !templateItemKeyById.has(key) &&
            isUuidLike(key)
        )
    ),
  ];

  if (unresolvedTemplateItemIds.length > 0) {
    const { data: templateItemsByIdData, error: templateItemsByIdErr } = await supabase
      .from("template_items")
      .select("id,item_key")
      .in("id", unresolvedTemplateItemIds);

    if (templateItemsByIdErr) throw templateItemsByIdErr;

    for (const item of (templateItemsByIdData || []) as Record<string, unknown>[]) {
      const id = (item.id as string) || "";
      const itemKey = (item.item_key as string) || "";
      if (id && itemKey && !templateItemKeyById.has(id)) {
        templateItemKeyById.set(id, itemKey);
      }
    }
  }

  return rawRows.map((row) => {
    const byCat = Object.fromEntries(
      CATEGORY.map((category) => [category.key, null])
    ) as Record<string, number | null>;

    for (const [itemId, score] of Object.entries(row.scoreMap)) {
      const itemKey = templateItemKeyById.get(itemId) || itemId;
      const categoryKey = normalizeCategoryKey(itemKey);
      if (!categoryKey) continue;
      if (score === null) continue;

      byCat[categoryKey] = score;
    }

    return {
      id: row.id,
      totalScore: row.totalScore,
      notes: row.notes,
      createdAt: row.createdAt,
      whiskeyName: row.whiskeyName,
      byCat,
    };
  }) as RateHistoryRow[];
}

type BuildProfileHistoryViewOptions = {
  blindHistory: HistoryRow[];
  rateHistory: RateHistoryRow[];
  sortKey: SortKey;
};

type ProfileHistoryView = {
  combinedHistory: HistoryRow[];
  sortedHistory: HistoryRow[];
  activeSortCategory: CategoryEntry | null;
  categoryAverages: Record<ScoreCategoryKey, number>;
  overallAverage: number;
  topFive: HistoryRow[];
  bottomFive: HistoryRow[];
  ratedCount: number;
  sessionCount: number;
};

export function buildCanonicalProfileHistoryView(
  options: BuildProfileHistoryViewOptions
): ProfileHistoryView {
  const combinedHistory: HistoryRow[] = [
    ...options.blindHistory,
    ...options.rateHistory.map((row) => ({
      id: row.id,
      sessionId: `rate:${row.id}`,
      sessionTitle: "Rate Mode",
      pourLabel: row.whiskeyName,
      total: row.totalScore,
      notes: row.notes,
      createdAt: row.createdAt,
      byCat: row.byCat,
    })),
  ];

  const sortedHistory = [...combinedHistory].sort((a, b) => {
    if (options.sortKey === "recent") {
      const aDay = getDateOnlyKey(a.createdAt);
      const bDay = getDateOnlyKey(b.createdAt);
      if (bDay !== aDay) return bDay.localeCompare(aDay);
      if (b.total !== a.total) return b.total - a.total;
      const aTime = getTimestampMs(a.createdAt);
      const bTime = getTimestampMs(b.createdAt);
      if (bTime !== aTime) return bTime - aTime;
      return b.total - a.total;
    }

    const aValue =
      options.sortKey === "total"
        ? a.total
        : typeof a.byCat[options.sortKey] === "number"
          ? (a.byCat[options.sortKey] as number)
          : Number.NEGATIVE_INFINITY;
    const bValue =
      options.sortKey === "total"
        ? b.total
        : typeof b.byCat[options.sortKey] === "number"
          ? (b.byCat[options.sortKey] as number)
          : Number.NEGATIVE_INFINITY;

    if (bValue !== aValue) return bValue - aValue;
    const aTime = getTimestampMs(a.createdAt);
    const bTime = getTimestampMs(b.createdAt);
    if (bTime !== aTime) return bTime - aTime;
    return b.total - a.total;
  });

  const activeSortCategory =
    options.sortKey === "recent" || options.sortKey === "total"
      ? null
      : CATEGORY.find((category) => category.key === options.sortKey) || null;

  const categoryAverages = CATEGORY.reduce((map, category) => {
    map[category.key] = avg(
      combinedHistory
        .map((row) => row.byCat[category.key])
        .filter((value): value is number => typeof value === "number")
    );
    return map;
  }, {} as Record<ScoreCategoryKey, number>);

  const overallAverage = avg(combinedHistory.map((row) => row.total));
  const topFive = [...combinedHistory].sort((a, b) => b.total - a.total).slice(0, 5);
  const bottomFive = [...combinedHistory].sort((a, b) => a.total - b.total).slice(0, 5);
  const ratedCount = combinedHistory.length;
  const sessionCount =
    new Set(options.blindHistory.map((row) => row.sessionId)).size +
    (options.rateHistory.length > 0 ? 1 : 0);

  return {
    combinedHistory,
    sortedHistory,
    activeSortCategory,
    categoryAverages,
    overallAverage,
    topFive,
    bottomFive,
    ratedCount,
    sessionCount,
  };
}
