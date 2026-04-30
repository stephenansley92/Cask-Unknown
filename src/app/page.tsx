"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

const OWNER_EMAIL = "stephen.ansley92@gmail.com";

type HomeView =
  | "loading"
  | "signed_out"
  | "profile_setup"
  | "signed_in"
  | "error";

type UserProfileRow = {
  user_id: string;
  display_name: string | null;
};

function getErrorMessage(error: unknown, fallback = "Could not load home.") {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  if (
    error &&
    typeof error === "object" &&
    "message" in error &&
    typeof (error as { message?: unknown }).message === "string"
  ) {
    const message = String((error as { message: string }).message).trim();
    if (message) return message;
  }

  return fallback;
}

export default function Home() {
  const router = useRouter();
  const [view, setView] = useState<HomeView>("loading");
  const [error, setError] = useState("");
  const [isOwner, setIsOwner] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const loadUser = async () => {
      try {
        const authClient = createSupabaseBrowserClient();
        const {
          data: { user },
          error: userError,
        } = await authClient.auth.getUser();

        if (userError) {
          throw userError;
        }

        if (!user) {
          if (!cancelled) {
            setIsOwner(false);
            setView("signed_out");
          }
          return;
        }

        const normalizedEmail = (user.email || "").trim().toLowerCase();

        if (!cancelled) {
          setIsOwner(normalizedEmail === OWNER_EMAIL);
        }

        const { data: profileData, error: profileError } = await authClient
          .from("user_profiles")
          .select("user_id,display_name")
          .eq("user_id", user.id)
          .maybeSingle();

        if (profileError) {
          throw profileError;
        }

        const displayName = (profileData as UserProfileRow | null)?.display_name?.trim() || "";

        if (!cancelled) {
          setView(displayName ? "signed_in" : "profile_setup");
        }
      } catch (loadError: unknown) {
        if (!cancelled) {
          setError(getErrorMessage(loadError));
          setView("error");
        }
      }
    };

    loadUser();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (view !== "profile_setup") return;
    router.replace("/profile/setup");
  }, [router, view]);

  if (view === "loading") {
    return (
      <main className="min-h-screen flex flex-col items-center justify-start bg-zinc-900 text-white p-6 pt-10 sm:justify-center sm:pt-6">
        <h1 className="text-4xl font-bold mb-4 text-amber-400">Cask Unknown</h1>
        <p className="text-zinc-400 text-center max-w-sm">Loading...</p>
      </main>
    );
  }

  if (view === "error") {
    return (
      <main className="min-h-screen flex flex-col items-center justify-start bg-zinc-900 text-white p-6 pt-10 sm:justify-center sm:pt-6">
        <h1 className="text-4xl font-bold mb-4 text-amber-400">Cask Unknown</h1>
        <p className="text-zinc-400 mb-8 text-center max-w-sm">{error}</p>

        <div className="flex flex-col gap-4 w-full max-w-xs">
          <button
            onClick={() => router.push("/profile")}
            className="bg-amber-500 hover:bg-amber-600 text-black font-semibold py-3 rounded-xl"
          >
            Profile
          </button>

          <button
            onClick={() => router.push("/login?redirectTo=%2F")}
            className="bg-zinc-100 hover:bg-white text-zinc-900 font-semibold py-3 rounded-xl"
          >
            Sign In
          </button>
        </div>
      </main>
    );
  }

  if (view === "signed_out") {
    return (
      <main className="min-h-screen flex flex-col items-center justify-start bg-zinc-900 text-white p-6 pt-10 sm:justify-center sm:pt-6">
        <h1 className="text-4xl font-bold mb-4 text-amber-400">Cask Unknown</h1>

        <p className="text-zinc-400 mb-8 text-center max-w-sm">
          Blind whiskey tasting. Score. Reveal. Crown a winner.
        </p>

        <div className="flex flex-col gap-4 w-full max-w-xs">
          <button
            onClick={() => router.push("/login?redirectTo=%2F")}
            className="bg-amber-500 hover:bg-amber-600 text-black font-semibold py-3 rounded-xl"
          >
            Sign In
          </button>

          <button
            onClick={() => router.push("/login?redirectTo=%2F")}
            className="bg-zinc-100 hover:bg-white text-zinc-900 font-semibold py-3 rounded-xl"
          >
            Create Account
          </button>

          <button
            onClick={() => router.push("/leaderboard")}
            className="bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 font-semibold py-3 rounded-xl"
          >
            Community
          </button>
        </div>

        <div className="mt-6 text-xs text-zinc-500 text-center max-w-sm">
          Sign in or create an account, then finish your profile to start rating
          and hosting.
        </div>
      </main>
    );
  }

  if (view === "profile_setup") {
    return (
      <main className="min-h-screen flex flex-col items-center justify-start bg-zinc-900 text-white p-6 pt-10 sm:justify-center sm:pt-6">
        <h1 className="text-4xl font-bold mb-4 text-amber-400">Cask Unknown</h1>

        <p className="text-zinc-400 mb-8 text-center max-w-sm">
          Finish your profile setup before continuing into the app.
        </p>

        <div className="flex flex-col gap-4 w-full max-w-xs">
          <button
            onClick={() => router.push("/profile/setup")}
            className="bg-amber-500 hover:bg-amber-600 text-black font-semibold py-3 rounded-xl"
          >
            Finish Profile Setup
          </button>

          <button
            onClick={() => router.push("/login")}
            className="bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 font-semibold py-3 rounded-xl"
          >
            Account
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen flex flex-col items-center justify-start bg-zinc-900 text-white p-6 pt-10 sm:justify-center sm:pt-6">
      <h1 className="text-4xl font-bold mb-4 text-amber-400">Cask Unknown</h1>

      <p className="text-zinc-400 mb-8 text-center max-w-sm">
        Blind whiskey tasting. Score. Reveal. Crown a winner.
      </p>

      <div className="flex flex-col gap-4 w-full max-w-xs">
        <button
          onClick={() => router.push("/rate/new")}
          className="bg-amber-500 hover:bg-amber-600 text-black font-semibold py-3 rounded-xl"
        >
          Rate Now
        </button>

        <button
          onClick={() => router.push("/create")}
          className="bg-zinc-100 hover:bg-white text-zinc-900 font-semibold py-3 rounded-xl"
        >
          Create Blind Session
        </button>

        <button
          onClick={() => router.push("/profile")}
          className="bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 font-semibold py-3 rounded-xl"
        >
          Profile
        </button>

        <button
          onClick={() => router.push("/leaderboard")}
          className="bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 font-semibold py-3 rounded-xl"
        >
          Community
        </button>

        {isOwner ? (
          <button
            onClick={() => router.push("/admin/testers")}
            className="bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 font-semibold py-3 rounded-xl"
          >
            Admin Testers
          </button>
        ) : null}

        <button
          onClick={() =>
            alert(
              "For now, guests join using the host's QR code / join link.\n\n(Join-by-code screen coming next.)"
            )
          }
          className="bg-zinc-700 hover:bg-zinc-600 py-3 rounded-xl"
        >
          Join Session
        </button>
      </div>

      <div className="mt-6 text-xs text-zinc-500 text-center max-w-sm">
        Guests: scan the QR code from the host dashboard.
      </div>
    </main>
  );
}
