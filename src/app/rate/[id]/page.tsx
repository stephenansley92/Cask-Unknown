import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type WhiskeyInfo = {
  name: string;
  distillery: string | null;
  proof: number | null;
  age: string | number | null;
};

type RatingRecord = {
  id: string;
  total_score: number;
  notes: string | null;
  rated_at: string;
  template_id: string;
  scoreMap: Record<string, number>;
  whiskey: WhiskeyInfo | WhiskeyInfo[] | null;
};

type TemplateItem = {
  id: string;
  itemKey: string;
  label: string;
  maxPoints: number;
};

function formatRatedAt(value?: string) {
  if (!value) return "Unknown date";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown date";
  return date.toLocaleString();
}

function getWhiskeyInfo(whiskey: RatingRecord["whiskey"]) {
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

async function loadRating(
  supabase: ReturnType<typeof createSupabaseServerClient>,
  ratingId: string
) {
  const withScoresJson = await supabase
    .from("ratings")
    .select(
      "id,total_score,notes,rated_at,template_id,scores_json,whiskey:whiskeys(name,distillery,proof,age)"
    )
    .eq("id", ratingId)
    .maybeSingle();

  if (!withScoresJson.error && withScoresJson.data) {
    return {
      id: withScoresJson.data.id as string,
      total_score: Number(withScoresJson.data.total_score ?? 0),
      notes: (withScoresJson.data.notes as string | null) ?? null,
      rated_at: (withScoresJson.data.rated_at as string) || "",
      template_id: withScoresJson.data.template_id as string,
      scoreMap: normalizeScoreMap(withScoresJson.data.scores_json),
      whiskey: (withScoresJson.data.whiskey as RatingRecord["whiskey"]) ?? null,
    } satisfies RatingRecord;
  }

  const withScores = await supabase
    .from("ratings")
    .select(
      "id,total_score,notes,rated_at,template_id,scores,whiskey:whiskeys(name,distillery,proof,age)"
    )
    .eq("id", ratingId)
    .maybeSingle();

  if (!withScores.error && withScores.data) {
    return {
      id: withScores.data.id as string,
      total_score: Number(withScores.data.total_score ?? 0),
      notes: (withScores.data.notes as string | null) ?? null,
      rated_at: (withScores.data.rated_at as string) || "",
      template_id: withScores.data.template_id as string,
      scoreMap: normalizeScoreMap(withScores.data.scores),
      whiskey: (withScores.data.whiskey as RatingRecord["whiskey"]) ?? null,
    } satisfies RatingRecord;
  }

  const withScoresJsonNoAge = await supabase
    .from("ratings")
    .select(
      "id,total_score,notes,rated_at,template_id,scores_json,whiskey:whiskeys(name,distillery,proof)"
    )
    .eq("id", ratingId)
    .maybeSingle();

  if (!withScoresJsonNoAge.error && withScoresJsonNoAge.data) {
    return {
      id: withScoresJsonNoAge.data.id as string,
      total_score: Number(withScoresJsonNoAge.data.total_score ?? 0),
      notes: (withScoresJsonNoAge.data.notes as string | null) ?? null,
      rated_at: (withScoresJsonNoAge.data.rated_at as string) || "",
      template_id: withScoresJsonNoAge.data.template_id as string,
      scoreMap: normalizeScoreMap(withScoresJsonNoAge.data.scores_json),
      whiskey: (withScoresJsonNoAge.data.whiskey as RatingRecord["whiskey"]) ?? null,
    } satisfies RatingRecord;
  }

  const withoutAge = await supabase
    .from("ratings")
    .select(
      "id,total_score,notes,rated_at,template_id,scores,whiskey:whiskeys(name,distillery,proof)"
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
    total_score: Number(withoutAge.data.total_score ?? 0),
    notes: (withoutAge.data.notes as string | null) ?? null,
    rated_at: (withoutAge.data.rated_at as string) || "",
    template_id: withoutAge.data.template_id as string,
    scoreMap: normalizeScoreMap(withoutAge.data.scores),
    whiskey: (withoutAge.data.whiskey as RatingRecord["whiskey"]) ?? null,
  } satisfies RatingRecord;
}

async function loadTemplateItems(
  supabase: ReturnType<typeof createSupabaseServerClient>,
  templateId: string
) {
  const withMaxPoints = await supabase
    .from("template_items")
    .select("id,item_key,label,max_points,sort_order")
    .eq("template_id", templateId)
    .order("sort_order", { ascending: true });

  if (!withMaxPoints.error) {
    return ((withMaxPoints.data || []) as Record<string, unknown>[]).map(
      (item) => ({
        id: item.id as string,
        itemKey: item.item_key as string,
        label: item.label as string,
        maxPoints: Number(item.max_points ?? 0),
      })
    ) satisfies TemplateItem[];
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
    (item) => ({
      id: item.id as string,
      itemKey: item.item_key as string,
      label: item.label as string,
      maxPoints: Number(item.max_score ?? 0),
    })
  ) satisfies TemplateItem[];
}

type RateDetailPageProps = {
  params: {
    id: string;
  };
};

export default async function RateDetailPage({ params }: RateDetailPageProps) {
  const ratingId = params?.id;
  if (!ratingId) {
    notFound();
  }

  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/login?redirectTo=${encodeURIComponent(`/rate/${ratingId}`)}`);
  }

  const rating = await loadRating(supabase, ratingId);
  if (!rating) {
    notFound();
  }

  const templateItems = await loadTemplateItems(supabase, rating.template_id);
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

  return (
    <main className="min-h-screen bg-[#F8F8F6] text-zinc-900 p-4 sm:p-6">
      <div className="max-w-4xl mx-auto">
        <div className="bg-white border border-zinc-200 rounded-3xl p-5 md:p-6 shadow-sm">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap items-center gap-3">
              <Link
                href="/profile"
                className="inline-flex items-center justify-center rounded-2xl px-4 py-2 font-semibold bg-zinc-900 text-white hover:bg-zinc-800"
              >
                Back to Profile
              </Link>
              <Link
                href="/rate"
                className="inline-flex items-center justify-center rounded-2xl px-4 py-2 font-semibold border border-zinc-200 bg-white text-zinc-900 hover:bg-zinc-50"
              >
                Rate Mode
              </Link>
            </div>
            <div className="text-sm text-zinc-500">Rating Detail</div>
          </div>

          <div className="mt-6 rounded-3xl border border-zinc-200 bg-[#F8F8F6] px-5 py-5">
            <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
              <div>
                <div className="text-sm text-zinc-500">Whiskey</div>
                <h1 className="text-3xl font-extrabold tracking-tight mt-2">
                  {whiskey.name}
                </h1>
                {whiskeyMeta.length ? (
                  <div className="mt-2 text-sm text-zinc-500">
                    {whiskeyMeta.join(" • ")}
                  </div>
                ) : null}
                <div className="mt-2 text-sm text-zinc-500">
                  Rated {formatRatedAt(rating.rated_at)}
                </div>
              </div>

              <div className="text-right">
                <div className="text-xs text-zinc-500">Total score</div>
                <div className="text-4xl font-extrabold tabular-nums mt-1">
                  {Number(rating.total_score ?? 0).toFixed(1)}
                </div>
              </div>
            </div>

            {rating.notes ? (
              <div className="mt-5 rounded-2xl border border-zinc-200 bg-white px-4 py-4">
                <div className="text-sm font-semibold text-zinc-800">Notes</div>
                <div className="mt-2 text-sm text-zinc-600">{rating.notes}</div>
              </div>
            ) : null}
          </div>

          <div className="mt-6">
            <div className="text-sm font-semibold text-zinc-800">
              Category Breakdown
            </div>

            {templateItems.length === 0 ? (
              <div className="mt-4 rounded-3xl border border-zinc-200 px-6 py-8 text-center">
                <div className="text-lg font-semibold">No template items found</div>
                <div className="mt-2 text-sm text-zinc-500">
                  This rating does not have a readable scoring breakdown.
                </div>
              </div>
            ) : (
              <div className="mt-4 space-y-3">
                {templateItems.map((item) => {
                  const score = Number(rating.scoreMap[item.id] ?? 0);

                  return (
                    <div
                      key={item.id}
                      className="rounded-2xl bg-[#F8F8F6] border border-zinc-200 px-4 py-4"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <div className="font-semibold">{item.label}</div>
                          <div className="text-xs text-zinc-500 mt-1">
                            {item.itemKey}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-2xl font-extrabold tabular-nums">
                            {score}
                          </div>
                          <div className="text-xs text-zinc-500">
                            {score} / {item.maxPoints}
                          </div>
                        </div>
                      </div>
                    </div>
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
