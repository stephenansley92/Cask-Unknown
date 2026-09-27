import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { loadPublicRateHistoryRecords } from "@/lib/profile-history/read-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { safeInternalPath } from "@/lib/redirects";
import { ChevronLeft } from "lucide-react";
import { buttonStyles } from "@/components/ui/button";
import { Card, Eyebrow } from "@/components/ui/card";
import { Wordmark } from "@/components/ui/brand";
import { Notice } from "@/components/ui/notice";
import { PageShell } from "@/components/ui/page";
import DeleteEntryForm from "./delete-entry-form";

type HistoryMode = "blind" | "rate";

type WhiskeyInfo = {
  name: string;
  distillery: string | null;
  proof: number | null;
  age: string | number | null;
};

type RateRecord = {
  id: string;
  userId: string;
  totalScore: number;
  notes: string | null;
  ratedAt: string;
  templateId: string;
  scoreMap: Record<string, number>;
  whiskey: WhiskeyInfo | WhiskeyInfo[] | null;
};

type TemplateItem = {
  id: string;
  itemKey: string;
  label: string;
  maxPoints: number;
};

type ScoreRecord = {
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
  notes: string | null;
  created_at: string;
};

type SessionRecord = {
  id: string;
  title: string;
  is_blind: boolean;
  status: string;
};

type PourRecord = {
  id: string;
  code: string;
  bottle_name: string | null;
};

type ParticipantRecord = {
  id: string;
  user_id: string | null;
  display_name: string;
};

type CategoryBreakdownItem = {
  id: string;
  itemKey: string;
  label: string;
  maxPoints: number;
  score: number;
};

const BLIND_CATEGORY = [
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

function getSingleQueryValue(
  value: string | string[] | undefined
): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value[0] || "";
  return "";
}

function normalizeMode(value: string): HistoryMode | null {
  if (value === "blind" || value === "rate") return value;
  return null;
}

function normalizeOwner(value: string) {
  return value.trim();
}

function normalizeReturnTo(value: string, fallback: string) {
  return safeInternalPath(value, fallback);
}

function formatRatedAt(value?: string) {
  if (!value) return "Unknown date";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown date";
  return date.toLocaleString();
}

function normalizeScoreMap(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {} as Record<string, number>;
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, rawValue]) => [
      key,
      Number(rawValue ?? 0),
    ])
  );
}

function getWhiskeyInfo(whiskey: RateRecord["whiskey"]) {
  if (!whiskey) {
    return {
      name: "Unknown whiskey",
      distillery: null,
      proof: null,
      age: null,
    };
  }

  if (Array.isArray(whiskey)) {
    return (
      whiskey[0] || {
        name: "Unknown whiskey",
        distillery: null,
        proof: null,
        age: null,
      }
    );
  }

  return whiskey;
}

async function loadRateRecord(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  ratingId: string
) {
  const withScoresJson = await supabase
    .from("ratings")
    .select(
      "id,user_id,total_score,notes,rated_at,template_id,scores_json,whiskey:whiskeys(name,distillery,proof,age)"
    )
    .eq("id", ratingId)
    .maybeSingle();

  if (!withScoresJson.error && withScoresJson.data) {
    return {
      id: withScoresJson.data.id as string,
      userId: withScoresJson.data.user_id as string,
      totalScore: Number(withScoresJson.data.total_score ?? 0),
      notes: (withScoresJson.data.notes as string | null) ?? null,
      ratedAt: (withScoresJson.data.rated_at as string) || "",
      templateId: (withScoresJson.data.template_id as string) || "",
      scoreMap: normalizeScoreMap(withScoresJson.data.scores_json),
      whiskey: (withScoresJson.data.whiskey as RateRecord["whiskey"]) ?? null,
    } satisfies RateRecord;
  }

  const withScores = await supabase
    .from("ratings")
    .select(
      "id,user_id,total_score,notes,rated_at,template_id,scores,whiskey:whiskeys(name,distillery,proof,age)"
    )
    .eq("id", ratingId)
    .maybeSingle();

  if (!withScores.error && withScores.data) {
    return {
      id: withScores.data.id as string,
      userId: withScores.data.user_id as string,
      totalScore: Number(withScores.data.total_score ?? 0),
      notes: (withScores.data.notes as string | null) ?? null,
      ratedAt: (withScores.data.rated_at as string) || "",
      templateId: (withScores.data.template_id as string) || "",
      scoreMap: normalizeScoreMap(withScores.data.scores),
      whiskey: (withScores.data.whiskey as RateRecord["whiskey"]) ?? null,
    } satisfies RateRecord;
  }

  const withScoresJsonNoAge = await supabase
    .from("ratings")
    .select(
      "id,user_id,total_score,notes,rated_at,template_id,scores_json,whiskey:whiskeys(name,distillery,proof)"
    )
    .eq("id", ratingId)
    .maybeSingle();

  if (!withScoresJsonNoAge.error && withScoresJsonNoAge.data) {
    return {
      id: withScoresJsonNoAge.data.id as string,
      userId: withScoresJsonNoAge.data.user_id as string,
      totalScore: Number(withScoresJsonNoAge.data.total_score ?? 0),
      notes: (withScoresJsonNoAge.data.notes as string | null) ?? null,
      ratedAt: (withScoresJsonNoAge.data.rated_at as string) || "",
      templateId: (withScoresJsonNoAge.data.template_id as string) || "",
      scoreMap: normalizeScoreMap(withScoresJsonNoAge.data.scores_json),
      whiskey: (withScoresJsonNoAge.data.whiskey as RateRecord["whiskey"]) ?? null,
    } satisfies RateRecord;
  }

  const withoutAge = await supabase
    .from("ratings")
    .select(
      "id,user_id,total_score,notes,rated_at,template_id,scores,whiskey:whiskeys(name,distillery,proof)"
    )
    .eq("id", ratingId)
    .maybeSingle();

  if (withoutAge.error) {
    throw withoutAge.error;
  }

  if (!withoutAge.data) {
    return null;
  }

  return {
    id: withoutAge.data.id as string,
    userId: withoutAge.data.user_id as string,
    totalScore: Number(withoutAge.data.total_score ?? 0),
    notes: (withoutAge.data.notes as string | null) ?? null,
    ratedAt: (withoutAge.data.rated_at as string) || "",
    templateId: (withoutAge.data.template_id as string) || "",
    scoreMap: normalizeScoreMap(withoutAge.data.scores),
    whiskey: (withoutAge.data.whiskey as RateRecord["whiskey"]) ?? null,
  } satisfies RateRecord;
}

async function loadTemplateItems(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  templateId: string
) {
  const withMaxPoints = await supabase
    .from("template_items")
    .select("id,item_key,label,max_points,sort_order")
    .eq("template_id", templateId)
    .order("sort_order", { ascending: true });

  if (!withMaxPoints.error) {
    return ((withMaxPoints.data || []) as Record<string, unknown>[]).map(
      (item) =>
        ({
          id: item.id as string,
          itemKey: item.item_key as string,
          label: item.label as string,
          maxPoints: Number(item.max_points ?? 0),
        }) satisfies TemplateItem
    );
  }

  const withMaxScore = await supabase
    .from("template_items")
    .select("id,item_key,label,max_score,sort_order")
    .eq("template_id", templateId)
    .order("sort_order", { ascending: true });

  if (withMaxScore.error) {
    throw withMaxScore.error;
  }

  return ((withMaxScore.data || []) as Record<string, unknown>[]).map(
    (item) =>
      ({
        id: item.id as string,
        itemKey: item.item_key as string,
        label: item.label as string,
        maxPoints: Number(item.max_score ?? 0),
      }) satisfies TemplateItem
  );
}

async function loadBlindRecord(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  scoreId: string
) {
  const { data: scoreData, error: scoreError } = await supabase
    .from("scores")
    .select(
      "id,session_id,pour_id,participant_id,nose,flavor,mouthfeel,complexity,balance,finish,uniqueness,drinkability,packaging,value,total,notes,created_at"
    )
    .eq("id", scoreId)
    .maybeSingle();

  if (scoreError) {
    throw scoreError;
  }

  if (!scoreData) {
    return null;
  }

  const score = scoreData as unknown as ScoreRecord;

  const [
    { data: sessionData, error: sessionError },
    { data: pourData, error: pourError },
    { data: participantData, error: participantError },
  ] = await Promise.all([
    supabase
      .from("sessions")
      .select("id,title,is_blind,status")
      .eq("id", score.session_id)
      .maybeSingle(),
    supabase
      .from("pours")
      .select("id,code,bottle_name")
      .eq("id", score.pour_id)
      .maybeSingle(),
    supabase
      .from("participants")
      .select("id,user_id,display_name")
      .eq("id", score.participant_id)
      .maybeSingle(),
  ]);

  if (sessionError) throw sessionError;
  if (pourError) throw pourError;
  if (participantError) throw participantError;

  const session = (sessionData as SessionRecord | null) || null;
  const pour = (pourData as PourRecord | null) || null;
  const participant = (participantData as ParticipantRecord | null) || null;
  const revealLocked = Boolean(
    session?.is_blind && (session.status || "").toLowerCase() !== "revealed"
  );

  let pourLabel = session?.title || "Unknown Pour";
  if (pour) {
    pourLabel = revealLocked
      ? `${session?.title || "Session"} - Pour ${pour.code}`
      : pour.bottle_name || `${session?.title || "Session"} - Pour ${pour.code}`;
  }

  const breakdownItems = BLIND_CATEGORY.map((category) => ({
    id: category.key,
    itemKey: category.key,
    label: category.label,
    maxPoints: category.max,
    score: Number(score[category.key] ?? 0),
  })) satisfies CategoryBreakdownItem[];

  return {
    id: score.id,
    totalScore: Number(score.total ?? 0),
    notes: (score.notes || "").trim(),
    ratedAt: score.created_at || "",
    sessionTitle: session?.title || "Unknown Session",
    pourLabel,
    participantDisplayName: participant?.display_name?.trim() || "",
    ownerUserId: participant?.user_id || null,
    breakdownItems,
  };
}

async function canViewPublicProfile(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  ownerUserId: string,
  expectedDisplayName?: string
) {
  const { data, error } = await supabase
    .from("public_profiles")
    .select("display_name,is_public")
    .eq("user_id", ownerUserId)
    .maybeSingle();

  if (error || !data || !data.is_public) {
    return false;
  }

  if (!expectedDisplayName) return true;

  return (data.display_name?.trim() || "") === expectedDisplayName.trim();
}

type HistoryDetailPageProps = {
  params: Promise<{
    mode: string;
    id: string;
  }>;
  searchParams?: Promise<{
    owner?: string | string[];
    returnTo?: string | string[];
    message?: string | string[];
  }>;
};

export default async function HistoryDetailPage({
  params,
  searchParams,
}: HistoryDetailPageProps) {
  const [resolvedParams, resolvedSearchParams] = await Promise.all([
    params,
    searchParams,
  ]);
  const mode = normalizeMode(resolvedParams?.mode || "");
  const entryId = resolvedParams?.id || "";

  if (!mode || !entryId) {
    notFound();
  }

  const requestedOwner = normalizeOwner(
    getSingleQueryValue(resolvedSearchParams?.owner)
  );
  const returnTo = normalizeReturnTo(
    getSingleQueryValue(resolvedSearchParams?.returnTo),
    "/profile"
  );
  const message = getSingleQueryValue(resolvedSearchParams?.message);

  const query = new URLSearchParams();
  if (requestedOwner) query.set("owner", requestedOwner);
  query.set("returnTo", returnTo);
  const redirectTo = `/history/${mode}/${entryId}?${query.toString()}`;

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/login?redirectTo=${encodeURIComponent(redirectTo)}`);
  }

  let title = "";
  let subtitle = "";
  let detailsLine = "";
  let totalScore = 0;
  let notes = "";
  let categoryItems: CategoryBreakdownItem[] = [];
  let canDelete = false;

  if (mode === "rate") {
    const shouldUsePublicRatePath = Boolean(requestedOwner && requestedOwner !== user.id);
    if (shouldUsePublicRatePath) {
      const publicRateRows = await loadPublicRateHistoryRecords(
        supabase,
        requestedOwner
      );
      const publicRating = publicRateRows.find((row) => row.id === entryId) || null;

      if (!publicRating || publicRating.userId !== requestedOwner) {
        notFound();
      }

      const whiskeyMeta = [
        publicRating.whiskeyDistillery || null,
        publicRating.whiskeyProof !== null && publicRating.whiskeyProof !== undefined
          ? `${Number(publicRating.whiskeyProof)} proof`
          : null,
        publicRating.whiskeyAge ? `${publicRating.whiskeyAge} age` : null,
      ].filter(Boolean);

      title = publicRating.whiskeyName;
      subtitle = "Rate Mode";
      detailsLine = [
        whiskeyMeta.length ? whiskeyMeta.join(" · ") : "",
        `Rated ${formatRatedAt(publicRating.createdAt)}`,
      ]
        .filter(Boolean)
        .join(" · ");
      totalScore = Number(publicRating.totalScore ?? 0);
      notes = publicRating.notes;
      categoryItems = BLIND_CATEGORY.map((category) => ({
        id: category.key,
        itemKey: category.key,
        label: category.label,
        maxPoints: category.max,
        score: Number(publicRating.byCat[category.key] ?? 0),
      }));
      canDelete = false;
    } else {
      const rating = await loadRateRecord(supabase, entryId);
      if (!rating) {
        notFound();
      }

      const ownerUserId = rating.userId;
      if (requestedOwner && requestedOwner !== ownerUserId) {
        notFound();
      }

      const ownerView = ownerUserId === user.id;
      if (!ownerView) {
        const publicAllowed = await canViewPublicProfile(supabase, ownerUserId);
        if (!publicAllowed) {
          notFound();
        }
      }

      const templateItems = await loadTemplateItems(supabase, rating.templateId);
      categoryItems = templateItems.map((item) => ({
        id: item.id,
        itemKey: item.itemKey,
        label: item.label,
        maxPoints: item.maxPoints,
        score: Number(rating.scoreMap[item.id] ?? 0),
      }));

      const whiskey = getWhiskeyInfo(rating.whiskey);
      const whiskeyMeta = [
        whiskey.distillery || null,
        whiskey.proof !== null && whiskey.proof !== undefined
          ? `${Number(whiskey.proof)} proof`
          : null,
        whiskey.age !== null && whiskey.age !== undefined && String(whiskey.age).trim()
          ? `${String(whiskey.age).trim()} age`
          : null,
      ].filter(Boolean);

      title = whiskey.name;
      subtitle = "Rate Mode";
      detailsLine = [
        whiskeyMeta.length ? whiskeyMeta.join(" · ") : "",
        `Rated ${formatRatedAt(rating.ratedAt)}`,
      ]
        .filter(Boolean)
        .join(" · ");
      totalScore = Number(rating.totalScore ?? 0);
      notes = (rating.notes || "").trim();
      canDelete = ownerView;
    }
  } else {
    const score = await loadBlindRecord(supabase, entryId);
    if (!score) {
      notFound();
    }

    if (score.ownerUserId) {
      if (requestedOwner && requestedOwner !== score.ownerUserId) {
        notFound();
      }

      const ownerView = score.ownerUserId === user.id;
      if (!ownerView) {
        const publicAllowed = await canViewPublicProfile(
          supabase,
          score.ownerUserId
        );
        if (!publicAllowed) {
          notFound();
        }
      }

      canDelete = ownerView;
    } else {
      if (!requestedOwner) {
        notFound();
      }

      const ownerView = requestedOwner === user.id;
      if (!ownerView) {
        const publicAllowed = await canViewPublicProfile(
          supabase,
          requestedOwner,
          score.participantDisplayName
        );
        if (!publicAllowed) {
          notFound();
        }
      }

      canDelete = false;
    }

    title = score.pourLabel;
    subtitle = score.sessionTitle;
    detailsLine = `Rated ${formatRatedAt(score.ratedAt)}`;
    totalScore = Number(score.totalScore ?? 0);
    notes = score.notes;
    categoryItems = score.breakdownItems;
  }

  return (
    <PageShell>
      <header className="flex items-center justify-between">
        <Link href={returnTo} className={buttonStyles({ variant: "ghost", size: "sm", className: "-ml-3" })}>
          <ChevronLeft className="h-4 w-4" /> Back
        </Link>
        {canDelete ? (
          <DeleteEntryForm
            mode={mode}
            entryId={entryId}
            returnTo={returnTo}
          />
        ) : (
          <Wordmark />
        )}
      </header>

      {message ? <Notice className="mt-4">{message}</Notice> : null}

      <div className="mt-6 animate-fade-slide-in">
        <Eyebrow>{subtitle}</Eyebrow>
        <div className="mt-2 flex items-start justify-between gap-4">
          <h1 className="min-w-0 font-display text-3xl font-semibold tracking-tight">{title}</h1>
          <div className="shrink-0 text-right">
            <div className="font-display text-5xl font-semibold leading-none tabular-nums text-accent">
              {totalScore.toFixed(1)}
            </div>
            <div className="mt-1 text-[11px] font-semibold text-fg-faint">of 100</div>
          </div>
        </div>
        <p className="mt-2 text-sm text-fg-muted">{detailsLine}</p>

        {notes ? (
          <Card className="mt-6">
            <Eyebrow>Tasting notes</Eyebrow>
            <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-fg">{notes}</p>
          </Card>
        ) : null}

        <Card padded={false} className="mt-3 p-4">
          <Eyebrow>Category breakdown</Eyebrow>

          {categoryItems.length === 0 ? (
            <p className="mt-3 text-sm text-fg-muted">
              This rating does not have a readable scoring breakdown.
            </p>
          ) : (
            <ul className="mt-3 space-y-3">
              {categoryItems.map((item) => {
                const pct = item.maxPoints > 0 ? Math.min(100, (item.score / item.maxPoints) * 100) : 0;
                return (
                  <li key={item.id}>
                    <div className="flex items-baseline justify-between gap-3 text-sm">
                      <span className="text-fg-muted">{item.label}</span>
                      <span className="tabular-nums">
                        <span className="font-semibold">{item.score}</span>
                        <span className="text-xs text-fg-faint">/{item.maxPoints}</span>
                      </span>
                    </div>
                    <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-line" aria-hidden>
                      <div className="h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>
    </PageShell>
  );
}
