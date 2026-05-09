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
  const [showJoinInput, setShowJoinInput] = useState(false);
  const [joinInput, setJoinInput] = useState("");

  const handleJoin = () => {
    const raw = joinInput.trim();
    if (!raw) return;
    const match = raw.match(/\/join\/([^/?#\s]+)/);
    const id = match ? match[1] : raw;
    router.push(`/join/${id}`);
  };

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

        <button
          onClick={() => router.push("/sessions")}
          className="bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 font-semibold py-3 rounded-xl"
        >
          My Sessions
        </button>

        {isOwner ? (
          <button
            onClick={() => router.push("/admin/testers")}
            className="bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 font-semibold py-3 rounded-xl"
          >
            Admin Testers
          </button>
        ) : null}

        {showJoinInput ? (
          <div className="flex flex-col gap-2">
            <input
              autoFocus
              value={joinInput}
              onChange={(e) => setJoinInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleJoin()}
              placeholder="Paste join link or session ID"
              className="w-full bg-zinc-800 border border-zinc-600 rounded-xl px-4 py-3 text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-amber-500/40"
            />
            <div className="flex gap-2">
              <button
                onClick={handleJoin}
                className="flex-1 bg-amber-500 hover:bg-amber-600 text-black font-semibold py-3 rounded-xl"
              >
                Go
              </button>
              <button
                onClick={() => { setShowJoinInput(false); setJoinInput(""); }}
                className="bg-zinc-700 hover:bg-zinc-600 text-white font-semibold px-4 py-3 rounded-xl"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setShowJoinInput(true)}
            className="bg-zinc-700 hover:bg-zinc-600 py-3 rounded-xl font-semibold"
          >
            Join Session
          </button>
        )}
      </div>

      <div className="mt-6 text-xs text-zinc-500 text-center max-w-sm">
        Guests: scan the QR code from the host dashboard.
      </div>
    </main>
  );
}
