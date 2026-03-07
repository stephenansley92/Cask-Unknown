import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type RatingRow = {
  id: string;
  total_score: number;
  notes: string | null;
  rated_at: string;
  whiskey: { name: string } | { name: string }[] | null;
};

function formatRatedAt(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown date";
  return date.toLocaleString();
}

function getWhiskeyName(whiskey: RatingRow["whiskey"]) {
  if (!whiskey) return "Unknown whiskey";
  if (Array.isArray(whiskey)) return whiskey[0]?.name || "Unknown whiskey";
  return whiskey.name || "Unknown whiskey";
}

type RatePageProps = {
  searchParams?: {
    saved?: string;
  };
};

export default async function RatePage({ searchParams }: RatePageProps) {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?redirectTo=%2Frate");
  }

  const { data, error } = await supabase
    .from("ratings")
    .select("id,total_score,notes,rated_at,whiskey:whiskeys(name)")
    .eq("user_id", user.id)
    .order("rated_at", { ascending: false })
    .limit(10);

  const ratings = (data || []) as RatingRow[];

  return (
    <main className="min-h-screen bg-[#F8F8F6] text-zinc-900 p-4 sm:p-6">
      <div className="max-w-4xl mx-auto">
        <div className="bg-white border border-zinc-200 rounded-3xl p-5 md:p-6 shadow-sm">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div>
              <div className="text-sm text-zinc-500">Cask Unknown</div>
              <h1 className="text-3xl font-extrabold tracking-tight mt-2">
                Rate Mode
              </h1>
              <p className="text-sm text-zinc-500 mt-2">
                Quick personal ratings, separate from the blind-tasting flow.
              </p>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <Link
                href="/rate/new"
                className="inline-flex items-center justify-center rounded-2xl px-5 py-3 font-semibold bg-zinc-900 text-white hover:bg-zinc-800"
              >
                Rate Now
              </Link>
              <Link
                href="/profile"
                className="inline-flex items-center justify-center rounded-2xl px-5 py-3 font-semibold border border-zinc-200 bg-white text-zinc-900 hover:bg-zinc-50"
              >
                Profile
              </Link>
              <Link
                href="/"
                className="inline-flex items-center justify-center rounded-2xl px-5 py-3 font-semibold border border-zinc-200 bg-white text-zinc-900 hover:bg-zinc-50"
              >
                Home
              </Link>
            </div>
          </div>

          <div className="mt-6">
            <div className="text-sm font-semibold text-zinc-800">
              Recent Ratings
            </div>

            {searchParams?.saved === "1" ? (
              <div className="mt-4 rounded-3xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm text-emerald-700">
                Rating saved.
              </div>
            ) : null}

            {error ? (
              <div className="mt-4 rounded-3xl border border-red-200 bg-red-50 px-5 py-4">
                <div className="font-semibold text-red-700">
                  Could not load ratings
                </div>
                <div className="mt-1 text-sm text-red-600">{error.message}</div>
              </div>
            ) : ratings.length === 0 ? (
              <div className="mt-4 rounded-3xl border border-zinc-200 px-6 py-8 text-center">
                <div className="text-lg font-semibold">No ratings yet</div>
                <div className="mt-2 text-sm text-zinc-500">
                  Tap Rate Now.
                </div>
              </div>
            ) : (
              <div className="mt-4 space-y-3">
                {ratings.map((rating) => (
                  <Link
                    key={rating.id}
                    href={`/history/rate/${rating.id}?returnTo=${encodeURIComponent("/rate")}`}
                    className="block rounded-2xl bg-[#F8F8F6] border border-zinc-200 px-4 py-4 hover:bg-zinc-50"
                  >
                    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                      <div>
                        <div className="font-semibold">
                          {getWhiskeyName(rating.whiskey)}
                        </div>
                        <div className="text-xs text-zinc-500 mt-1">
                          Rated {formatRatedAt(rating.rated_at)}
                        </div>
                        {rating.notes ? (
                          <div className="mt-2 text-sm text-zinc-600">
                            {rating.notes}
                          </div>
                        ) : null}
                      </div>

                      <div className="text-right">
                        <div className="text-2xl font-extrabold tabular-nums">
                          {Number(rating.total_score ?? 0).toFixed(1)}
                        </div>
                        <div className="text-xs text-zinc-500">Total score</div>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
