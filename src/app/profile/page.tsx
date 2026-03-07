"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { ACTIVE_PROFILE_STORAGE_KEY, BASE_PROFILES, getProfileOptions } from "@/lib/profiles";
import {
  buildWhiskeyIdentityKey,
  buildWhiskeyInsertPayload,
  EMPTY_WHISKEY_FORM_VALUES,
  type WhiskeyFormValues,
} from "@/lib/whiskey/schema";

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
type SortKey = "recent" | "total" | ScoreCategoryKey;

type HistoryRow = {
  id: string;
  sessionId: string;
  sessionTitle: string;
  pourLabel: string;
  total: number;
  notes: string;
  createdAt: string;
  byCat: Record<string, number | null>;
};

type RateHistoryRow = {
  id: string;
  totalScore: number;
  notes: string;
  createdAt: string;
  whiskeyName: string;
  byCat: Record<string, number | null>;
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

type ExistingWhiskeyRow = {
  id: string;
  user_id: string | null;
  name: string;
  distillery: string | null;
  proof: number | null;
  bottle_size: string | null;
  category: string | null;
  subcategory: string | null;
  rarity: string | null;
  msrp: number | null;
  secondary: number | null;
  paid: number | null;
  status: string | null;
  notes: string | null;
  identity_key: string | null;
};

const OWNER_EMAIL = "stephen.ansley92@gmail.com";
const COLLECTION_CSV_HEADER = [
  "Name",
  "Size",
  "Category",
  "Subcategory",
  "Proof",
  "Rarity",
  "Distillery",
  "MSRP",
  "Secondary",
  "Paid",
  "Status",
  "Notes",
].join(",");
const WHISKEY_IMPORT_SELECT =
  "id,user_id,name,distillery,proof,bottle_size,category,subcategory,rarity,msrp,secondary,paid,status,notes,identity_key";
const WHISKEY_IMPORT_SELECT_ATTEMPTS = [
  WHISKEY_IMPORT_SELECT,
  "id,user_id,name,distillery,proof,bottle_size,identity_key",
  "id,user_id,name,distillery,proof,identity_key",
  "id,user_id,name,identity_key",
];

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

function parseCsv(text: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let index = 0;

  const input = text.replace(/^\uFEFF/, "");

  while (index < input.length) {
    const char = input[index];
    const next = input[index + 1];

    if (inQuotes) {
      if (char === '"' && next === '"') {
        field += '"';
        index += 2;
        continue;
      }

      if (char === '"') {
        inQuotes = false;
        index += 1;
        continue;
      }

      field += char;
      index += 1;
      continue;
    }

    if (char === '"') {
      inQuotes = true;
      index += 1;
      continue;
    }

    if (char === ",") {
      row.push(field);
      field = "";
      index += 1;
      continue;
    }

    if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      index += 1;
      continue;
    }

    if (char === "\r") {
      index += 1;
      continue;
    }

    field += char;
    index += 1;
  }

  row.push(field);
  if (row.some((value) => value.trim().length > 0)) {
    rows.push(row);
  }

  return rows;
}

function normalizeHeader(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function getCsvValue(
  row: string[],
  headerIndexByKey: Map<string, number>,
  key: string
) {
  const index = headerIndexByKey.get(key);
  if (index === undefined || index < 0 || index >= row.length) return "";
  return row[index]?.trim() || "";
}

function shouldFillText(existing: string | null, incoming: string | null) {
  return (!existing || !existing.trim()) && Boolean(incoming && incoming.trim());
}

function shouldFillNumber(existing: number | null, incoming: number | null) {
  return (existing === null || existing === undefined) && incoming !== null;
}

function isUuidLike(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    value
  );
}

function toTextOrNull(value: unknown) {
  if (typeof value !== "string") return null;
  const clean = value.trim();
  return clean ? clean : null;
}

function mapExistingWhiskeyRow(row: Record<string, unknown>): ExistingWhiskeyRow {
  return {
    id: typeof row.id === "string" ? row.id : "",
    user_id: typeof row.user_id === "string" ? row.user_id : null,
    name: typeof row.name === "string" ? row.name : "",
    distillery: toTextOrNull(row.distillery),
    proof: toNumberOrNull(row.proof),
    bottle_size: toTextOrNull(row.bottle_size),
    category: toTextOrNull(row.category),
    subcategory: toTextOrNull(row.subcategory),
    rarity: toTextOrNull(row.rarity),
    msrp: toNumberOrNull(row.msrp),
    secondary: toNumberOrNull(row.secondary),
    paid: toNumberOrNull(row.paid),
    status: toTextOrNull(row.status),
    notes: toTextOrNull(row.notes),
    identity_key: toTextOrNull(row.identity_key),
  };
}

function getUnknownErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  if (
    error &&
    typeof error === "object" &&
    "message" in error &&
    typeof (error as { message?: unknown }).message === "string" &&
    String((error as { message: string }).message).trim()
  ) {
    return String((error as { message: string }).message).trim();
  }
  return fallback;
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

export default function ProfilePage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("recent");
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
  const [collectionFile, setCollectionFile] = useState<File | null>(null);
  const [importingCollection, setImportingCollection] = useState(false);
  const [collectionImportMessage, setCollectionImportMessage] = useState("");
  const [collectionImportError, setCollectionImportError] = useState("");

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
          normalizedEmail === OWNER_EMAIL
            ? publicProfile.display_name?.trim() || resolvedDisplayName
            : resolvedDisplayName
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

        const normalizeScoreMap = (value: unknown): Record<string, number | null> => {
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
              const rawKey =
                row.item_id ?? row.itemId ?? row.id ?? row.key ?? row.item_key;
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
        };

        const withScoresJson = await authClient
          .from("ratings")
          .select("id,total_score,notes,rated_at,template_id,scores_json,whiskey:whiskeys(name)")
          .eq("user_id", user.id)
          .order("rated_at", { ascending: false });

        let ratingsData = withScoresJson.data as Record<string, unknown>[] | null;
        let scoreColumnKey: "scores_json" | "scores" = "scores_json";

        if (withScoresJson.error) {
          const withScores = await authClient
            .from("ratings")
            .select("id,total_score,notes,rated_at,template_id,scores,whiskey:whiskeys(name)")
            .eq("user_id", user.id)
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
          const { data: templateItemsByIdData, error: templateItemsByIdErr } =
            await authClient
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

        const rows = rawRows.map((row) => {
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

        const normalizedEmail = userEmail.trim().toLowerCase();
        const ownerView = normalizedEmail === OWNER_EMAIL;
        let participants: ParticipantRow[] = [];

        if (!ownerView && authUserId) {
          const [
            { data: ownedParticipantsData, error: ownedParticipantsErr },
            { data: legacyParticipantsData, error: legacyParticipantsErr },
          ] = await Promise.all([
            supabase
              .from("participants")
              .select("id,session_id,display_name,user_id")
              .eq("user_id", authUserId),
            supabase
              .from("participants")
              .select("id,session_id,display_name,user_id")
              .eq("display_name", activeProfile)
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
            .eq("display_name", activeProfile);

          if (participantsErr) throw participantsErr;

          participants = (participantsData || []) as ParticipantRow[];
        }

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

          const byCat: Record<string, number | null> = {};
          for (const c of CATEGORY) {
            byCat[c.key] = toNumberOrNull(score[c.key as ScoreCategoryKey]);
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
  }, [activeProfile, authUserId, profileResolved, userEmail]);

  const handleSavePublicProfile = async () => {
    if (!authUserId) {
      setPublicProfileError("Missing authenticated user.");
      return;
    }

    const displayName =
      userEmail.trim().toLowerCase() === OWNER_EMAIL
        ? publicProfileDisplayName.trim()
        : userDisplayName.trim();
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

  const handleDownloadCollectionTemplate = () => {
    const blob = new Blob([`${COLLECTION_CSV_HEADER}\n`], {
      type: "text/csv;charset=utf-8",
    });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "cask-unknown-collection-template.csv";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  };

  const handleImportCollectionCsv = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    if (!collectionFile) {
      setCollectionImportError("Please choose a CSV file.");
      setCollectionImportMessage("");
      return;
    }

    try {
      setImportingCollection(true);
      setCollectionImportError("");
      setCollectionImportMessage("");

      const authClient = createSupabaseBrowserClient();
      const {
        data: { user },
        error: userError,
      } = await authClient.auth.getUser();

      if (userError) throw userError;
      if (!user) {
        throw new Error("Sign in to import your collection.");
      }

      const rawText = await collectionFile.text();
      if (!rawText.trim()) {
        throw new Error("CSV is empty.");
      }

      const rows = parseCsv(rawText);
      if (rows.length < 2) {
        throw new Error("CSV must include a header row and at least one data row.");
      }

      const headers = rows[0].map(normalizeHeader);
      const headerIndexByKey = new Map<string, number>();
      headers.forEach((header, index) => {
        if (!headerIndexByKey.has(header)) {
          headerIndexByKey.set(header, index);
        }
      });

      if (!headerIndexByKey.has("name")) {
        throw new Error("CSV is missing required Name column.");
      }

      let existingDataRaw: Record<string, unknown>[] = [];
      let loadedExistingRows = false;
      let existingLoadError = "";

      for (const selectColumns of WHISKEY_IMPORT_SELECT_ATTEMPTS) {
        const { data, error: existingError } = await authClient
          .from("whiskeys")
          .select(selectColumns);

        if (!existingError) {
          existingDataRaw = (data || []) as Record<string, unknown>[];
          loadedExistingRows = true;
          break;
        }

        existingLoadError =
          existingError.message || "Could not read whiskey library.";
      }

      if (!loadedExistingRows) {
        throw new Error(existingLoadError || "Could not read whiskey library.");
      }

      const existingByKey = new Map<string, ExistingWhiskeyRow>();
      for (const raw of existingDataRaw.map(mapExistingWhiskeyRow)) {
        const key =
          raw.identity_key ||
          buildWhiskeyIdentityKey({
            name: raw.name,
            distillery: raw.distillery,
            proof: raw.proof,
            bottleSize: raw.bottle_size,
          });
        if (key && !existingByKey.has(key)) {
          existingByKey.set(key, raw);
        }
      }

      let inserted = 0;
      let updated = 0;
      let skipped = 0;
      let processedRows = 0;

      for (const row of rows.slice(1)) {
        if (!row.some((value) => value.trim().length > 0)) {
          continue;
        }

        processedRows += 1;
        const whiskeyValues: WhiskeyFormValues = {
          ...EMPTY_WHISKEY_FORM_VALUES,
          name: getCsvValue(row, headerIndexByKey, "name"),
          bottleSize: getCsvValue(row, headerIndexByKey, "size"),
          category: getCsvValue(row, headerIndexByKey, "category"),
          subcategory: getCsvValue(row, headerIndexByKey, "subcategory"),
          proof: getCsvValue(row, headerIndexByKey, "proof"),
          rarity: getCsvValue(row, headerIndexByKey, "rarity"),
          distillery: getCsvValue(row, headerIndexByKey, "distillery"),
          msrp: getCsvValue(row, headerIndexByKey, "msrp"),
          secondary: getCsvValue(row, headerIndexByKey, "secondary"),
          paid: getCsvValue(row, headerIndexByKey, "paid"),
          status: getCsvValue(row, headerIndexByKey, "status"),
          notes: getCsvValue(row, headerIndexByKey, "notes"),
        };

        const payload = buildWhiskeyInsertPayload(whiskeyValues);
        if (!payload.name) {
          skipped += 1;
          continue;
        }

        const identityKey = payload.identity_key || "";
        const existing = identityKey ? existingByKey.get(identityKey) : undefined;

        if (existing) {
          if (existing.user_id !== user.id) {
            skipped += 1;
            continue;
          }

          const patch: Record<string, string | number | null> = {};
          if (shouldFillText(existing.distillery, payload.distillery)) {
            patch.distillery = payload.distillery;
          }
          if (shouldFillNumber(existing.proof, payload.proof)) {
            patch.proof = payload.proof;
          }
          if (shouldFillText(existing.bottle_size, payload.bottle_size)) {
            patch.bottle_size = payload.bottle_size;
          }
          if (shouldFillText(existing.category, payload.category)) {
            patch.category = payload.category;
          }
          if (shouldFillText(existing.subcategory, payload.subcategory)) {
            patch.subcategory = payload.subcategory;
          }
          if (shouldFillText(existing.rarity, payload.rarity)) {
            patch.rarity = payload.rarity;
          }
          if (shouldFillNumber(existing.msrp, payload.msrp)) {
            patch.msrp = payload.msrp;
          }
          if (shouldFillNumber(existing.secondary, payload.secondary)) {
            patch.secondary = payload.secondary;
          }
          if (shouldFillNumber(existing.paid, payload.paid)) {
            patch.paid = payload.paid;
          }
          if (shouldFillText(existing.status, payload.status)) {
            patch.status = payload.status;
          }
          if (shouldFillText(existing.notes, payload.notes)) {
            patch.notes = payload.notes;
          }
          if (!existing.identity_key && identityKey) {
            patch.identity_key = identityKey;
          }

          if (Object.keys(patch).length === 0) {
            skipped += 1;
            continue;
          }

          const { error: updateError } = await authClient
            .from("whiskeys")
            .update(patch)
            .eq("id", existing.id);

          if (updateError) {
            throw new Error(updateError.message || "Could not update whiskey.");
          }

          if (identityKey) {
            existingByKey.set(identityKey, {
              ...existing,
              ...patch,
              identity_key:
                (typeof patch.identity_key === "string" ? patch.identity_key : null) ||
                existing.identity_key,
            });
          }

          updated += 1;
          continue;
        }

        const payloadWithoutAge = Object.fromEntries(
          Object.entries(payload).filter(([key]) => key !== "age")
        );
        const insertAttempts = [
          { user_id: user.id, ...payload },
          { user_id: user.id, ...payloadWithoutAge },
          {
            user_id: user.id,
            name: payload.name,
            distillery: payload.distillery,
            proof: payload.proof,
          },
          {
            user_id: user.id,
            name: payload.name,
          },
        ];

        let insertedRow: ExistingWhiskeyRow | null = null;
        let insertedNew = false;
        let lastInsertError = "";

        for (const insertPayload of insertAttempts) {
          const { error: insertError } = await authClient
            .from("whiskeys")
            .insert(insertPayload);

          if (!insertError) {
            insertedRow = mapExistingWhiskeyRow({
              id: "",
              user_id: user.id,
              name: payload.name,
              distillery: payload.distillery,
              proof: payload.proof,
              bottle_size: payload.bottle_size,
              category: payload.category,
              subcategory: payload.subcategory,
              rarity: payload.rarity,
              msrp: payload.msrp,
              secondary: payload.secondary,
              paid: payload.paid,
              status: payload.status,
              notes: payload.notes,
              identity_key: identityKey || null,
            });
            insertedNew = true;
            break;
          }

          lastInsertError = insertError?.message || "Could not insert whiskey.";
        }

        if (!insertedRow && identityKey) {
          let existingRowData: Record<string, unknown> | null = null;
          let existingRowError = "";

          for (const selectColumns of WHISKEY_IMPORT_SELECT_ATTEMPTS) {
            const result = await authClient
              .from("whiskeys")
              .select(selectColumns)
              .eq("identity_key", identityKey)
              .limit(1)
              .maybeSingle();

            if (!result.error) {
              existingRowData = (result.data || null) as Record<string, unknown> | null;
              existingRowError = "";
              break;
            }

            existingRowError = result.error.message || "Could not read whiskey by identity.";
          }

          if (existingRowData) {
            insertedRow = mapExistingWhiskeyRow(existingRowData);
          } else if (existingRowError) {
            throw new Error(existingRowError);
          }
        }

        if (!insertedRow) {
          if (lastInsertError) {
            throw new Error(lastInsertError);
          }
          skipped += 1;
          continue;
        }

        if (identityKey) {
          existingByKey.set(identityKey, insertedRow);
        }

        if (insertedNew) {
          inserted += 1;
        } else {
          skipped += 1;
        }
      }

      setCollectionImportMessage(
        `Import complete. Rows: ${processedRows}. Inserted: ${inserted}. Updated: ${updated}. Skipped: ${skipped}.`
      );
      setCollectionFile(null);
      form.reset();
    } catch (e: unknown) {
      setCollectionImportError(getUnknownErrorMessage(e, "Could not import collection CSV."));
    } finally {
      setImportingCollection(false);
    }
  };

  const combinedHistory = useMemo(() => {
    return [
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
  }, [history, rateHistory]);

  const sortedHistory = useMemo(() => {
    const rows = [...combinedHistory];
    rows.sort((a, b) => {
      if (sortKey === "recent") {
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
        sortKey === "total"
          ? a.total
          : typeof a.byCat[sortKey] === "number"
            ? (a.byCat[sortKey] as number)
            : Number.NEGATIVE_INFINITY;
      const bValue =
        sortKey === "total"
          ? b.total
          : typeof b.byCat[sortKey] === "number"
            ? (b.byCat[sortKey] as number)
            : Number.NEGATIVE_INFINITY;

      if (bValue !== aValue) return bValue - aValue;
      const aTime = getTimestampMs(a.createdAt);
      const bTime = getTimestampMs(b.createdAt);
      if (bTime !== aTime) return bTime - aTime;
      return b.total - a.total;
    });

    return rows;
  }, [combinedHistory, sortKey]);

  const activeSortCategory = useMemo(() => {
    if (sortKey === "recent" || sortKey === "total") return null;
    return CATEGORY.find((category) => category.key === sortKey) || null;
  }, [sortKey]);

  const categoryAverages = useMemo(() => {
    const out: Record<string, number> = {};

    for (const c of CATEGORY) {
      const values = combinedHistory
        .map((row) => row.byCat[c.key])
        .filter((value): value is number => typeof value === "number");
      out[c.key] = avg(values);
    }

    return out;
  }, [combinedHistory]);

  const overallAverage = useMemo(
    () => avg(combinedHistory.map((row) => row.total)),
    [combinedHistory]
  );
  const topFive = useMemo(
    () => [...combinedHistory].sort((a, b) => b.total - a.total).slice(0, 5),
    [combinedHistory]
  );
  const bottomFive = useMemo(
    () => [...combinedHistory].sort((a, b) => a.total - b.total).slice(0, 5),
    [combinedHistory]
  );
  const ratedCount = combinedHistory.length;
  const sessionCount = useMemo(() => {
    const blindSessions = new Set(
      history.filter((row) => !row.sessionId.startsWith("rate:")).map((row) => row.sessionId)
    ).size;
    return blindSessions + (rateHistory.length > 0 ? 1 : 0);
  }, [history, rateHistory]);
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

            <div className="w-full md:w-auto flex flex-col gap-3">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <Link
                  href="/rate/new"
                  className="inline-flex items-center justify-center rounded-2xl px-5 py-3 font-semibold bg-zinc-900 text-white hover:bg-zinc-800"
                >
                  Rate Now
                </Link>
                <Link
                  href="/"
                  className="inline-flex items-center justify-center rounded-2xl border border-zinc-200 px-5 py-3 text-sm font-semibold text-zinc-900 hover:bg-zinc-50"
                >
                  Home
                </Link>
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
          </div>

          {!combinedHistory.length ? (
            <div className="mt-6 rounded-3xl border border-zinc-200 p-6">
              <div className="text-lg font-semibold">
                No ratings yet for {displayProfileName}.
              </div>
              <div className="mt-2 text-sm text-zinc-500">
                Rate something or join a tasting to start building history.
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
                <label className="text-sm font-semibold text-zinc-800">
                  Sort by{" "}
                  <select
                    value={sortKey}
                    onChange={(e) => setSortKey(e.target.value as SortKey)}
                    className="ml-2 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                  >
                    <option value="recent">Newest First</option>
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
                  const detailMode = isRateMode ? "rate" : "blind";
                  const returnTo = encodeURIComponent("/profile");
                  const ownerQuery = authUserId
                    ? `&owner=${encodeURIComponent(authUserId)}`
                    : "";
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
                      className="block rounded-2xl bg-[#F8F8F6] border border-zinc-200 px-4 py-4 hover:bg-zinc-50 focus:outline-none focus:ring-2 focus:ring-zinc-900/10"
                    >
                      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
                        <div>
                          <div className="font-semibold">{row.pourLabel}</div>
                          <div className="text-xs text-zinc-500 mt-1">
                            {row.sessionTitle} - Rated{" "}
                            {isRateMode
                              ? formatDateTime(row.createdAt)
                              : formatDate(row.createdAt)}
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
                  readOnly={!isOwner}
                  disabled={!isOwner}
                  className="mt-2 w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-zinc-900 disabled:bg-zinc-100 disabled:text-zinc-500"
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

            {!isOwner ? (
              <div className="mt-3 text-xs text-zinc-500">
                Display name is locked after setup. Only the admin can change
                it.
              </div>
            ) : null}

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

          <div className="mt-6 rounded-3xl border border-zinc-200 p-5">
            <div className="text-sm text-zinc-500">Import Whiskey Collection</div>
            <div className="mt-2 text-lg font-semibold text-zinc-900">
              Upload your collection CSV
            </div>
            <div className="mt-2 text-sm text-zinc-500">
              Use the template, then upload your file. Empty rows are ignored
              and duplicate entries are skipped or safely enriched.
            </div>
            <div className="mt-2 text-xs text-zinc-500">
              Expected columns: Name, Size, Category, Subcategory, Proof,
              Rarity, Distillery, MSRP, Secondary, Paid, Status, Notes
            </div>

            <form onSubmit={handleImportCollectionCsv} className="mt-4 space-y-3">
              <input
                name="file"
                type="file"
                accept=".csv,text/csv"
                onChange={(e) => setCollectionFile(e.target.files?.[0] || null)}
                className="block w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-900"
              />

              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <button
                  type="submit"
                  disabled={importingCollection}
                  className="inline-flex items-center justify-center rounded-2xl bg-zinc-900 px-5 py-3 text-sm font-semibold text-white hover:bg-zinc-800 disabled:opacity-60"
                >
                  {importingCollection ? "Uploading..." : "Upload CSV"}
                </button>

                <button
                  type="button"
                  onClick={handleDownloadCollectionTemplate}
                  className="inline-flex items-center justify-center rounded-2xl border border-zinc-200 bg-white px-5 py-3 text-sm font-semibold text-zinc-900 hover:bg-zinc-50"
                >
                  Download Template
                </button>
              </div>
            </form>

            {collectionImportError ? (
              <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {collectionImportError}
              </div>
            ) : null}

            {collectionImportMessage ? (
              <div className="mt-4 rounded-2xl border border-zinc-200 bg-[#F8F8F6] px-4 py-3 text-sm text-zinc-700">
                {collectionImportMessage}
              </div>
            ) : null}
          </div>

          <div className="mt-6 rounded-3xl border border-zinc-200 p-5">
            <div className="text-sm text-zinc-500">Account</div>
            <div className="mt-2 font-semibold text-zinc-900">
              {userEmail || "Signed-in user"}
            </div>
            <div className="mt-3">
              <button
                type="button"
                onClick={async () => {
                  setSigningOut(true);
                  const authClient = createSupabaseBrowserClient();
                  await authClient.auth.signOut();
                  window.location.href = "/login?message=Signed%20out.";
                }}
                disabled={signingOut}
                className="inline-flex items-center justify-center rounded-2xl px-5 py-3 font-semibold bg-zinc-900 text-white hover:bg-zinc-800 disabled:opacity-60"
              >
                {signingOut ? "Signing Out..." : "Sign Out"}
              </button>
            </div>
          </div>


        </div>
      </div>
    </main>
  );
}
