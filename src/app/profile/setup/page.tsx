import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { safeInternalPath } from "@/lib/redirects";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Wordmark } from "@/components/ui/brand";
import { FieldLabel, inputStyles } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { PageShell } from "@/components/ui/page";
import { saveProfileSetupAction } from "./actions";

type ProfileSetupPageProps = {
  searchParams?: Promise<{
    message?: string;
    redirectTo?: string;
  }>;
};

export default async function ProfileSetupPage({
  searchParams,
}: ProfileSetupPageProps) {
  const resolvedSearchParams = await searchParams;
  const redirectTo = safeInternalPath(resolvedSearchParams?.redirectTo);

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    const setupPath = redirectTo
      ? `/profile/setup?redirectTo=${encodeURIComponent(redirectTo)}`
      : "/profile/setup";
    redirect(`/login?redirectTo=${encodeURIComponent(setupPath)}`);
  }

  const { data: existingProfile } = await supabase
    .from("user_profiles")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (existingProfile) {
    redirect(redirectTo || "/profile");
  }

  const message =
    typeof resolvedSearchParams?.message === "string"
      ? resolvedSearchParams.message
      : "";

  return (
    <PageShell center>
      <div className="w-full animate-fade-slide-in">
        <div className="text-center">
          <Wordmark size="lg" />
          <h1 className="mt-6 font-display text-2xl font-semibold tracking-tight">What should we call you?</h1>
          <p className="mt-1 text-sm text-fg-muted">
            Your name shows up on reveals, leaderboards, and your public profile.
          </p>
        </div>

        {message ? (
          <Notice tone="danger" className="mt-6">
            {message}
          </Notice>
        ) : null}

        <Card className="mt-6">
          <form action={saveProfileSetupAction} className="space-y-4">
            <input type="hidden" name="redirectTo" value={redirectTo} />
            <div>
              <FieldLabel htmlFor="displayName">Display name</FieldLabel>
              <input
                id="displayName"
                name="displayName"
                type="text"
                required
                autoFocus
                maxLength={80}
                autoComplete="nickname"
                className={inputStyles()}
                placeholder="Your tasting name"
              />
            </div>

            <Button type="submit" variant="primary" size="lg" block>
              Save &amp; continue
            </Button>
          </form>
        </Card>
      </div>
    </PageShell>
  );
}
