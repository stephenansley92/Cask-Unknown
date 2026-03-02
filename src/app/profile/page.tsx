"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { ACTIVE_PROFILE_STORAGE_KEY, BASE_PROFILES, getProfileOptions } from "@/lib/profiles";

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
  sort_order: number;
};

type ParticipantRow = {
  id: string;
  session_id: string;
  display_name: string;
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

type RateHistoryRow = {
  id: string;
  totalScore: number;
  notes: string;
  createdAt: string;
  whiskeyName: string;
  byCat: Record<string, number>;
};

type SignupToast = {
  id: string;
  newUserEmail: string;
  createdAt: string;
};

type UserProfileRow = {
  user_id: string;
  email: string;
  display_name: string;
};

type PublicProfileRow = {
  user_id: string;
  display_name: string | null;
  is_public: boolean;
};

const OWNER_EMAIL = "stephen.ansley92@gmail.com";

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

export default function ProfilePage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("total");
  const [profileOptions, setProfileOptions] = useState<string[]>([]);
  const [activeProfile, setActiveProfile] = useState<string>(BASE_PROFILES[0]);
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [userEmail, setUserEmail] = useState("");
  const [signingOut, setSigningOut] = useState(false);
  const [rateHistory, setRateHistory] = useState<RateHistoryRow[]>([]);
  const [rateLoading, setRateLoading] = useState(false);
  const [rateError, setRateError] = useState("");
  const [signupToasts, setSignupToasts] = useState<SignupToast[]>([]);
  const [userDisplayName, setUserDisplayName] = useState("");
  const [profileResolved, setProfileResolved] = useState(false);
  const [authUserId, setAuthUserId] = useState("");
  const [publicProfileDisplayName, setPublicProfileDisplayName] = useState("");
  const [publicProfileIsPublic, setPublicProfileIsPublic] = useState(true);
  const [publicProfileError, setPublicProfileError] = useState("");
  const [savingPublicProfile, setSavingPublicProfile] = useState(false);

  useEffect(() => {
    const options = getProfileOptions();
    setProfileOptions(options);

    if (typeof window === "undefined") return;

    const saved = window.localStorage.getItem(ACTIVE_PROFILE_STORAGE_KEY);
    if (saved && options.includes(saved)) {
      setActiveProfile(saved);
    }
  }, []);

  useEffect(() => {
    const loadUser = async () => {
      const authClient = createSupabaseBrowserClient();
      const {
        data: { user },
        error: userError,
      } = await authClient.auth.getUser();

      if (userError) {
        setError(userError.message);
        setLoading(false);
        return;
      }

      const email = user?.email || "";
      const normalizedEmail = email.trim().toLowerCase();
      setUserEmail(email);

      if (!user) {
        setProfileResolved(true);
        return;
      }

      setAuthUserId(user.id);

      const { data: profileRow, error: profileError } = await authClient
        .from("user_profiles")
        .select("user_id,email,display_name")
        .eq("user_id", user.id)
        .maybeSingle();

      if (profileError) {
        setError(profileError.message);
        setLoading(false);
        return;
      }

      if (!profileRow) {
        window.location.href = "/profile/setup";
        return;
      }

      const resolvedDisplayName =
        (profileRow as UserProfileRow).display_name?.trim() || email || "Profile";

      setUserDisplayName(resolvedDisplayName);

      if (normalizedEmail !== OWNER_EMAIL) {
        setActiveProfile(resolvedDisplayName);
      }

      const { data: existingPublicProfile, error: publicProfileLoadError } =
        await authClient
          .from("public_profiles")
          .select("user_id,display_name,is_public")
          .eq("user_id", user.id)
          .maybeSingle();

      if (publicProfileLoadError) {
        setPublicProfileError(publicProfileLoadError.message);
        setPublicProfileDisplayName(resolvedDisplayName);
        setPublicProfileIsPublic(true);
        setProfileResolved(true);
        return;
      }

      if (!existingPublicProfile) {
        const { error: publicProfileUpsertError } = await authClient
          .from("public_profiles")
          .upsert(
            {
              user_id: user.id,
              display_name: resolvedDisplayName,
              is_public: true,
            },
            {
              onConflict: "user_id",
            }
          );

        if (publicProfileUpsertError) {
          setPublicProfileError(publicProfileUpsertError.message);
          setPublicProfileDisplayName(resolvedDisplayName);
          setPublicProfileIsPublic(true);
          setProfileResolved(true);
          return;
        }

        setPublicProfileDisplayName(resolvedDisplayName);
        setPublicProfileIsPublic(true);
      } else {
        const publicProfile = existingPublicProfile as PublicProfileRow;
        setPublicProfileDisplayName(
          publicProfile.display_name?.trim() || resolvedDisplayName
        );
        setPublicProfileIsPublic(Boolean(publicProfile.is_public));
      }

      setProfileResolved(true);
    };

    loadUser();
  }, []);

  useEffect(() => {
    const loadRatings = async () => {
      try {
        setRateLoading(true);
        setRateError("");

        const authClient = createSupabaseBrowserClient();
        const {
          data: { user },
          error: userError,
        } = await authClient.auth.getUser();

        if (userError) throw userError;
        if (!user) {
          setRateHistory([]);
          setRateLoading(false);
          return;
        }

        const normalizeScoreMap = (value: unknown) => {
          if (!value || typeof value !== "object" || Array.isArray(value)) {
            return {} as Record<string, number>;
          }

          return Object.fromEntries(
            Object.entries(value as Record<string, unknown>).map(([key, rawValue]) => [
              key,
              Number(rawValue ?? 0),
            ])
          );
        };

        const withScoresJson = await authClient
          .from("ratings")
          .select("id,total_score,notes,rated_at,template_id,scores_json,whiskey:whiskeys(name)")
          .eq("user_id", user.id)
          .order("rated_at", { ascending: false })
          .limit(10);

        let ratingsData = withScoresJson.data as Record<string, unknown>[] | null;
        let scoreColumnKey: "scores_json" | "scores" = "scores_json";

        if (withScoresJson.error) {
          const withScores = await authClient
            .from("ratings")
            .select("id,total_score,notes,rated_at,template_id,scores,whiskey:whiskeys(name)")
            .eq("user_id", user.id)
            .order("rated_at", { ascending: false })
            .limit(10);

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

          const whiskeyName = Array.isArray(whiskey)
            ? whiskey[0]?.name || "Unknown whiskey"
            : whiskey?.name || "Unknown whiskey";

          return {
            id: row.id as string,
            totalScore: Number(row.total_score ?? 0),
            notes: typeof row.notes === "string" ? row.notes.trim() : "",
            createdAt: (row.rated_at as string) || "",
            whiskeyName,
            templateId: (row.template_id as string) || "",
            scoreMap: normalizeScoreMap(row[scoreColumnKey]),
          };
        });

        const templateIds = [...new Set(rawRows.map((row) => row.templateId).filter(Boolean))];
        let templateItemKeyById = new Map<string, string>();

        if (templateIds.length > 0) {
          const { data: templateItemsData, error: templateItemsErr } = await authClient
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

        const rows = rawRows.map((row) => {
          const byCat = Object.fromEntries(
            CATEGORY.map((category) => [category.key, 0])
          ) as Record<string, number>;

          for (const [itemId, score] of Object.entries(row.scoreMap)) {
            const itemKey = templateItemKeyById.get(itemId);
            if (!itemKey) continue;

            const category = CATEGORY.find((entry) => entry.key === itemKey);
            if (!category) continue;

            byCat[category.key] = Number(score ?? 0);
          }

          return {
            id: row.id,
            totalScore: row.totalScore,
            notes: row.notes,
            createdAt: row.createdAt,
            whiskeyName: row.whiskeyName,
            byCat,
          };
        });

        setRateHistory(rows);
        setRateLoading(false);
      } catch (e: unknown) {
        setRateError(e instanceof Error ? e.message : "Unknown error.");
        setRateLoading(false);
      }
    };

    loadRatings();
  }, []);

  useEffect(() => {
    const normalizedEmail = userEmail.trim().toLowerCase();
    if (!normalizedEmail || normalizedEmail !== OWNER_EMAIL) {
      setSignupToasts([]);
      return;
    }

    const authClient = createSupabaseBrowserClient();
    const channel = authClient
      .channel("owner-signup-events")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "signup_events",
        },
        (payload: {
          new: {
            id?: string;
            created_at?: string;
            new_user_email?: string | null;
          };
        }) => {
          const inserted = payload.new as
            | {
                id?: string;
                created_at?: string;
                new_user_email?: string | null;
              }
            | undefined;

          const insertedId = inserted?.id;
          if (!insertedId) return;

          setSignupToasts((prev) => [
            {
              id: insertedId,
              newUserEmail: inserted.new_user_email?.trim() || "New user",
              createdAt: inserted.created_at || new Date().toISOString(),
            },
            ...prev.filter((toast) => toast.id !== insertedId),
          ]);
        }
      )
      .subscribe();

    return () => {
      void authClient.removeChannel(channel);
    };
  }, [userEmail]);

  useEffect(() => {
    if (!profileResolved) {
      return;
    }

    const load = async () => {
      try {
        setLoading(true);
        setError("");

        if (typeof window !== "undefined") {
          window.localStorage.setItem(ACTIVE_PROFILE_STORAGE_KEY, activeProfile);
        }

        const { data: participantsData, error: participantsErr } = await supabase
          .from("participants")
          .select("id,session_id,display_name")
          .eq("display_name", activeProfile);

        if (participantsErr) throw participantsErr;

        const participants = (participantsData || []) as ParticipantRow[];
        if (!participants.length) {
          setHistory([]);
          setLoading(false);
          return;
        }

        const participantIds = participants.map((p) => p.id);

        const { data: scoresData, error: scoresErr } = await supabase
          .from("scores")
          .select(
            "id,session_id,pour_id,participant_id,nose,flavor,mouthfeel,complexity,balance,finish,uniqueness,drinkability,packaging,value,total,notes,created_at"
          )
          .in("participant_id", participantIds);

        if (scoresErr) throw scoresErr;

        const scores = (scoresData || []) as ScoreRow[];
        if (!scores.length) {
          setHistory([]);
          setLoading(false);
          return;
        }

        const sessionIds = [...new Set(scores.map((s) => s.session_id))];
        const pourIds = [...new Set(scores.map((s) => s.pour_id))];

        const [{ data: sessionsData, error: sessionsErr }, { data: poursData, error: poursErr }] = await Promise.all([
          supabase.from("sessions").select("id,title,is_blind,status").in("id", sessionIds),
          supabase.from("pours").select("id,session_id,code,bottle_name,sort_order").in("id", pourIds),
        ]);

        if (sessionsErr) throw sessionsErr;
        if (poursErr) throw poursErr;

        const sessions = (sessionsData || []) as SessionRow[];
        const pours = (poursData || []) as PourRow[];

        const sessionById = new Map(sessions.map((s) => [s.id, s]));
        const pourById = new Map(pours.map((p) => [p.id, p]));

        const rows: HistoryRow[] = scores.map((score) => {
          const session = sessionById.get(score.session_id);
          const pour = pourById.get(score.pour_id);
          const revealLocked = !!(session?.is_blind && (session.status || "").toLowerCase() !== "revealed");

          let pourLabel = session?.title || "Unknown Pour";
          if (pour) {
            pourLabel = revealLocked
              ? `${session?.title || "Session"} - Pour ${pour.code}`
              : pour.bottle_name || `${session?.title || "Session"} - Pour ${pour.code}`;
          }

          const byCat: Record<string, number> = {};
          for (const c of CATEGORY) {
            byCat[c.key] = Number(score[c.key as ScoreCategoryKey] ?? 0);
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

        setHistory(rows);
        setLoading(false);
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "Unknown error.");
        setLoading(false);
      }
    };

    load();
  }, [activeProfile, profileResolved]);

  const handleDeleteRating = async (row: HistoryRow) => {
    const ok = window.confirm(
      `Delete this rating for ${row.pourLabel}?\n\nThis permanently removes the saved score so you can clean up fake beta data.`
    );
    if (!ok) return;

    try {
      const { error: deleteErr } = await supabase.from("scores").delete().eq("id", row.id);

      if (deleteErr) {
        setError(deleteErr.message);
        return;
      }

      setHistory((prev) => prev.filter((item) => item.id !== row.id));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Unknown error.");
    }
  };

  const handleDeleteRateRating = async (ratingId: string, label: string) => {
    const ok = window.confirm(
      `Delete this rating for ${label}?\n\nThis permanently removes the saved Rate Mode score.`
    );
    if (!ok) return;

    try {
      const authClient = createSupabaseBrowserClient();
      const { error: deleteErr } = await authClient
        .from("ratings")
        .delete()
        .eq("id", ratingId);

      if (deleteErr) {
        setRateError(deleteErr.message);
        return;
      }

      setRateHistory((prev) => prev.filter((item) => item.id !== ratingId));
    } catch (e: unknown) {
      setRateError(e instanceof Error ? e.message : "Unknown error.");
    }
  };

  const handleViewBlindRating = (row: HistoryRow) => {
    const breakdown = CATEGORY.map(
      (category) =>
        `${category.label}: ${Number(row.byCat[category.key] ?? 0).toFixed(1)}/${category.max}`
    ).join("\n");

    const notes = row.notes ? `\n\nNotes:\n${row.notes}` : "";

    window.alert(
      `${row.pourLabel}\n${row.sessionTitle}\nRated ${formatDate(row.createdAt)}\nOverall: ${row.total.toFixed(
        0
      )}/100\n\nBreakdown:\n${breakdown}${notes}`
    );
  };

  const handleSavePublicProfile = async () => {
    if (!authUserId) {
      setPublicProfileError("Missing authenticated user.");
      return;
    }

    const displayName = publicProfileDisplayName.trim();
    if (!displayName) {
      setPublicProfileError("Public display name is required.");
      return;
    }

    try {
      setSavingPublicProfile(true);
      setPublicProfileError("");

      const authClient = createSupabaseBrowserClient();
      const { error: upsertError } = await authClient.from("public_profiles").upsert(
        {
          user_id: authUserId,
          display_name: displayName,
          is_public: publicProfileIsPublic,
        },
        {
          onConflict: "user_id",
        }
      );

      if (upsertError) {
        setPublicProfileError(upsertError.message);
        setSavingPublicProfile(false);
        return;
      }

      setSavingPublicProfile(false);
    } catch (e: unknown) {
      setPublicProfileError(e instanceof Error ? e.message : "Unknown error.");
      setSavingPublicProfile(false);
    }
  };

  const sortedHistory = useMemo(() => {
    const rows = [
      ...history,
      ...rateHistory.map((row) => ({
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

    rows.sort((a, b) => {
      const aValue = sortKey === "total" ? a.total : a.byCat[sortKey] ?? 0;
      const bValue = sortKey === "total" ? b.total : b.byCat[sortKey] ?? 0;

      if (bValue !== aValue) return bValue - aValue;
      return b.total - a.total;
    });

    return rows;
  }, [history, rateHistory, sortKey]);

  const categoryAverages = useMemo(() => {
    const out: Record<string, number> = {};

    for (const c of CATEGORY) {
      out[c.key] = avg(history.map((row) => row.byCat[c.key] ?? 0));
    }

    return out;
  }, [history]);

  const overallAverage = useMemo(() => avg(history.map((row) => row.total)), [history]);
  const topFive = useMemo(() => [...history].sort((a, b) => b.total - a.total).slice(0, 5), [history]);
  const bottomFive = useMemo(() => [...history].sort((a, b) => a.total - b.total).slice(0, 5), [history]);
  const ratedCount = history.length;
  const sessionCount = useMemo(() => new Set(history.map((row) => row.sessionId)).size, [history]);
  const isOwner = userEmail.trim().toLowerCase() === OWNER_EMAIL;
  const displayProfileName = isOwner
    ? activeProfile
    : userDisplayName || activeProfile;

  if (loading || (!profileResolved && !error)) {
    return (
      <main className="min-h-screen bg-[#F8F8F6] text-zinc-900 flex items-center justify-center p-6">
        <div className="text-zinc-500">Loading profile...</div>
      </main>
    );
  }

  if (error) {
    return (
      <main className="min-h-screen bg-[#F8F8F6] text-zinc-900 flex items-center justify-center p-6">
        <div className="max-w-lg w-full bg-white border border-zinc-200 rounded-3xl p-6 shadow-sm">
          <div className="text-2xl font-extrabold tracking-tight">Profile Error</div>
          <p className="text-zinc-600 mt-2">{error}</p>
          <Link
            href="/"
            className="inline-flex items-center justify-center mt-4 rounded-2xl px-4 py-3 font-semibold bg-zinc-900 text-white hover:bg-zinc-800"
          >
            Back Home
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#F8F8F6] text-zinc-900 p-4 sm:p-6">
      <div className="max-w-6xl mx-auto">
        {isOwner && signupToasts.length > 0 ? (
          <div className="mb-4 space-y-3">
            {signupToasts.map((toast) => (
              <div
                key={toast.id}
                className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 shadow-sm"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">
                      New Signup
                    </div>
                    <div className="mt-1 font-semibold text-emerald-950">
                      {toast.newUserEmail}
                    </div>
                    <div className="mt-1 text-xs text-emerald-700">
                      {formatDateTime(toast.createdAt)}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() =>
                      setSignupToasts((prev) =>
                        prev.filter((entry) => entry.id !== toast.id)
                      )
                    }
                    className="rounded-xl border border-emerald-200 bg-white px-3 py-2 text-xs font-semibold text-emerald-800 hover:bg-emerald-100"
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : null}

        <div className="bg-white border border-zinc-200 rounded-3xl p-5 md:p-6 shadow-sm">
          <div className="rounded-3xl border border-zinc-200 bg-[#F8F8F6] px-4 py-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <div className="text-xs text-zinc-500">Authenticated Account</div>
                <div className="mt-1 font-semibold text-zinc-900">
                  {userEmail || "Signed-in user"}
                </div>
              </div>

              <button
                type="button"
                onClick={async () => {
                  setSigningOut(true);
                  const authClient = createSupabaseBrowserClient();
                  await authClient.auth.signOut();
                  window.location.href = "/login?message=Signed%20out.";
                }}
                disabled={signingOut}
                className="inline-flex items-center justify-center rounded-2xl px-4 py-3 font-semibold bg-zinc-900 text-white hover:bg-zinc-800 disabled:opacity-60"
              >
                {signingOut ? "Signing Out..." : "Sign Out"}
              </button>
            </div>
          </div>

          <div className="mt-6 rounded-3xl border border-zinc-200 p-5">
            <div className="text-sm text-zinc-500">Public profile</div>
            <div className="mt-2 text-lg font-semibold text-zinc-900">
              Leaderboard visibility
            </div>
            <div className="mt-2 text-sm text-zinc-500">
              For beta, public profiles default to on. Your public profile only exposes your display name and aggregated leaderboard stats.
            </div>

            <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-[1fr_auto] md:items-end">
              <label className="block">
                <span className="block text-sm font-semibold text-zinc-800">
                  Public display name
                </span>
                <input
                  value={publicProfileDisplayName}
                  onChange={(e) => setPublicProfileDisplayName(e.target.value)}
                  className="mt-2 w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-zinc-900"
                  placeholder="Display name"
                />
              </label>

              <label className="flex items-center gap-3 rounded-2xl border border-zinc-200 bg-[#F8F8F6] px-4 py-3">
                <input
                  type="checkbox"
                  checked={publicProfileIsPublic}
                  onChange={(e) => setPublicProfileIsPublic(e.target.checked)}
                  className="h-4 w-4 accent-zinc-900"
                />
                <span className="text-sm font-semibold text-zinc-800">
                  Show on public leaderboard
                </span>
              </label>
            </div>

            {publicProfileError ? (
              <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {publicProfileError}
              </div>
            ) : null}

            <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
              <button
                type="button"
                onClick={handleSavePublicProfile}
                disabled={savingPublicProfile}
                className="inline-flex items-center justify-center rounded-2xl bg-zinc-900 px-5 py-3 font-semibold text-white hover:bg-zinc-800 disabled:opacity-60"
              >
                {savingPublicProfile ? "Saving..." : "Save Public Profile"}
              </button>

              <Link
                href="/leaderboard"
                className="inline-flex items-center justify-center rounded-2xl border border-zinc-200 px-5 py-3 text-sm font-semibold text-zinc-900 hover:bg-zinc-50"
              >
                View Leaderboard
              </Link>
            </div>
          </div>

          <div className="mt-6 flex flex-col md:flex-row md:items-start md:justify-between gap-4">
            <div>
              <div className="text-sm text-zinc-500">Cask Unknown</div>
              <div className="text-3xl font-extrabold tracking-tight mt-2">Your Profile</div>
              <div className="text-sm text-zinc-500 mt-2">
                Active profile: <span className="font-semibold text-zinc-900">{displayProfileName}</span>
              </div>
              <div className="text-xs text-zinc-500 mt-2">
                {isOwner
                  ? "This profile follows the same hard-coded name across all sessions."
                  : "This name comes from your account profile and is used as your blind tasting identity."}
              </div>
            </div>

            {isOwner ? (
              <div className="w-full md:w-auto">
                <label className="text-sm font-semibold text-zinc-800">
                  Switch profile
                  <select
                    value={activeProfile}
                    onChange={(e) => setActiveProfile(e.target.value)}
                    className="mt-2 w-full md:w-[220px] rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                  >
                    {profileOptions.map((profile) => (
                      <option key={profile} value={profile}>
                        {profile}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            ) : (
              <div className="w-full md:w-auto rounded-2xl border border-zinc-200 bg-[#F8F8F6] px-4 py-3">
                <div className="text-xs text-zinc-500">Display name</div>
                <div className="mt-1 font-semibold text-zinc-900">
                  {displayProfileName}
                </div>
              </div>
            )}
          </div>

          {!history.length ? (
            <div className="mt-6 rounded-3xl border border-zinc-200 p-6">
              <div className="text-lg font-semibold">No blind ratings yet for {activeProfile}.</div>
              <div className="mt-2 text-sm text-zinc-500">
                Join a tasting with this profile name and the history will build automatically.
              </div>
            </div>
          ) : (
            <>
              <div className="mt-6 grid grid-cols-2 md:grid-cols-3 gap-3">
                <div className="rounded-2xl border border-zinc-200 bg-[#F8F8F6] px-4 py-3">
                  <div className="text-xs text-zinc-500">Overall Avg</div>
                  <div className="text-2xl font-extrabold tabular-nums">{overallAverage.toFixed(1)}</div>
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

              <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="rounded-3xl border border-zinc-200 p-5">
                  <div className="text-sm text-zinc-500">Top 5 Highest Rated</div>
                  <div className="mt-4 space-y-3">
                    {topFive.map((row) => (
                      <div
                        key={`top-${row.id}`}
                        className="flex items-center justify-between gap-3 rounded-2xl bg-[#F8F8F6] border border-zinc-200 px-4 py-3"
                      >
                        <div>
                          <div className="font-semibold">{row.pourLabel}</div>
                          <div className="text-xs text-zinc-500">{row.sessionTitle}</div>
                        </div>
                        <div className="text-xl font-extrabold tabular-nums">{row.total.toFixed(0)}</div>
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
                        className="flex items-center justify-between gap-3 rounded-2xl bg-[#F8F8F6] border border-zinc-200 px-4 py-3"
                      >
                        <div>
                          <div className="font-semibold">{row.pourLabel}</div>
                          <div className="text-xs text-zinc-500">{row.sessionTitle}</div>
                        </div>
                        <div className="text-xl font-extrabold tabular-nums">{row.total.toFixed(0)}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="mt-6 rounded-3xl border border-zinc-200 p-5">
                <div className="text-sm text-zinc-500">Personal Averages By Category</div>
                <div className="mt-4 grid grid-cols-2 md:grid-cols-5 gap-3">
                  {CATEGORY.map((c) => (
                    <div key={c.key} className="rounded-2xl bg-[#F8F8F6] border border-zinc-200 px-4 py-3">
                      <div className="text-xs text-zinc-500">{c.label}</div>
                      <div className="text-2xl font-extrabold tabular-nums">
                        {categoryAverages[c.key].toFixed(1)}
                        <span className="text-xs text-zinc-400 font-semibold">/{c.max}</span>
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
                <div className="text-3xl font-extrabold tracking-tight mt-2">Complete Rating History</div>
                <div className="text-xs text-zinc-500 mt-1">
                  Blind and Rate Mode entries, sorted by the metric you choose.
                </div>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <Link
                  href="/rate/new"
                  className="inline-flex items-center justify-center rounded-2xl px-5 py-3 font-semibold bg-zinc-900 text-white hover:bg-zinc-800"
                >
                  Rate Now
                </Link>

                <label className="text-sm font-semibold text-zinc-800">
                  Sort by{" "}
                  <select
                    value={sortKey}
                    onChange={(e) => setSortKey(e.target.value as SortKey)}
                    className="ml-2 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                  >
                    <option value="total">Overall Rating</option>
                    {CATEGORY.map((c) => (
                      <option key={c.key} value={c.key}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </div>

            {rateError ? (
              <div className="mt-6 rounded-3xl border border-red-200 bg-red-50 px-6 py-5">
                <div className="font-semibold text-red-700">Could not load Rate Mode history</div>
                <div className="mt-1 text-sm text-red-600">{rateError}</div>
              </div>
            ) : null}

            {rateLoading ? (
              <div className="mt-4 text-sm text-zinc-500">Loading Rate Mode entries...</div>
            ) : null}

            {sortedHistory.length === 0 && !rateLoading ? (
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

                  return (
                    <div key={row.id} className="rounded-2xl bg-[#F8F8F6] border border-zinc-200 px-4 py-4">
                      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
                        <div>
                          <div className="font-semibold">{row.pourLabel}</div>
                          <div className="text-xs text-zinc-500 mt-1">
                            {row.sessionTitle} - Rated {isRateMode ? formatDateTime(row.createdAt) : formatDate(row.createdAt)}
                          </div>
                          {row.notes ? (
                            <div className="mt-2 text-sm text-zinc-600">
                              <span className="font-semibold text-zinc-800">Notes:</span> {row.notes}
                            </div>
                          ) : null}
                        </div>
                        <div className="flex items-start gap-3">
                          <div className="text-right">
                            <div className="text-2xl font-extrabold tabular-nums">
                              {isRateMode ? row.total.toFixed(1) : row.total.toFixed(0)}
                            </div>
                            <div className="text-xs text-zinc-500">Overall / 100</div>
                          </div>

                          {isRateMode ? (
                            <Link
                              href={`/rate/${row.id}`}
                              className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-900 hover:bg-zinc-50"
                            >
                              View
                            </Link>
                          ) : (
                            <button
                              onClick={() => handleViewBlindRating(row)}
                              className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-900 hover:bg-zinc-50"
                            >
                              View
                            </button>
                          )}

                          {isRateMode ? (
                            <button
                              onClick={() => handleDeleteRateRating(row.id, row.pourLabel)}
                              className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-red-600 hover:bg-zinc-50"
                            >
                              Delete
                            </button>
                          ) : (
                            <button
                              onClick={() => handleDeleteRating(row)}
                              className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-red-600 hover:bg-zinc-50"
                            >
                              Delete
                            </button>
                          )}

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
