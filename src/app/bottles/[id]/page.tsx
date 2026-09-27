import Link from "next/link";
import { notFound } from "next/navigation";
import { unstable_noStore as noStore } from "next/cache";
import { Quote, Star } from "lucide-react";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getWhiskeySummary, type WhiskeySummary } from "@/lib/session-api";
import { CATEGORY } from "@/lib/profile-history/read-only";
import { formatScore } from "@/components/history/profile-history";
import { BackLink } from "@/components/back-link";
import { FlavorTagList } from "@/components/flavor-tags";
import { buttonStyles } from "@/components/ui/button";
import { Card, Eyebrow } from "@/components/ui/card";
import { Wordmark } from "@/components/ui/brand";
import { PageShell } from "@/components/ui/page";

type BottlePageProps = { params: Promise<{ id: string }> };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function formatDate(value: string) {
  const d = new Date(value);
  return Number.isNaN(d.getTime())
    ? ""
    : d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function money(value: number | null | undefined) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? `$${n.toFixed(0)}` : null;
}

type BasicWhiskey = WhiskeySummary["whiskey"];

export default async function BottlePage({ params }: BottlePageProps) {
  noStore();
  const { id } = await params;
  if (!UUID.test(id)) notFound();

  const supabase = await createSupabaseServerClient();
  const { data: summary, error } = await getWhiskeySummary(supabase, id);

  // Before the reveal-night migration the summary RPC doesn't exist; signed-in
  // visitors can still see the bottle's basic facts.
  let whiskey: BasicWhiskey | null = summary?.whiskey ?? null;
  if (error && !whiskey) {
    const { data: row } = await supabase
      .from("whiskeys")
      .select("id,name,distillery,proof,category,subcategory,bottle_size,rarity,msrp,secondary")
      .eq("id", id)
      .maybeSingle();
    whiskey = (row as BasicWhiskey | null) ?? null;
  }
  if (!whiskey) notFound();

  const stats = summary?.stats;
  const facts = [
    whiskey.proof ? `${Number(whiskey.proof)} proof` : null,
    whiskey.bottle_size,
    whiskey.rarity,
    money(whiskey.msrp) ? `MSRP ${money(whiskey.msrp)}` : null,
    money(whiskey.secondary) ? `Secondary ${money(whiskey.secondary)}` : null,
  ].filter(Boolean) as string[];
  const style = [whiskey.distillery, whiskey.subcategory || whiskey.category].filter(Boolean).join(" · ");
  const categoryRows = CATEGORY.filter((c) => typeof stats?.categories?.[c.key] === "number");
  const returnTo = encodeURIComponent(`/bottles/${id}`);

  return (
    <PageShell>
      <header className="flex items-center justify-between">
        <BackLink />
        <Wordmark />
      </header>

      <div className="mt-6 animate-fade-slide-in">
        {style ? <Eyebrow>{style}</Eyebrow> : null}
        <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight">{whiskey.name}</h1>
        {facts.length ? (
          <ul className="mt-3 flex flex-wrap gap-1.5">
            {facts.map((fact) => (
              <li key={fact} className="rounded-full border border-line bg-surface px-2.5 py-1 text-xs font-semibold text-fg-muted">
                {fact}
              </li>
            ))}
          </ul>
        ) : null}

        {stats && stats.count > 0 ? (
          <Card className="mt-6 flex items-center gap-5">
            <div className="shrink-0 text-center">
              <div className="font-display text-5xl font-semibold leading-none tabular-nums text-accent">
                {stats.avg_total !== null ? formatScore(Number(stats.avg_total)) : "–"}
              </div>
              <div className="mt-1 text-[11px] font-semibold text-fg-faint">avg of 100</div>
            </div>
            <div className="min-w-0 text-sm text-fg-muted">
              From {stats.count} {stats.count === 1 ? "rating" : "ratings"}
              {stats.blind_count && stats.rate_count
                ? ` — ${stats.blind_count} blind, ${stats.rate_count} solo`
                : stats.blind_count
                  ? ", all tasted blind"
                  : ""}
              .
            </div>
          </Card>
        ) : stats ? (
          <Card className="mt-6 text-sm text-fg-muted">Nobody has rated this bottle yet. Be the first.</Card>
        ) : null}

        <Link
          href={`/rate/new?whiskey=${encodeURIComponent(id)}`}
          className={buttonStyles({ variant: "primary", size: "lg", block: true, className: "mt-3" })}
        >
          <Star className="h-4 w-4" /> Rate this bottle
        </Link>

        {summary?.mine.length ? (
          <section className="mt-8">
            <Eyebrow>Your ratings</Eyebrow>
            <ul className="mt-3 overflow-hidden rounded-3xl border border-line bg-surface">
              {summary.mine.map((row) => (
                <li key={row.id} className="border-b border-line last:border-b-0">
                  <Link
                    href={`/history/${row.source}/${row.id}?returnTo=${returnTo}`}
                    className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-raised"
                  >
                    <span className="text-sm">
                      <span className="font-semibold">{row.source === "blind" ? "Blind tasting" : "Solo rating"}</span>
                      <span className="block text-xs text-fg-faint">{formatDate(row.created_at)}</span>
                    </span>
                    <span className="font-display text-2xl font-semibold tabular-nums">
                      {formatScore(Number(row.total))}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {stats?.tags.length ? (
          <section className="mt-8">
            <Eyebrow>What people taste</Eyebrow>
            <FlavorTagList tags={stats.tags} className="mt-3" />
          </section>
        ) : null}

        {categoryRows.length ? (
          <Card padded={false} className="mt-8 p-4">
            <Eyebrow>Average by category</Eyebrow>
            <ul className="mt-3 space-y-2.5">
              {categoryRows.map((c) => {
                const value = Number(stats!.categories[c.key]);
                const pct = Math.max(0, Math.min(100, (value / c.max) * 100));
                return (
                  <li key={c.key} className="grid grid-cols-[6.5rem_1fr_3.25rem] items-center gap-3 text-sm">
                    <span className="truncate text-fg-muted">{c.label}</span>
                    <span className="h-1.5 overflow-hidden rounded-full bg-line" aria-hidden>
                      <span className="block h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
                    </span>
                    <span className="text-right tabular-nums">
                      <span className="font-semibold">{value.toFixed(1)}</span>
                      <span className="text-xs text-fg-faint">/{c.max}</span>
                    </span>
                  </li>
                );
              })}
            </ul>
          </Card>
        ) : null}

        {summary?.notes.length ? (
          <section className="mt-8">
            <Eyebrow>Tasting notes</Eyebrow>
            <ul className="mt-3 space-y-2">
              {summary.notes.map((note, index) => (
                <li key={`${note.created_at}-${index}`}>
                  <Card padded={false} className="p-4">
                    <Quote className="h-4 w-4 text-accent" />
                    <p className="mt-2 whitespace-pre-line text-sm leading-relaxed">{note.notes}</p>
                    <div className="mt-3 flex items-center justify-between gap-3 text-xs text-fg-faint">
                      <span>
                        {note.user_id ? (
                          <Link href={`/leaderboard/${note.user_id}`} className="font-semibold text-fg-muted hover:text-fg">
                            {note.author}
                          </Link>
                        ) : (
                          <span className="font-semibold text-fg-muted">{note.author}</span>
                        )}{" "}
                        · {formatDate(note.created_at)}
                      </span>
                      <span className="font-display text-base font-semibold tabular-nums text-fg">
                        {formatScore(Number(note.total))}
                      </span>
                    </div>
                  </Card>
                </li>
              ))}
            </ul>
            <p className="mt-2 px-1 text-xs text-fg-faint">Notes are shown from your own ratings and public profiles.</p>
          </section>
        ) : null}
      </div>
    </PageShell>
  );
}
