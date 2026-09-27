import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  getDefaultRateTemplateWithItems,
  type RateTemplateItem,
} from "@/lib/rate/default-template";
import {
  mapWhiskeyRow,
  WHISKEY_SELECT_COLUMNS,
} from "@/lib/whiskey/schema";
import { RateNewForm } from "./rate-new-form";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { buttonStyles } from "@/components/ui/button";
import { Eyebrow } from "@/components/ui/card";
import { Wordmark } from "@/components/ui/brand";
import { PageShell } from "@/components/ui/page";

async function loadWhiskeysForRate(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>
) {
  const selectAttempts = [
    WHISKEY_SELECT_COLUMNS,
    "id,name,distillery,proof,bottle_size,category,subcategory,rarity,msrp,secondary,paid,status,notes,identity_key",
    "id,name,distillery,proof,age",
    "id,name,distillery,proof",
    "id,name",
  ];

  let lastError: Error | null = null;

  for (const selectColumns of selectAttempts) {
    const { data, error } = await supabase
      .from("whiskeys")
      .select(selectColumns)
      .order("created_at", { ascending: false });

    if (!error) {
      return ((data || []) as unknown as Record<string, unknown>[]).map(
        mapWhiskeyRow
      );
    }

    lastError = error;
  }

  if (lastError) {
    throw lastError;
  }

  return [];
}

type RateNewPageProps = { searchParams?: Promise<{ whiskey?: string }> };

export default async function RateNewPage({ searchParams }: RateNewPageProps) {
  const requestedWhiskeyId = (await searchParams)?.whiskey ?? "";
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    const back = requestedWhiskeyId ? `/rate/new?whiskey=${encodeURIComponent(requestedWhiskeyId)}` : "/rate/new";
    redirect(`/login?redirectTo=${encodeURIComponent(back)}`);
  }

  const [whiskeys, templateResult, flavorTagProbe] =
    await Promise.all([
      loadWhiskeysForRate(supabase),
      getDefaultRateTemplateWithItems(supabase, user.id),
      // Errors until the reveal-night migration adds the column.
      supabase.from("ratings").select("flavor_tags").limit(0),
    ]);

  const templateItems = [...templateResult.items].sort(
    (a: RateTemplateItem, b: RateTemplateItem) => a.sortOrder - b.sortOrder
  );

  return (
    <PageShell bottomInset>
      <header className="flex items-center justify-between">
        <Link href="/rate" className={buttonStyles({ variant: "ghost", size: "sm", className: "-ml-3" })}>
          <ChevronLeft className="h-4 w-4" /> Ratings
        </Link>
        <Wordmark />
      </header>

      {/* No entrance animation here: a transformed ancestor would pin the form's fixed action bar to this div instead of the viewport. */}
      <div className="mt-6">
        <Eyebrow>Solo rating</Eyebrow>
        <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight">Rate a pour</h1>
        <p className="mt-1 text-sm text-fg-muted">
          Pick a whiskey, score it on the same ten categories as a blind tasting, and save it to your
          history.
        </p>

        <div className="mt-6">
          <RateNewForm
            userId={user.id}
            initialWhiskeys={whiskeys}
            template={templateResult.template}
            items={templateItems}
            flavorTagsEnabled={!flavorTagProbe.error}
            initialWhiskeyId={requestedWhiskeyId}
          />
        </div>
      </div>
    </PageShell>
  );
}
