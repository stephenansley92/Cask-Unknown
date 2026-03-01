import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  getDefaultRateTemplateWithItems,
  type RateTemplateItem,
} from "@/lib/rate/default-template";
import { RateNewForm } from "./rate-new-form";

type WhiskeyRow = {
  id: string;
  name: string;
  distillery: string | null;
  proof: number | null;
};

export default async function RateNewPage() {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?redirectTo=%2Frate%2Fnew");
  }

  const [{ data: whiskeysData, error: whiskeysError }, templateResult] =
    await Promise.all([
      supabase
        .from("whiskeys")
        .select("id,name,distillery,proof")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false }),
      getDefaultRateTemplateWithItems(supabase, user.id),
    ]);

  if (whiskeysError) {
    throw whiskeysError;
  }

  const whiskeys = ((whiskeysData || []) as WhiskeyRow[]).map((whiskey) => ({
    id: whiskey.id,
    name: whiskey.name,
    distillery: whiskey.distillery ?? null,
    proof:
      typeof whiskey.proof === "number"
        ? whiskey.proof
        : whiskey.proof === null
        ? null
        : Number(whiskey.proof ?? 0),
  }));

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
