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

async function loadWhiskeysForRate(
  supabase: ReturnType<typeof createSupabaseServerClient>
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

export default async function RateNewPage() {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?redirectTo=%2Frate%2Fnew");
  }

  const [whiskeys, templateResult] =
    await Promise.all([
      loadWhiskeysForRate(supabase),
      getDefaultRateTemplateWithItems(supabase, user.id),
    ]);

  const templateItems = [...templateResult.items].sort(
    (a: RateTemplateItem, b: RateTemplateItem) => a.sortOrder - b.sortOrder
  );

  return (
    <main className="min-h-screen bg-[#F8F8F6] text-zinc-900 p-4 sm:p-6">
      <div className="max-w-3xl mx-auto">
        <div className="bg-white border border-zinc-200 rounded-3xl p-5 md:p-6 shadow-sm">
          <div className="text-sm text-zinc-500">Cask Unknown</div>
          <h1 className="text-3xl font-extrabold tracking-tight mt-2">
            Rate New
          </h1>
          <p className="text-sm text-zinc-500 mt-3">
            Pick a whiskey, score it with the default Blind Mode template, and
            save it to your personal history.
          </p>

          <div className="mt-6">
            <RateNewForm
              userId={user.id}
              initialWhiskeys={whiskeys}
              template={templateResult.template}
              items={templateItems}
            />
          </div>
        </div>
      </div>
    </main>
  );
}
