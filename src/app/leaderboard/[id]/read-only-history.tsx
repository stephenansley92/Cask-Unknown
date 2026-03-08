"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  CATEGORY,
  buildCanonicalProfileHistoryView,
  formatDate,
  formatDateTime,
  loadCanonicalBlindHistory,
  type HistoryRow,
  type RateHistoryRow,
  type SortKey,
} from "@/lib/profile-history/read-only";
import { supabase } from "@/lib/supabaseClient";

type ReadOnlyHistorySectionProps = {
  userId: string;
  displayName: string;
  profileName: string;
  initialRateHistory: RateHistoryRow[];
};

export default function ReadOnlyHistorySection({
  userId,
  displayName,
  profileName,
  initialRateHistory,
}: ReadOnlyHistorySectionProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("recent");
  const [blindHistory, setBlindHistory] = useState<HistoryRow[]>([]);
  const [rateHistory] = useState<RateHistoryRow[]>(initialRateHistory);

  useEffect(() => {
    const loadBlind = async () => {
      try {
        setLoading(true);
        setError("");

        const rows = await loadCanonicalBlindHistory(supabase, {
          userId,
          profileName,
          ownerView: false,
        });

        setBlindHistory(rows);
        setLoading(false);
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "Unknown error.");
        setLoading(false);
      }
    };

    loadBlind();
  }, [profileName, userId]);

  const {
    combinedHistory,
    sortedHistory,
    activeSortCategory,
    categoryAverages,
    overallAverage,
    topFive,
    bottomFive,
    ratedCount,
    sessionCount,
  } = useMemo(
    () =>
      buildCanonicalProfileHistoryView({
        blindHistory,
        rateHistory,
        sortKey,
      }),
    [blindHistory, rateHistory, sortKey]
  );

  if (loading) {
    return (
      <div className="mt-6 rounded-3xl border border-zinc-200 p-6 text-center">
        <div className="text-sm text-zinc-500">Loading profile history...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="mt-6 rounded-3xl border border-red-200 bg-red-50 px-6 py-5">
        <div className="font-semibold text-red-700">Could not load history</div>
        <div className="mt-1 text-sm text-red-600">{error}</div>
      </div>
    );
  }

  return (
    <>
      {!combinedHistory.length ? (
        <div className="mt-6 rounded-3xl border border-zinc-200 p-6 text-center">
          <div className="text-lg font-semibold">No ratings yet for {displayName}.</div>
          <div className="mt-2 text-sm text-zinc-500">
            Rate something or join a tasting to start building history.
          </div>
        </div>
      ) : (
        <>
          <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-3">
            <div className="rounded-2xl border border-zinc-200 bg-[#F8F8F6] px-4 py-3">
              <div className="text-xs text-zinc-500">Overall Avg</div>
              <div className="text-2xl font-extrabold tabular-nums">
                {overallAverage.toFixed(1)}
              </div>
            </div>
            <div className="rounded-2xl border border-zinc-200 bg-[#F8F8F6] px-4 py-3">
              <div className="text-xs text-zinc-500">Rated Pours</div>
              <div className="text-2xl font-extrabold tabular-nums">{ratedCount}</div>
            </div>
            <div className="rounded-2xl border border-zinc-200 bg-[#F8F8F6] px-4 py-3">
              <div className="text-xs text-zinc-500">Sessions</div>
              <div className="text-2xl font-extrabold tabular-nums">{sessionCount}</div>
            </div>
          </div>

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
                      <div className="text-xs text-zinc-500">{row.sessionTitle}</div>
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
                      <div className="text-xs text-zinc-500">{row.sessionTitle}</div>
                    </div>
                    <div className="text-xl font-extrabold tabular-nums">
                      {row.total.toFixed(0)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="mt-6 rounded-3xl border border-zinc-200 p-5">
            <div className="text-sm text-zinc-500">Personal Averages By Category</div>
            <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-5">
              {CATEGORY.map((category) => (
                <div
                  key={category.key}
                  className="rounded-2xl border border-zinc-200 bg-[#F8F8F6] px-4 py-3"
                >
                  <div className="text-xs text-zinc-500">{category.label}</div>
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

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <label className="text-sm font-semibold text-zinc-800">
              Sort by{" "}
              <select
                value={sortKey}
                onChange={(event) => setSortKey(event.target.value as SortKey)}
                className="ml-2 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
              >
                <option value="recent">Newest First</option>
                <option value="total">Overall Rating</option>
                {CATEGORY.map((category) => (
                  <option key={category.key} value={category.key}>
                    {category.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>

        {sortedHistory.length === 0 ? (
          <div className="mt-6 rounded-3xl border border-zinc-200 p-6 text-center">
            <div className="text-lg font-semibold">No ratings yet</div>
            <div className="mt-2 text-sm text-zinc-500">
              Rate something or join a tasting to start building history.
            </div>
          </div>
        ) : (
          <div className="mt-6 space-y-3">
            {sortedHistory.map((row) => {
              const isRateMode = row.sessionId.startsWith("rate:");
              const detailMode = isRateMode ? "rate" : "blind";
              const returnTo = encodeURIComponent(`/leaderboard/${userId}`);
              const ownerQuery = `&owner=${encodeURIComponent(userId)}`;
              const detailHref = `/history/${detailMode}/${row.id}?returnTo=${returnTo}${ownerQuery}`;
              const activeCategoryScore = activeSortCategory
                ? row.byCat[activeSortCategory.key]
                : null;
              const activeCategoryScoreText =
                typeof activeCategoryScore === "number"
                  ? Number.isInteger(activeCategoryScore)
                    ? activeCategoryScore.toFixed(0)
                    : activeCategoryScore.toFixed(1)
                  : "--";
              const cardScoreText = activeSortCategory
                ? `${activeCategoryScoreText}/${activeSortCategory.max}`
                : isRateMode
                  ? row.total.toFixed(1)
                  : row.total.toFixed(0);
              const cardScoreLabel = activeSortCategory
                ? activeSortCategory.label
                : "Overall / 100";

              return (
                <Link
                  key={row.id}
                  href={detailHref}
                  className="block rounded-2xl border border-zinc-200 bg-[#F8F8F6] px-4 py-4 hover:bg-zinc-50 focus:outline-none focus:ring-2 focus:ring-zinc-900/10"
                >
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div>
                      <div className="font-semibold">{row.pourLabel}</div>
                      <div className="mt-1 text-xs text-zinc-500">
                        {row.sessionTitle} - Rated{" "}
                        {isRateMode ? formatDateTime(row.createdAt) : formatDate(row.createdAt)}
                      </div>
                      {row.notes ? (
                        <div className="mt-2 text-sm text-zinc-600">
                          <span className="font-semibold text-zinc-800">Notes:</span>{" "}
                          {row.notes}
                        </div>
                      ) : null}
                    </div>

                    <div className="text-right">
                      <div className="text-2xl font-extrabold tabular-nums">
                        {cardScoreText}
                      </div>
                      <div className="text-xs text-zinc-500">{cardScoreLabel}</div>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}
