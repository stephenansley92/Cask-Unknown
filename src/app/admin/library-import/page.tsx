import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { importCollectionCsvAction } from "./actions";

const OWNER_EMAIL = "stephen.ansley92@gmail.com";

type AdminLibraryImportPageProps = {
  searchParams?: {
    message?: string;
  };
};

export default async function AdminLibraryImportPage({
  searchParams,
}: AdminLibraryImportPageProps) {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?redirectTo=%2Fadmin%2Flibrary-import");
  }

  if ((user.email || "").trim().toLowerCase() !== OWNER_EMAIL) {
    redirect("/profile");
  }

  const message =
    typeof searchParams?.message === "string" ? searchParams.message : "";

  return (
    <main className="min-h-screen bg-[#F8F8F6] text-zinc-900 p-4 sm:p-6">
      <div className="mx-auto max-w-3xl">
        <div className="rounded-3xl border border-zinc-200 bg-white p-5 shadow-sm md:p-6">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <div className="text-sm text-zinc-500">Owner Tools</div>
              <h1 className="mt-2 text-3xl font-extrabold tracking-tight">
                Import Collection CSV
              </h1>
              <p className="mt-2 text-sm text-zinc-500">
                Imports into the shared whiskey library used by Rate and Blind
                selection.
              </p>
            </div>

            <Link
              href="/admin/testers"
              className="inline-flex items-center justify-center rounded-2xl border border-zinc-200 px-4 py-3 text-sm font-semibold text-zinc-900 hover:bg-zinc-50"
            >
              Back to Testers
            </Link>
          </div>

          {message ? (
            <div className="mt-4 rounded-2xl border border-zinc-200 bg-[#F8F8F6] px-4 py-3 text-sm text-zinc-700">
              {message}
            </div>
          ) : null}

          <div className="mt-6 rounded-3xl border border-zinc-200 p-5">
            <div className="text-sm font-semibold text-zinc-800">
              Expected Columns
            </div>
            <div className="mt-2 text-xs text-zinc-500">
              Name, Size, Category, Subcategory, Proof, Rarity, Distillery,
              MSRP, Secondary, Paid, Status, Notes
            </div>

            <form action={importCollectionCsvAction} className="mt-4 space-y-3">
              <input
                name="file"
                type="file"
                accept=".csv,text/csv"
                required
                className="block w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-900"
              />
              <button
                type="submit"
                className="rounded-2xl bg-zinc-900 px-5 py-3 text-sm font-semibold text-white hover:bg-zinc-800"
              >
                Import CSV
              </button>
            </form>
          </div>
        </div>
      </div>
    </main>
  );
}
