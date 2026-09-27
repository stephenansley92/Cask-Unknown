import type { ReactNode } from "react";
import Link from "next/link";
import { ChevronDown, ChevronRight } from "lucide-react";
import {
  CATEGORY,
  type HistoryRow,
  type ScoreCategoryKey,
  type SortKey,
} from "@/lib/profile-history/read-only";
import { Card, Eyebrow } from "@/components/ui/card";
import { cx } from "@/components/ui/cx";

/*
 * Presentational pieces shared by the private profile (/profile) and the
 * public profile (/leaderboard/[id]). Data loading and grouping stay in
 * the pages; these only render.
 */

export function StatTiles({
  overallAverage,
  ratedCount,
  sessionCount,
}: {
  overallAverage: number;
  ratedCount: number;
  sessionCount: number;
}) {
  const tiles = [
    { label: "Avg score", value: overallAverage.toFixed(1), accent: true },
    { label: "Pours rated", value: String(ratedCount) },
    { label: "Sessions", value: String(sessionCount) },
  ];
  return (
    <div className="grid grid-cols-3 gap-2">
      {tiles.map((tile) => (
        <div key={tile.label} className="rounded-2xl border border-line bg-surface px-3 py-3 text-center">
          <div
            className={cx(
              "font-display text-2xl font-semibold tabular-nums",
              tile.accent ? "text-accent" : "text-fg",
            )}
          >
            {tile.value}
          </div>
          <div className="mt-0.5 text-[11px] font-semibold text-fg-faint">{tile.label}</div>
        </div>
      ))}
    </div>
  );
}

function RankedList({ title, rows }: { title: string; rows: HistoryRow[] }) {
  return (
    <Card padded={false} className="p-4">
      <Eyebrow>{title}</Eyebrow>
      <ol className="mt-3 space-y-2.5">
        {rows.map((row, idx) => (
          <li key={row.id} className="flex items-center gap-3">
            <span className="w-4 shrink-0 text-center text-xs font-semibold tabular-nums text-fg-faint">
              {idx + 1}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold">{row.pourLabel}</span>
              <span className="block truncate text-xs text-fg-faint">{row.sessionTitle}</span>
            </span>
            <span className="shrink-0 font-display text-lg font-semibold tabular-nums">
              {row.total.toFixed(0)}
            </span>
          </li>
        ))}
      </ol>
    </Card>
  );
}

export function RankedPours({ top, bottom }: { top: HistoryRow[]; bottom: HistoryRow[] }) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <RankedList title="Highest rated" rows={top} />
      <RankedList title="Lowest rated" rows={bottom} />
    </div>
  );
}

export function CategoryAverages({ averages }: { averages: Record<ScoreCategoryKey, number> }) {
  return (
    <Card padded={false} className="p-4">
      <Eyebrow>Average by category</Eyebrow>
      <ul className="mt-3 space-y-2.5">
        {CATEGORY.map((category) => {
          const value = averages[category.key];
          const pct = Math.max(0, Math.min(100, (value / category.max) * 100));
          return (
            <li key={category.key} className="grid grid-cols-[6.5rem_1fr_3.25rem] items-center gap-3 text-sm">
              <span className="truncate text-fg-muted">{category.label}</span>
              <span className="h-1.5 overflow-hidden rounded-full bg-line" aria-hidden>
                <span className="block h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
              </span>
              <span className="text-right tabular-nums">
                <span className="font-semibold">{value.toFixed(1)}</span>
                <span className="text-xs text-fg-faint">/{category.max}</span>
              </span>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

export function HistorySortSelect({
  value,
  onChange,
}: {
  value: SortKey;
  onChange: (value: SortKey) => void;
}) {
  return (
    <label className="relative inline-flex items-center">
      <span className="sr-only">Sort ratings by</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value as SortKey)}
        className="h-9 appearance-none rounded-xl border border-line bg-raised pl-3 pr-8 text-xs font-semibold text-fg hover:border-line-strong focus:border-accent focus:outline-none"
      >
        <option value="recent">Newest first</option>
        <option value="total">Overall score</option>
        {CATEGORY.map((category) => (
          <option key={category.key} value={category.key}>
            {category.label}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2.5 h-3.5 w-3.5 text-fg-faint" />
    </label>
  );
}

type HistoryEntryProps = {
  title: ReactNode;
  meta: ReactNode;
  notes?: string;
  score: string;
  scoreLabel: string;
  /** Rate Mode entries get a small tag so they read apart from blind pours. */
  rateMode?: boolean;
};

function HistoryEntryBody({ title, meta, notes, score, scoreLabel, rateMode }: HistoryEntryProps) {
  return (
    <>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="truncate font-semibold">{title}</span>
          {rateMode ? (
            <span className="shrink-0 rounded-full bg-raised px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-fg-faint">
              Solo
            </span>
          ) : null}
        </span>
        <span className="mt-0.5 block truncate text-xs text-fg-faint">{meta}</span>
        {notes ? <span className="mt-1.5 line-clamp-2 block text-sm text-fg-muted">{notes}</span> : null}
      </span>
      <span className="shrink-0 text-right">
        <span className="block font-display text-2xl font-semibold tabular-nums">{score}</span>
        <span className="block text-[11px] text-fg-faint">{scoreLabel}</span>
      </span>
    </>
  );
}

/** One rating in a history list, linking to its detail page. */
export function HistoryEntryLink({ href, ...props }: HistoryEntryProps & { href: string }) {
  return (
    <Link href={href} className="flex items-start gap-3 px-4 py-3.5 hover:bg-raised">
      <HistoryEntryBody {...props} />
      <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-fg-faint" />
    </Link>
  );
}

/** Divided list container for history entries. */
export function HistoryList({ children }: { children: ReactNode }) {
  return (
    <ul className="overflow-hidden rounded-3xl border border-line bg-surface [&>li]:border-b [&>li]:border-line [&>li:last-child]:border-b-0">
      {children}
    </ul>
  );
}

export { HistoryEntryBody };
