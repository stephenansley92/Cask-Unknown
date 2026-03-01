import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { signInAction, signOutAction, signUpAction } from "./actions";

type LoginPageProps = {
  searchParams?: {
    message?: string;
    redirectTo?: string;
  };
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const message =
    typeof searchParams?.message === "string" ? searchParams.message : "";
  const redirectTo =
    typeof searchParams?.redirectTo === "string" &&
    searchParams.redirectTo.startsWith("/")
      ? searchParams.redirectTo
      : "";

  return (
    <main className="min-h-screen bg-zinc-900 text-white p-6 flex items-center justify-center">
      <div className="w-full max-w-md bg-zinc-800 border border-zinc-700 rounded-3xl p-6 md:p-8 shadow-lg">
        <div className="text-sm text-zinc-400">Cask Unknown</div>
        <h1 className="text-3xl font-extrabold text-amber-400 mt-2">Login</h1>
        <p className="text-zinc-400 mt-2 text-sm">
          Email and password auth is now enabled with Supabase cookies.
        </p>

        {message ? (
          <div className="mt-4 rounded-2xl border border-zinc-700 bg-zinc-900 px-4 py-3 text-sm text-zinc-200">
            {message}
          </div>
        ) : null}

        {user ? (
          <div className="mt-6 space-y-4">
            <div className="rounded-2xl border border-zinc-700 bg-zinc-900 px-4 py-4">
              <div className="text-xs uppercase tracking-[0.18em] text-zinc-500">
                Signed In
              </div>
              <div className="mt-2 font-semibold text-zinc-100">
                {user.email || "Authenticated user"}
              </div>
            </div>

            <form action={signOutAction}>
              <button
                type="submit"
                className="w-full rounded-2xl px-5 py-3 font-semibold bg-zinc-100 text-zinc-900 hover:bg-white"
              >
                Sign Out
              </button>
            </form>

            <Link
              href="/"
              className="inline-flex w-full items-center justify-center rounded-2xl border border-zinc-700 px-5 py-3 font-semibold text-zinc-200 hover:bg-zinc-700"
            >
              Back Home
            </Link>
          </div>
        ) : (
          <form className="mt-6 space-y-4">
            <input type="hidden" name="redirectTo" value={redirectTo} />

            <div>
              <label
                htmlFor="email"
                className="block text-sm font-semibold text-zinc-200 mb-2"
              >
                Email
              </label>
              <input
                id="email"
                name="email"
                type="email"
                required
                autoComplete="email"
                className="w-full rounded-2xl bg-zinc-900 border border-zinc-700 px-4 py-3 text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-amber-500/30"
                placeholder="you@example.com"
              />
            </div>

            <div>
              <label
                htmlFor="password"
                className="block text-sm font-semibold text-zinc-200 mb-2"
              >
                Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                required
                autoComplete="current-password"
                className="w-full rounded-2xl bg-zinc-900 border border-zinc-700 px-4 py-3 text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-amber-500/30"
                placeholder="Minimum 6 characters"
              />
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <button
                type="submit"
                formAction={signInAction}
                className="w-full rounded-2xl px-5 py-3 font-semibold bg-amber-500 text-black hover:bg-amber-600"
              >
                Sign In
              </button>

              <button
                type="submit"
                formAction={signUpAction}
                className="w-full rounded-2xl px-5 py-3 font-semibold border border-zinc-700 text-zinc-100 hover:bg-zinc-700"
              >
                Create Account
              </button>
            </div>

            <Link
              href="/"
              className="inline-flex w-full items-center justify-center rounded-2xl px-5 py-3 text-sm font-semibold text-zinc-400 hover:text-zinc-200"
            >
              Back Home
            </Link>
          </form>
        )}
      </div>
    </main>
  );
}
