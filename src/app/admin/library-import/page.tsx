import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ChevronLeft, Upload } from "lucide-react";
import { Button, buttonStyles } from "@/components/ui/button";
import { Card, Eyebrow } from "@/components/ui/card";
import { Wordmark } from "@/components/ui/brand";
import { Notice } from "@/components/ui/notice";
import { PageShell } from "@/components/ui/page";
import { importCollectionCsvAction } from "./actions";

const OWNER_EMAIL = "stephen.ansley92@gmail.com";

type AdminLibraryImportPageProps = {
  searchParams?: Promise<{
    message?: string;
  }>;
};

export default async function AdminLibraryImportPage({
  searchParams,
}: AdminLibraryImportPageProps) {
  const resolvedSearchParams = await searchParams;
  const supabase = await createSupabaseServerClient();
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
    typeof resolvedSearchParams?.message === "string"
      ? resolvedSearchParams.message
      : "";

  return (
    <PageShell>
      <header className="flex items-center justify-between">
        <Link href="/admin/testers" className={buttonStyles({ variant: "ghost", size: "sm", className: "-ml-3" })}>
          <ChevronLeft className="h-4 w-4" /> Testers
        </Link>
        <Wordmark />
      </header>

      <div className="mt-6 animate-fade-slide-in">
        <Eyebrow>Owner tools</Eyebrow>
        <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight">Import library CSV</h1>
        <p className="mt-1 text-sm text-fg-muted">
          Imports into the shared whiskey library used by Rate Mode and blind pour selection.
        </p>

        {message ? <Notice className="mt-4">{message}</Notice> : null}

        <Card className="mt-6">
          <Eyebrow>Expected columns</Eyebrow>
          <p className="mt-1.5 text-xs text-fg-muted">
            Name, Size, Category, Subcategory, Proof, Rarity, Distillery, MSRP, Secondary, Paid,
            Status, Notes
          </p>

          <form action={importCollectionCsvAction} className="mt-4 space-y-3">
            <input
              name="file"
              type="file"
              accept=".csv,text/csv"
              required
              aria-label="Library CSV file"
              className="block w-full rounded-2xl border border-dashed border-line-strong bg-sunken px-4 py-3 text-sm text-fg-muted file:mr-3 file:rounded-xl file:border-0 file:bg-raised file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-fg"
            />
            <Button type="submit" variant="primary" block>
              <Upload className="h-4 w-4" /> Import CSV
            </Button>
          </form>
        </Card>
      </div>
    </PageShell>
  );
}
