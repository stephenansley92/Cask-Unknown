import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { safeInternalPath } from "@/lib/redirects";
import { Button, buttonStyles } from "@/components/ui/button";
import { Card, Eyebrow } from "@/components/ui/card";
import { Wordmark } from "@/components/ui/brand";
import { FieldLabel, inputStyles } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { PageShell } from "@/components/ui/page";
import { signInAction, signOutAction, signUpAction } from "./actions";

type LoginPageProps = {
  searchParams?: Promise<{
    message?: string;
    redirectTo?: string;
  }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const resolvedSearchParams = await searchParams;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const message =
    typeof resolvedSearchParams?.message === "string"
      ? resolvedSearchParams.message
      : "";
  const redirectTo = safeInternalPath(resolvedSearchParams?.redirectTo);

  return (
    <PageShell center>
      <div className="w-full animate-fade-slide-in">
        <div className="text-center">
          <Link href="/" aria-label="Cask Unknown home">
            <Wordmark size="lg" />
          </Link>
          <p className="mt-3 text-fg-muted">
            {user ? "You're signed in." : "Sign in to track your pours and see where you stack up."}
          </p>
        </div>

        {message ? <Notice className="mt-6">{message}</Notice> : null}

        {user ? (
          <div className="mt-6 space-y-3">
            <Card>
              <Eyebrow>Signed in as</Eyebrow>
              <div className="mt-1.5 truncate font-semibold">{user.email || "Authenticated user"}</div>
            </Card>

            <Link href="/" className={buttonStyles({ variant: "primary", size: "lg", block: true })}>
              Back home
            </Link>

            <form action={signOutAction}>
              <Button type="submit" variant="ghostDanger" size="md" block>
                Sign out
              </Button>
            </form>
          </div>
        ) : (
          <Card className="mt-6">
            <form className="space-y-4">
              <input type="hidden" name="redirectTo" value={redirectTo} />

              <div>
                <FieldLabel htmlFor="email">Email</FieldLabel>
                <input
                  id="email"
                  name="email"
                  type="email"
                  required
                  autoComplete="email"
                  className={inputStyles()}
                  placeholder="you@example.com"
                />
              </div>

              <div>
                <FieldLabel htmlFor="password">Password</FieldLabel>
                <input
                  id="password"
                  name="password"
                  type="password"
                  required
                  autoComplete="current-password"
                  className={inputStyles()}
                  placeholder="Minimum 6 characters"
                />
              </div>

              <div className="space-y-2 pt-1">
                <Button type="submit" formAction={signInAction} variant="primary" size="lg" block>
                  Sign in
                </Button>
                <Button type="submit" formAction={signUpAction} variant="secondary" size="lg" block>
                  Create account
                </Button>
              </div>
            </form>
          </Card>
        )}

        {user ? null : (
          <Link href="/" className={buttonStyles({ variant: "ghost", size: "md", block: true, className: "mt-3" })}>
            Back home
          </Link>
        )}
      </div>
    </PageShell>
  );
}
