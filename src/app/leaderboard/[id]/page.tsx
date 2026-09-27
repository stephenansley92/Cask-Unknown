import Link from "next/link";
import { unstable_noStore as noStore } from "next/cache";
import { notFound } from "next/navigation";
import {
  loadCanonicalPublicRateHistory,
  loadCanonicalProfileDisplayName,
} from "@/lib/profile-history/read-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ChevronLeft } from "lucide-react";
import { buttonStyles } from "@/components/ui/button";
import { Eyebrow } from "@/components/ui/card";
import { Wordmark } from "@/components/ui/brand";
import { PageShell } from "@/components/ui/page";
import { TabBar } from "@/components/ui/tab-bar";
import ReadOnlyHistorySection from "./read-only-history";

type PublicProfileRow = {
  user_id: string;
  display_name: string | null;
  is_public: boolean;
};

type PublicUserProfilePageProps = {
  params: Promise<{
    id: string;
  }>;
};

export default async function PublicUserProfilePage({
  params,
}: PublicUserProfilePageProps) {
  noStore();
  const { id } = await params;
  const viewerSupabase = await createSupabaseServerClient();

  const { data: publicProfileData, error: publicProfileError } = await viewerSupabase
    .from("public_profiles")
    .select("user_id,display_name,is_public")
    .eq("user_id", id)
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
    loadCanonicalProfileDisplayName(readOnlySupabase, id, displayName),
    loadCanonicalPublicRateHistory(readOnlySupabase, id),
  ]);

  return (
    <PageShell width="md" bottomInset>
      <TabBar />
      <header className="flex items-center justify-between">
        <Link href="/leaderboard" className={buttonStyles({ variant: "ghost", size: "sm", className: "-ml-3" })}>
          <ChevronLeft className="h-4 w-4" /> Community
        </Link>
        <Wordmark />
      </header>

      <div className="mt-6 flex items-center gap-4 animate-fade-slide-in">
        <span
          aria-hidden
          className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-accent-soft font-display text-3xl font-semibold text-accent"
        >
          {displayName.charAt(0).toUpperCase()}
        </span>
        <div className="min-w-0">
          <Eyebrow>Public profile</Eyebrow>
          <h1 className="mt-1 truncate font-display text-3xl font-semibold tracking-tight">{displayName}</h1>
        </div>
      </div>

      <ReadOnlyHistorySection
        userId={id}
        displayName={displayName}
        profileName={canonicalProfileName}
        initialRateHistory={publicRateHistory}
      />
    </PageShell>
  );
}
