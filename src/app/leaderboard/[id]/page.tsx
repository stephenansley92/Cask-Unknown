import Link from "next/link";
import { unstable_noStore as noStore } from "next/cache";
import { notFound } from "next/navigation";
import {
  loadCanonicalPublicRateHistory,
  loadCanonicalProfileDisplayName,
} from "@/lib/profile-history/read-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import ReadOnlyHistorySection from "./read-only-history";

type PublicProfileRow = {
  user_id: string;
  display_name: string | null;
  is_public: boolean;
};

type PublicUserProfilePageProps = {
  params: {
    id: string;
  };
};

export default async function PublicUserProfilePage({
  params,
}: PublicUserProfilePageProps) {
  noStore();
  const viewerSupabase = createSupabaseServerClient();

  const { data: publicProfileData, error: publicProfileError } = await viewerSupabase
    .from("public_profiles")
    .select("user_id,display_name,is_public")
    .eq("user_id", params.id)
    .maybeSingle();

  if (publicProfileError) {
    throw publicProfileError;
  }

  const publicProfile = publicProfileData as PublicProfileRow | null;

  if (!publicProfile || !publicProfile.is_public) {
    notFound();
  }

  const displayName = publicProfile.display_name?.trim() || "Anonymous";
  const readOnlySupabase = viewerSupabase;
  const [canonicalProfileName, publicRateHistory] = await Promise.all([
    loadCanonicalProfileDisplayName(readOnlySupabase, params.id, displayName),
    loadCanonicalPublicRateHistory(readOnlySupabase, params.id),
  ]);

  return (
    <main className="min-h-screen bg-[#F8F8F6] p-4 text-zinc-900 sm:p-6">
      <div className="mx-auto max-w-6xl">
        <div className="rounded-3xl border border-zinc-200 bg-white p-5 shadow-sm md:p-6">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <div className="text-sm text-zinc-500">Public user</div>
              <h1 className="mt-2 text-3xl font-extrabold tracking-tight">
                {displayName}
              </h1>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row">
              <Link
                href="/leaderboard"
                className="inline-flex items-center justify-center rounded-2xl border border-zinc-200 px-4 py-3 text-sm font-semibold text-zinc-900 hover:bg-zinc-50"
              >
                Back to Users
              </Link>
              <Link
                href="/"
                className="inline-flex items-center justify-center rounded-2xl border border-zinc-200 px-4 py-3 text-sm font-semibold text-zinc-900 hover:bg-zinc-50"
              >
                Home
              </Link>
            </div>
          </div>

          <div className="mt-4 text-sm text-zinc-500">
            Active profile:{" "}
            <span className="font-semibold text-zinc-900">{displayName}</span>
          </div>
          <div className="mt-2 text-xs text-zinc-500">
            This name comes from the user&apos;s public profile and is used as their
            blind tasting identity.
          </div>
          <ReadOnlyHistorySection
            userId={params.id}
            displayName={displayName}
            profileName={canonicalProfileName}
            initialRateHistory={publicRateHistory}
          />
        </div>
      </div>
    </main>
  );
}
