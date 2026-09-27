"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { isAuthSessionMissingError } from "@supabase/supabase-js";
import { ACTIVE_PROFILE_STORAGE_KEY, BASE_PROFILES, getProfileOptions } from "@/lib/profiles";
import {
  buildWhiskeyIdentityKey,
  buildWhiskeyInsertPayload,
  EMPTY_WHISKEY_FORM_VALUES,
  type WhiskeyFormValues,
} from "@/lib/whiskey/schema";
import { getCsvValue, normalizeHeader, parseCsv } from "@/lib/csv";
import {
  buildCanonicalProfileHistoryView,
  loadCanonicalBlindHistory,
  loadCanonicalRateHistory,
  type HistoryRow,
  type RateHistoryRow,
  type SortKey,
} from "@/lib/profile-history/read-only";
import {
  ChevronDown,
  Download,
  Globe,
  LogOut,
  ShieldCheck,
  Star,
  Trophy,
  Upload,
} from "lucide-react";
import {
  CategoryAverages,
  HistoryEntryBody,
  HistoryEntryLink,
  HistoryList,
  HistorySortSelect,
  RankedPours,
  StatTiles,
} from "@/components/history/profile-history";
import { Button, buttonStyles } from "@/components/ui/button";
import { Card, Eyebrow } from "@/components/ui/card";
import { LoadingDots, LoadingScreen, Wordmark } from "@/components/ui/brand";
import { cx } from "@/components/ui/cx";
import { FieldLabel, inputStyles } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { PageShell } from "@/components/ui/page";
import { StatusPill } from "@/components/ui/status-pill";
import { TabBar } from "@/components/ui/tab-bar";
import { Toast, useToast } from "@/components/ui/toast";

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

function toNumberOrNull(value: unknown) {
  if (value === null || value === undefined) return null;
  const raw = typeof value === "string" ? value.trim() : value;
  if (raw === "") return null;

  const parsed = Number(raw);
  if (Number.isNaN(parsed)) return null;
  return parsed;
}

function shouldFillText(existing: string | null, incoming: string | null) {
  return (!existing || !existing.trim()) && Boolean(incoming && incoming.trim());
}

function shouldFillNumber(existing: number | null, incoming: number | null) {
  return (existing === null || existing === undefined) && incoming !== null;
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

export default function ProfilePage() {
  const router = useRouter();
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
  const [publicProfileIsPublic, setPublicProfileIsPublic] = useState(false);
  const [publicProfileError, setPublicProfileError] = useState("");
  const [savingPublicProfile, setSavingPublicProfile] = useState(false);
  const [collectionFile, setCollectionFile] = useState<File | null>(null);
  const [importingCollection, setImportingCollection] = useState(false);
  const [collectionImportMessage, setCollectionImportMessage] = useState("");
  const [collectionImportError, setCollectionImportError] = useState("");
  const toast = useToast();

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

      if (userError && !isAuthSessionMissingError(userError)) {
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
        router.replace("/profile/setup");
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
        setPublicProfileIsPublic(false);
        setProfileResolved(true);
        return;
      }

      if (!existingPublicProfile) {
        // New profiles start private; the user opts into Community
        // visibility explicitly via the toggle below.
        const { error: publicProfileUpsertError } = await authClient
          .from("public_profiles")
          .upsert(
            {
              user_id: user.id,
              display_name: resolvedDisplayName,
              is_public: false,
            },
            {
              onConflict: "user_id",
            }
          );

        if (publicProfileUpsertError) {
          setPublicProfileError(publicProfileUpsertError.message);
          setPublicProfileDisplayName(resolvedDisplayName);
          setPublicProfileIsPublic(false);
          setProfileResolved(true);
          return;
        }

        setPublicProfileDisplayName(resolvedDisplayName);
        setPublicProfileIsPublic(false);
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
  }, [router]);

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

        if (userError && !isAuthSessionMissingError(userError)) throw userError;
        if (!user) {
          setRateHistory([]);
          setRateLoading(false);
          return;
        }
        const rows = await loadCanonicalRateHistory(authClient, user.id);
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
        const rows = await loadCanonicalBlindHistory(supabase, {
          userId: ownerView ? null : authUserId,
          profileName: activeProfile,
          ownerView,
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
      toast.show("Public profile saved.");
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

      if (userError && !isAuthSessionMissingError(userError)) throw userError;
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
        blindHistory: history,
        rateHistory,
        sortKey,
      }),
    [history, rateHistory, sortKey]
  );
  const isOwner = userEmail.trim().toLowerCase() === OWNER_EMAIL;
  const displayProfileName = isOwner
    ? activeProfile
    : userDisplayName || activeProfile;

  const [expandedGroup, setExpandedGroup] = useState<string | null>(null);

  // Group rate-mode entries by whiskey name; blind entries stay as individual items
  const groupedHistory = useMemo(() => {
    type Group = {
      key: string;
      label: string;
      isRate: boolean;
      rows: typeof sortedHistory;
      avgTotal: number;
      latestAt: string;
    };
    const rateGroups = new Map<string, typeof sortedHistory>();
    const rateOrder: string[] = [];
    const result: Group[] = [];

    for (const row of sortedHistory) {
      if (row.sessionId.startsWith("rate:")) {
        const k = row.pourLabel;
        if (!rateGroups.has(k)) {
          rateGroups.set(k, []);
          rateOrder.push(k);
        }
        rateGroups.get(k)!.push(row);
      } else {
        result.push({ key: row.id, label: row.pourLabel, isRate: false, rows: [row], avgTotal: row.total, latestAt: row.createdAt });
      }
    }

    for (const k of rateOrder) {
      const rows = rateGroups.get(k)!;
      const avg = rows.reduce((s, r) => s + r.total, 0) / rows.length;
      result.push({ key: `rate:${k}`, label: k, isRate: true, rows, avgTotal: avg, latestAt: rows[0].createdAt });
    }

    // Re-sort by the same sort key logic (newest first for default, else by score)
    if (sortKey === "recent") {
      result.sort((a, b) => (b.latestAt > a.latestAt ? 1 : -1));
    } else if (sortKey === "total") {
      result.sort((a, b) => b.avgTotal - a.avgTotal);
    }

    return result;
  }, [sortedHistory, sortKey]);

  const blindSessionGroups = useMemo(() => {
    const groups = new Map<
      string,
      {
        sessionId: string;
        title: string;
        status: string;
        rows: HistoryRow[];
        latestAt: string;
        average: number;
      }
    >();

    for (const row of history) {
      const existing = groups.get(row.sessionId);
      const latestAt =
        !existing || new Date(row.createdAt).getTime() > new Date(existing.latestAt).getTime()
          ? row.createdAt
          : existing.latestAt;

      if (!existing) {
        groups.set(row.sessionId, {
          sessionId: row.sessionId,
          title: row.sessionTitle,
          status: row.sessionStatus || "",
          rows: [row],
          latestAt,
          average: row.total,
        });
      } else {
        existing.rows.push(row);
        existing.latestAt = latestAt;
        existing.average =
          existing.rows.reduce((sum, entry) => sum + entry.total, 0) / existing.rows.length;
      }
    }

    return [...groups.values()].sort((a, b) => {
      const bTime = new Date(b.latestAt).getTime();
      const aTime = new Date(a.latestAt).getTime();
      return (Number.isNaN(bTime) ? 0 : bTime) - (Number.isNaN(aTime) ? 0 : aTime);
    });
  }, [history]);

  if (loading || (!profileResolved && !error)) {
    return <LoadingScreen label="Loading profile" />;
  }

  if (error) {
    return (
      <PageShell center>
        <div className="w-full animate-fade-slide-in text-center">
          <Wordmark size="lg" />
          <Notice tone="danger" title="Your profile didn't load" className="mt-8 text-left">
            {error}
          </Notice>
          <Link href="/" className={buttonStyles({ variant: "secondary", size: "lg", block: true, className: "mt-4" })}>
            Back home
          </Link>
        </div>
      </PageShell>
    );
  }

  const returnTo = encodeURIComponent("/profile");
  const ownerQuery = authUserId ? `&owner=${encodeURIComponent(authUserId)}` : "";

  return (
    <PageShell width="md" bottomInset>
      <TabBar />
      <Toast message={toast.message} />

      <div className="animate-fade-slide-in">
        {isOwner && signupToasts.length > 0 ? (
          <div className="mb-4 space-y-2">
            {signupToasts.map((signup) => (
              <Notice
                key={signup.id}
                tone="success"
                title={`New signup: ${signup.newUserEmail}`}
                onDismiss={() =>
                  setSignupToasts((prev) => prev.filter((entry) => entry.id !== signup.id))
                }
              >
                {formatDateTime(signup.createdAt)}
              </Notice>
            ))}
          </div>
        ) : null}

        <header className="flex items-center justify-between">
          <Wordmark />
          <Link href="/rate/new" className={buttonStyles({ variant: "primary", size: "sm" })}>
            <Star className="h-4 w-4" /> Rate a pour
          </Link>
        </header>

        <div className="mt-8 flex items-center gap-4">
          <span
            aria-hidden
            className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-accent-soft font-display text-3xl font-semibold text-accent"
          >
            {displayProfileName.charAt(0).toUpperCase() || "?"}
          </span>
          <div className="min-w-0 flex-1">
            <h1 className="truncate font-display text-3xl font-semibold tracking-tight">{displayProfileName}</h1>
            <p className="mt-0.5 text-sm text-fg-muted">
              {isOwner ? "Viewing a tasting profile" : "Your tasting identity"}
            </p>
          </div>
        </div>

        {isOwner ? (
          <div className="mt-4">
            <FieldLabel htmlFor="profile-switch">Switch profile</FieldLabel>
            <div className="relative">
              <select
                id="profile-switch"
                value={activeProfile}
                onChange={(e) => setActiveProfile(e.target.value)}
                className={inputStyles({ kind: "select", size: "sm" })}
              >
                {profileOptions.map((profile) => (
                  <option key={profile} value={profile}>
                    {profile}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-faint" />
            </div>
          </div>
        ) : null}

        {!combinedHistory.length ? (
          <Card className="mt-6 text-center">
            <div className="font-semibold">No ratings yet</div>
            <p className="mt-1 text-sm text-fg-muted">
              Rate something or join a tasting to start building your history.
            </p>
            <Link href="/rate/new" className={buttonStyles({ variant: "primary", size: "md", className: "mt-4" })}>
              <Star className="h-4 w-4" /> Rate your first pour
            </Link>
          </Card>
        ) : (
          <div className="mt-6 space-y-3">
            <StatTiles overallAverage={overallAverage} ratedCount={ratedCount} sessionCount={sessionCount} />

            <section className="pt-5">
              <div className="flex items-baseline justify-between">
                <Eyebrow>Blind tastings</Eyebrow>
                <span className="text-xs text-fg-faint">
                  {blindSessionGroups.length} session{blindSessionGroups.length === 1 ? "" : "s"}
                </span>
              </div>

              {blindSessionGroups.length ? (
                <ul className="mt-3 space-y-2">
                  {blindSessionGroups.map((group) => {
                    const revealed = group.status.toLowerCase() === "revealed";
                    return (
                      <li key={group.sessionId}>
                        <Card padded={false} className="p-4">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="truncate font-semibold">{group.title}</div>
                              <div className="mt-0.5 text-xs text-fg-faint">
                                {group.rows.length} pour{group.rows.length === 1 ? "" : "s"} · Last scored{" "}
                                {formatDate(group.latestAt)}
                              </div>
                            </div>
                            <div className="shrink-0 text-right">
                              <div className="font-display text-2xl font-semibold tabular-nums">
                                {group.average.toFixed(1)}
                              </div>
                              <div className="text-[11px] text-fg-faint">avg</div>
                            </div>
                          </div>
                          <div className="mt-3 flex items-center gap-2">
                            <StatusPill status={group.status} />
                            <span className="flex-1" />
                            <Link
                              href={`/join/${group.sessionId}`}
                              className={buttonStyles({ variant: "ghost", size: "sm" })}
                            >
                              Reopen scoring
                            </Link>
                            <Link
                              href={`/reveal/${group.sessionId}`}
                              className={buttonStyles({ variant: revealed ? "primary" : "secondary", size: "sm" })}
                            >
                              <Trophy className="h-3.5 w-3.5" /> {revealed ? "Results" : "Reveal"}
                            </Link>
                          </div>
                        </Card>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <Card className="mt-3 text-sm text-fg-muted">
                  Join a blind tasting while signed in and it will show up here.
                </Card>
              )}
            </section>

            <div className="pt-5">
              <RankedPours top={topFive} bottom={bottomFive} />
            </div>
            <CategoryAverages averages={categoryAverages} />
          </div>
        )}

        <section className="mt-8">
          <div className="flex items-center justify-between gap-3">
            <Eyebrow>All ratings</Eyebrow>
            <HistorySortSelect value={sortKey} onChange={setSortKey} />
          </div>

          {rateError ? (
            <Notice tone="danger" title="Could not load Rate Mode history" className="mt-3">
              {rateError}
            </Notice>
          ) : null}

          {rateLoading ? (
            <div className="mt-6 flex justify-center">
              <LoadingDots label="Loading Rate Mode entries" />
            </div>
          ) : null}

          {groupedHistory.length === 0 && !rateLoading ? (
            <Card className="mt-3 text-center text-sm text-fg-muted">Nothing rated yet.</Card>
          ) : groupedHistory.length ? (
            <div className="mt-3">
              <HistoryList>
                {groupedHistory.map((group) => {
                  const isMulti = group.isRate && group.rows.length > 1;
                  const isExpanded = expandedGroup === group.key;

                  const activeCategoryAvg = activeSortCategory
                    ? group.rows.reduce((s, r) => s + (r.byCat[activeSortCategory.key] ?? 0), 0) / group.rows.length
                    : null;
                  const cardScoreText = activeSortCategory && activeCategoryAvg !== null
                    ? `${activeCategoryAvg % 1 === 0 ? activeCategoryAvg.toFixed(0) : activeCategoryAvg.toFixed(1)}/${activeSortCategory.max}`
                    : group.isRate
                      ? group.avgTotal.toFixed(1)
                      : group.rows[0].total.toFixed(0);
                  const cardScoreLabel = activeSortCategory ? activeSortCategory.label : "of 100";

                  // Single entry — link directly to detail page
                  if (!isMulti) {
                    const row = group.rows[0];
                    const detailHref = `/history/${group.isRate ? "rate" : "blind"}/${row.id}?returnTo=${returnTo}${ownerQuery}`;
                    return (
                      <li key={group.key}>
                        <HistoryEntryLink
                          href={detailHref}
                          title={group.label}
                          meta={`${group.isRate ? "Solo rating" : row.sessionTitle} · ${
                            group.isRate ? formatDateTime(row.createdAt) : formatDate(row.createdAt)
                          }`}
                          notes={row.notes}
                          score={cardScoreText}
                          scoreLabel={cardScoreLabel}
                          rateMode={group.isRate}
                        />
                      </li>
                    );
                  }

                  // Multiple rate-mode entries — grouped row with expand/collapse
                  return (
                    <li key={group.key}>
                      <button
                        type="button"
                        onClick={() => setExpandedGroup(isExpanded ? null : group.key)}
                        aria-expanded={isExpanded}
                        className="flex w-full items-start gap-3 px-4 py-3.5 text-left hover:bg-raised"
                      >
                        <HistoryEntryBody
                          title={group.label}
                          meta={`Rated ${group.rows.length}× · average shown`}
                          score={cardScoreText}
                          scoreLabel={cardScoreLabel}
                          rateMode
                        />
                        <ChevronDown
                          className={cx(
                            "mt-1 h-4 w-4 shrink-0 text-fg-faint transition-transform",
                            isExpanded && "rotate-180",
                          )}
                        />
                      </button>

                      {isExpanded ? (
                        <ul className="border-t border-line bg-sunken">
                          {group.rows.map((row, i) => (
                            <li key={row.id} className="border-b border-line last:border-b-0">
                              <Link
                                href={`/history/rate/${row.id}?returnTo=${returnTo}${ownerQuery}`}
                                className="flex items-start justify-between gap-3 py-3 pl-8 pr-4 hover:bg-raised"
                              >
                                <span className="min-w-0">
                                  <span className="block text-xs text-fg-faint">
                                    Rating {i + 1} · {formatDateTime(row.createdAt)}
                                  </span>
                                  <span
                                    className={cx(
                                      "mt-1 line-clamp-2 block text-sm",
                                      row.notes ? "text-fg-muted" : "italic text-fg-faint",
                                    )}
                                  >
                                    {row.notes || "No notes"}
                                  </span>
                                </span>
                                <span className="shrink-0 font-display text-xl font-semibold tabular-nums">
                                  {row.total.toFixed(1)}
                                </span>
                              </Link>
                            </li>
                          ))}
                        </ul>
                      ) : null}
                    </li>
                  );
                })}
              </HistoryList>
            </div>
          ) : null}
        </section>

        <section className="mt-10 space-y-3">
          <Eyebrow>Settings</Eyebrow>

          <Card>
            <div className="flex items-start gap-3">
              <Globe className="mt-0.5 h-5 w-5 shrink-0 text-accent" />
              <div>
                <div className="font-semibold">Community visibility</div>
                <p className="mt-1 text-sm text-fg-muted">
                  Your profile is private by default. Turning this on lists you on the Community
                  leaderboard and makes your tasting history — including scores and written notes —
                  visible to anyone with the link.
                </p>
              </div>
            </div>

            <div className="mt-4">
              <FieldLabel htmlFor="public-name">Public display name</FieldLabel>
              <input
                id="public-name"
                value={publicProfileDisplayName}
                onChange={(e) => setPublicProfileDisplayName(e.target.value)}
                readOnly={!isOwner}
                disabled={!isOwner}
                className={inputStyles({ size: "sm" })}
                placeholder="Display name"
              />
              {!isOwner ? (
                <p className="mt-1.5 text-xs text-fg-faint">
                  Display name is locked after setup. Only the admin can change it.
                </p>
              ) : null}
            </div>

            <button
              type="button"
              role="switch"
              aria-checked={publicProfileIsPublic}
              onClick={() => setPublicProfileIsPublic((v) => !v)}
              className="mt-3 flex w-full items-center justify-between gap-4 rounded-2xl border border-line bg-sunken px-4 py-3 text-left hover:border-line-strong"
            >
              <span className="text-sm font-semibold">Show on Community</span>
              <span
                aria-hidden
                className={cx(
                  "relative h-7 w-12 shrink-0 rounded-full transition-colors",
                  publicProfileIsPublic ? "bg-accent" : "bg-line-strong",
                )}
              >
                <span
                  className={cx(
                    "absolute top-1 h-5 w-5 rounded-full bg-fg shadow transition-transform",
                    publicProfileIsPublic ? "translate-x-6" : "translate-x-1",
                  )}
                />
              </span>
            </button>

            {publicProfileError ? (
              <Notice tone="danger" className="mt-3">
                {publicProfileError}
              </Notice>
            ) : null}

            <div className="mt-4 flex gap-2">
              <Button
                variant="primary"
                className="flex-1"
                onClick={handleSavePublicProfile}
                disabled={savingPublicProfile}
              >
                {savingPublicProfile ? "Saving…" : "Save"}
              </Button>
              <Link href="/leaderboard" className={buttonStyles({ variant: "secondary", className: "flex-1" })}>
                View Community
              </Link>
            </div>
          </Card>

          <Card>
            <div className="flex items-start gap-3">
              <Upload className="mt-0.5 h-5 w-5 shrink-0 text-accent" />
              <div>
                <div className="font-semibold">Import your collection</div>
                <p className="mt-1 text-sm text-fg-muted">
                  Fill in the CSV template, then upload it. Empty rows are ignored and duplicates are
                  skipped or safely enriched.
                </p>
                <p className="mt-1.5 text-xs text-fg-faint">
                  Columns: Name, Size, Category, Subcategory, Proof, Rarity, Distillery, MSRP,
                  Secondary, Paid, Status, Notes
                </p>
              </div>
            </div>

            <form onSubmit={handleImportCollectionCsv} className="mt-4 space-y-3">
              <input
                name="file"
                type="file"
                accept=".csv,text/csv"
                aria-label="Collection CSV file"
                onChange={(e) => setCollectionFile(e.target.files?.[0] || null)}
                className="block w-full rounded-2xl border border-dashed border-line-strong bg-sunken px-4 py-3 text-sm text-fg-muted file:mr-3 file:rounded-xl file:border-0 file:bg-raised file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-fg"
              />

              <div className="flex gap-2">
                <Button type="submit" variant="primary" className="flex-1" disabled={importingCollection}>
                  {importingCollection ? "Uploading…" : "Upload CSV"}
                </Button>
                <Button variant="secondary" className="flex-1" onClick={handleDownloadCollectionTemplate}>
                  <Download className="h-4 w-4" /> Template
                </Button>
              </div>
            </form>

            {collectionImportError ? (
              <Notice tone="danger" className="mt-3">
                {collectionImportError}
              </Notice>
            ) : null}

            {collectionImportMessage ? (
              <Notice tone="success" className="mt-3">
                {collectionImportMessage}
              </Notice>
            ) : null}
          </Card>

          <Card>
            <Eyebrow>Signed in as</Eyebrow>
            <div className="mt-1.5 truncate font-semibold">{userEmail || "Signed-in user"}</div>
            <Button
              variant="ghostDanger"
              block
              className="mt-3"
              onClick={async () => {
                setSigningOut(true);
                const authClient = createSupabaseBrowserClient();
                await authClient.auth.signOut();
                // Full page load on purpose: drops the signed-out session's client state and cached pages.
                // eslint-disable-next-line @next/next/no-location-assign-relative-destination
                window.location.href = "/login?message=Signed%20out.";
              }}
              disabled={signingOut}
            >
              <LogOut className="h-4 w-4" /> {signingOut ? "Signing out…" : "Sign out"}
            </Button>
          </Card>

          {isOwner ? (
            <Link href="/admin/testers" className={buttonStyles({ variant: "ghost", size: "sm" })}>
              <ShieldCheck className="h-4 w-4" /> Admin
            </Link>
          ) : null}
        </section>
      </div>
    </PageShell>
  );
}
