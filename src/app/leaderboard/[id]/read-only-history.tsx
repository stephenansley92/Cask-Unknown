"use client";

import { useEffect, useMemo, useState } from "react";
import {
  buildCanonicalProfileHistoryView,
  formatDate,
  formatDateTime,
  loadCanonicalBlindHistory,
  type HistoryRow,
  type RateHistoryRow,
  type SortKey,
} from "@/lib/profile-history/read-only";
import { supabase } from "@/lib/supabaseClient";
import {
  CategoryAverages,
  HistoryEntryLink,
  HistoryList,
  HistorySortSelect,
  RankedPours,
  StatTiles,
} from "@/components/history/profile-history";
import { LoadingDots } from "@/components/ui/brand";
import { Card, Eyebrow } from "@/components/ui/card";
import { Notice } from "@/components/ui/notice";

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
      <div className="mt-10 flex justify-center">
        <LoadingDots label="Loading profile history" />
      </div>
    );
  }

  if (error) {
    return (
      <Notice tone="danger" title="Could not load history" className="mt-6">
        {error}
      </Notice>
    );
  }

  if (!combinedHistory.length) {
    return (
      <Card className="mt-6 text-center">
        <div className="font-semibold">No ratings yet for {displayName}</div>
        <p className="mt-1 text-sm text-fg-muted">Their scores will show up here once they taste something.</p>
      </Card>
    );
  }

  return (
    <div className="mt-6 space-y-3">
      <StatTiles overallAverage={overallAverage} ratedCount={ratedCount} sessionCount={sessionCount} />
      <RankedPours top={topFive} bottom={bottomFive} />
      <CategoryAverages averages={categoryAverages} />

      <section className="pt-5">
        <div className="flex items-center justify-between gap-3">
          <Eyebrow>All ratings</Eyebrow>
          <HistorySortSelect value={sortKey} onChange={setSortKey} />
        </div>

        <div className="mt-3">
          <HistoryList>
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
                : "of 100";

              return (
                <li key={row.id}>
                  <HistoryEntryLink
                    href={detailHref}
                    title={row.pourLabel}
                    meta={`${isRateMode ? "Solo rating" : row.sessionTitle} · ${
                      isRateMode ? formatDateTime(row.createdAt) : formatDate(row.createdAt)
                    }`}
                    notes={row.notes}
                    score={cardScoreText}
                    scoreLabel={cardScoreLabel}
                    rateMode={isRateMode}
                  />
                </li>
              );
            })}
          </HistoryList>
        </div>
      </section>
    </div>
  );
}
