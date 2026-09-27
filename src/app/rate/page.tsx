import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Star } from "lucide-react";
import { HistoryEntryLink, HistoryList } from "@/components/history/profile-history";
import { buttonStyles } from "@/components/ui/button";
import { Card, Eyebrow } from "@/components/ui/card";
import { Wordmark } from "@/components/ui/brand";
import { Notice } from "@/components/ui/notice";
import { PageShell } from "@/components/ui/page";
import { TabBar } from "@/components/ui/tab-bar";

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
  searchParams?: Promise<{
    saved?: string;
  }>;
};

export default async function RatePage({ searchParams }: RatePageProps) {
  const resolvedSearchParams = await searchParams;
  const supabase = await createSupabaseServerClient();
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
    <PageShell bottomInset>
      <TabBar />
      <div className="animate-fade-slide-in">
        <header className="flex items-center justify-between">
          <Wordmark />
          <Link href="/rate/new" className={buttonStyles({ variant: "primary", size: "sm" })}>
            <Star className="h-4 w-4" /> Rate a pour
          </Link>
        </header>

        <h1 className="mt-8 font-display text-3xl font-semibold tracking-tight">Solo ratings</h1>
        <p className="mt-1 text-sm text-fg-muted">
          Quick personal ratings, separate from blind tastings. Your full history lives on your{" "}
          <Link href="/profile" className="font-semibold text-accent hover:text-accent-hover">
            profile
          </Link>
          .
        </p>

        {resolvedSearchParams?.saved === "1" ? (
          <Notice tone="success" className="mt-4">
            Rating saved.
          </Notice>
        ) : null}

        <Eyebrow className="mt-8">Recent ratings</Eyebrow>

        {error ? (
          <Notice tone="danger" title="Could not load ratings" className="mt-3">
            {error.message}
          </Notice>
        ) : ratings.length === 0 ? (
          <Card className="mt-3 text-center">
            <div className="font-semibold">No ratings yet</div>
            <p className="mt-1 text-sm text-fg-muted">Score something you&apos;re drinking to start your log.</p>
            <Link href="/rate/new" className={buttonStyles({ variant: "primary", size: "md", className: "mt-4" })}>
              <Star className="h-4 w-4" /> Rate a pour
            </Link>
          </Card>
        ) : (
          <div className="mt-3">
            <HistoryList>
              {ratings.map((rating) => (
                <li key={rating.id}>
                  <HistoryEntryLink
                    href={`/history/rate/${rating.id}?returnTo=${encodeURIComponent("/rate")}`}
                    title={getWhiskeyName(rating.whiskey)}
                    meta={formatRatedAt(rating.rated_at)}
                    notes={rating.notes || undefined}
                    score={Number(rating.total_score ?? 0).toFixed(1)}
                    scoreLabel="of 100"
                  />
                </li>
              ))}
            </HistoryList>
          </div>
        )}
      </div>
    </PageShell>
  );
}
