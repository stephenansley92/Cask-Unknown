import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { saveProfileSetupAction } from "./actions";

type ProfileSetupPageProps = {
  searchParams?: {
    message?: string;
  };
};

export default async function ProfileSetupPage({
  searchParams,
}: ProfileSetupPageProps) {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?redirectTo=%2Fprofile%2Fsetup");
  }

  const { data: existingProfile } = await supabase
    .from("user_profiles")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (existingProfile) {
    redirect("/profile");
  }

  const message =
    typeof searchParams?.message === "string" ? searchParams.message : "";

  return (
    <main className="min-h-screen bg-[#F8F8F6] text-zinc-900 p-4 sm:p-6 flex items-center justify-center">
      <div className="w-full max-w-md rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm">
        <div className="text-sm text-zinc-500">Cask Unknown</div>
        <h1 className="mt-2 text-3xl font-extrabold tracking-tight">
          Profile Setup
        </h1>
        <p className="mt-2 text-sm text-zinc-500">
          Choose the display name that should represent your account in the app.
        </p>

        {message ? (
          <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            {message}
          </div>
        ) : null}

        <form action={saveProfileSetupAction} className="mt-6 space-y-4">
          <div>
            <label
              htmlFor="displayName"
              className="block text-sm font-semibold text-zinc-800"
            >
              Display name
            </label>
            <input
              id="displayName"
              name="displayName"
              type="text"
              required
              maxLength={80}
              className="mt-2 w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-900/10"
              placeholder="Your tasting name"
            />
          </div>

          <button
            type="submit"
            className="w-full rounded-2xl bg-zinc-900 px-5 py-3 font-semibold text-white hover:bg-zinc-800"
          >
            Save
          </button>
        </form>
      </div>
    </main>
  );
}
