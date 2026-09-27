import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ChevronLeft, Upload, UserPlus } from "lucide-react";
import { Button, buttonStyles } from "@/components/ui/button";
import { Card, Eyebrow } from "@/components/ui/card";
import { cx } from "@/components/ui/cx";
import { inputStyles } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { PageShell } from "@/components/ui/page";
import {
  addTesterByEmailAction,
  saveTesterDisplayNameAction,
} from "./actions";

const OWNER_EMAIL = "stephen.ansley92@gmail.com";

type TesterProfileRow = {
  user_id: string;
  email: string;
  display_name: string;
  created_at: string;
};

type SignupEventRow = {
  new_user_id: string;
  new_user_email: string | null;
  created_at: string;
};

type TesterRow = {
  userId: string;
  email: string;
  displayName: string;
  hasProfile: boolean;
  createdAt: string;
};

type AdminTestersPageProps = {
  searchParams?: Promise<{
    message?: string;
  }>;
};

function formatDateTime(value?: string) {
  if (!value) return "Unknown date";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown date";
  return date.toLocaleString();
}

export default async function AdminTestersPage({
  searchParams,
}: AdminTestersPageProps) {
  const resolvedSearchParams = await searchParams;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?redirectTo=%2Fadmin%2Ftesters");
  }

  if ((user.email || "").trim().toLowerCase() !== OWNER_EMAIL) {
    redirect("/profile");
  }

  const { data: profilesData, error: profilesError } = await supabase
    .from("user_profiles")
    .select("user_id,email,display_name,created_at")
    .order("created_at", { ascending: false });

  if (profilesError) {
    throw profilesError;
  }

  const { data: signupEventsData, error: signupEventsError } = await supabase
    .from("signup_events")
    .select("new_user_id,new_user_email,created_at")
    .order("created_at", { ascending: false });

  const profiles = (profilesData || []) as TesterProfileRow[];
  const profileByUserId = new Map(profiles.map((row) => [row.user_id, row]));
  const rows: TesterRow[] = [];
  const seenUserIds = new Set<string>();

  if (!signupEventsError) {
    for (const event of (signupEventsData || []) as SignupEventRow[]) {
      if (!event.new_user_id || seenUserIds.has(event.new_user_id)) continue;

      const profile = profileByUserId.get(event.new_user_id);

      rows.push({
        userId: event.new_user_id,
        email: profile?.email || event.new_user_email || "Unknown email",
        displayName: profile?.display_name || "",
        hasProfile: Boolean(profile),
        createdAt: profile?.created_at || event.created_at || "",
      });

      seenUserIds.add(event.new_user_id);
    }
  }

  for (const profile of profiles) {
    if (seenUserIds.has(profile.user_id)) continue;

    rows.push({
      userId: profile.user_id,
      email: profile.email,
      displayName: profile.display_name,
      hasProfile: true,
      createdAt: profile.created_at,
    });

    seenUserIds.add(profile.user_id);
  }

  const message =
    typeof resolvedSearchParams?.message === "string"
      ? resolvedSearchParams.message
      : "";

  return (
    <PageShell width="md">
      <header className="flex items-center justify-between">
        <Link href="/profile" className={buttonStyles({ variant: "ghost", size: "sm", className: "-ml-3" })}>
          <ChevronLeft className="h-4 w-4" /> Profile
        </Link>
        <Link href="/admin/library-import" className={buttonStyles({ variant: "secondary", size: "sm" })}>
          <Upload className="h-4 w-4" /> Import library
        </Link>
      </header>

      <div className="mt-6 animate-fade-slide-in">
        <Eyebrow>Owner tools</Eyebrow>
        <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight">Testers</h1>
        <p className="mt-1 text-sm text-fg-muted">Manage display names for signed-up accounts.</p>

        {message ? <Notice className="mt-4">{message}</Notice> : null}

        {!signupEventsError ? (
          <Card className="mt-6">
            <div className="font-semibold">Add a missing profile</div>
            <p className="mt-0.5 text-xs text-fg-faint">
              Matches the email to a signed-up user id through signup events.
            </p>

            <form action={addTesterByEmailAction} className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-[1fr_1fr_auto]">
              <input
                name="email"
                type="email"
                required
                aria-label="Tester email"
                placeholder="tester@example.com"
                className={inputStyles({ size: "sm" })}
              />
              <input
                name="displayName"
                type="text"
                required
                aria-label="Display name"
                placeholder="Display name"
                className={inputStyles({ size: "sm" })}
              />
              <Button type="submit" variant="primary">
                <UserPlus className="h-4 w-4" /> Add
              </Button>
            </form>
          </Card>
        ) : (
          <Notice className="mt-6">
            <code>signup_events</code> is not available, so only existing user profiles can be edited.
          </Notice>
        )}

        <div className="mt-8 flex items-baseline justify-between">
          <Eyebrow>Accounts</Eyebrow>
          <span className="text-xs text-fg-faint">{rows.length}</span>
        </div>

        {rows.length === 0 ? (
          <Card className="mt-3 text-center">
            <div className="font-semibold">No testers found</div>
            <p className="mt-1 text-sm text-fg-muted">
              Signed-up users will appear here once they have an event or a profile row.
            </p>
          </Card>
        ) : (
          <ul className="mt-3 space-y-2">
            {rows.map((row) => (
              <li key={row.userId}>
                <Card padded={false} className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate font-semibold">{row.email}</div>
                      <div className="mt-0.5 text-xs text-fg-faint">{formatDateTime(row.createdAt)}</div>
                    </div>
                    <span
                      className={cx(
                        "inline-flex shrink-0 items-center rounded-full px-2.5 py-1 text-[11px] font-semibold",
                        row.hasProfile ? "bg-success-soft text-success" : "bg-danger-soft text-danger",
                      )}
                    >
                      {row.hasProfile ? "Profile" : "No profile"}
                    </span>
                  </div>

                  <form action={saveTesterDisplayNameAction} className="mt-3 flex gap-2">
                    <input type="hidden" name="userId" value={row.userId} />
                    <input type="hidden" name="email" value={row.email} />
                    <input
                      name="displayName"
                      type="text"
                      required
                      defaultValue={row.displayName}
                      aria-label={`Display name for ${row.email}`}
                      placeholder="Display name"
                      className={inputStyles({ size: "sm" })}
                    />
                    <Button type="submit" variant="secondary">
                      Save
                    </Button>
                  </form>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </div>
    </PageShell>
  );
}
