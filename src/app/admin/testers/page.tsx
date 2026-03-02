import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
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
  searchParams?: {
    message?: string;
  };
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
  const supabase = createSupabaseServerClient();
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
    typeof searchParams?.message === "string" ? searchParams.message : "";

  return (
    <main className="min-h-screen bg-[#F8F8F6] text-zinc-900 p-4 sm:p-6">
      <div className="mx-auto max-w-4xl">
        <div className="rounded-3xl border border-zinc-200 bg-white p-5 shadow-sm md:p-6">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <div className="text-sm text-zinc-500">Owner Tools</div>
              <h1 className="mt-2 text-3xl font-extrabold tracking-tight">
                Testers
              </h1>
              <p className="mt-2 text-sm text-zinc-500">
                Manage tester display names for signed-up accounts.
              </p>
            </div>

            <Link
              href="/profile"
              className="inline-flex items-center justify-center rounded-2xl border border-zinc-200 px-4 py-3 text-sm font-semibold text-zinc-900 hover:bg-zinc-50"
            >
              Back to Profile
            </Link>
          </div>

          {message ? (
            <div className="mt-4 rounded-2xl border border-zinc-200 bg-[#F8F8F6] px-4 py-3 text-sm text-zinc-700">
              {message}
            </div>
          ) : null}

          {!signupEventsError ? (
            <div className="mt-6 rounded-3xl border border-zinc-200 p-5">
              <div className="text-sm font-semibold text-zinc-800">
                Add Missing Profile By Email
              </div>
              <p className="mt-1 text-xs text-zinc-500">
                Uses signup events to match the email to a signed-up user id.
              </p>

              <form action={addTesterByEmailAction} className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-[1fr_1fr_auto]">
                <input
                  name="email"
                  type="email"
                  required
                  placeholder="tester@example.com"
                  className="w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-900"
                />
                <input
                  name="displayName"
                  type="text"
                  required
                  placeholder="Display name"
                  className="w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-900"
                />
                <button
                  type="submit"
                  className="rounded-2xl bg-zinc-900 px-5 py-3 text-sm font-semibold text-white hover:bg-zinc-800"
                >
                  Add
                </button>
              </form>
            </div>
          ) : (
            <div className="mt-6 rounded-3xl border border-zinc-200 bg-[#F8F8F6] px-5 py-4 text-sm text-zinc-500">
              `signup_events` is not available, so only existing user profiles can be edited.
            </div>
          )}

          <div className="mt-6 space-y-3">
            {rows.length === 0 ? (
              <div className="rounded-3xl border border-zinc-200 p-6 text-center">
                <div className="text-lg font-semibold">No testers found</div>
                <div className="mt-2 text-sm text-zinc-500">
                  Signed-up users will appear here once they have an event or a profile row.
                </div>
              </div>
            ) : (
              rows.map((row) => (
                <div
                  key={row.userId}
                  className="rounded-2xl border border-zinc-200 bg-[#F8F8F6] px-4 py-4"
                >
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div>
                      <div className="font-semibold">{row.email}</div>
                      <div className="mt-1 text-xs text-zinc-500">
                        {row.hasProfile ? "Profile exists" : "Missing profile"} •{" "}
                        {formatDateTime(row.createdAt)}
                      </div>
                    </div>

                    <form
                      action={saveTesterDisplayNameAction}
                      className="flex w-full flex-col gap-3 md:w-auto md:min-w-[360px]"
                    >
                      <input type="hidden" name="userId" value={row.userId} />
                      <input type="hidden" name="email" value={row.email} />
                      <input
                        name="displayName"
                        type="text"
                        required
                        defaultValue={row.displayName}
                        placeholder="Display name"
                        className="w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-900"
                      />
                      <button
                        type="submit"
                        className="rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm font-semibold text-zinc-900 hover:bg-zinc-50"
                      >
                        Save
                      </button>
                    </form>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
