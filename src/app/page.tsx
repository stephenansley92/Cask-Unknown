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

function BrandTitle() {
  return (
    <div className="text-center mb-8">
      <h1
        className="text-5xl font-extrabold tracking-tight text-amber-400"
        style={{ textShadow: "0 0 32px rgba(245,158,11,0.35)" }}
      >
        Cask Unknown
      </h1>
      <div className="mx-auto mt-3 h-0.5 w-16 rounded-full bg-amber-400/50" />
    </div>
  );
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
      <main className="min-h-screen flex flex-col items-center justify-center bg-zinc-900 text-white p-6">
        <BrandTitle />
        <div className="flex gap-1.5">
          <span className="bounce-dot w-2 h-2 rounded-full bg-amber-400" />
          <span className="bounce-dot w-2 h-2 rounded-full bg-amber-400" />
          <span className="bounce-dot w-2 h-2 rounded-full bg-amber-400" />
        </div>
      </main>
    );
  }

  if (view === "error") {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center bg-zinc-900 text-white p-6">
        <div className="w-full max-w-xs animate-fade-slide-in">
          <BrandTitle />
          <p className="text-zinc-400 mb-6 text-center text-sm">{error}</p>
          <div className="flex flex-col gap-3">
            <button
              onClick={() => router.push("/profile")}
              className="bg-amber-500 hover:bg-amber-600 active:scale-95 text-black font-semibold py-3 rounded-2xl"
            >
              Profile
            </button>
            <button
              onClick={() => router.push("/login?redirectTo=%2F")}
              className="bg-zinc-100 hover:bg-white active:scale-95 text-zinc-900 font-semibold py-3 rounded-2xl"
            >
              Sign In
            </button>
          </div>
        </div>
      </main>
    );
  }

  if (view === "signed_out") {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center bg-zinc-900 text-white p-6">
        <div className="w-full max-w-xs animate-fade-slide-in">
          <BrandTitle />
          <p className="text-zinc-400 mb-8 text-center text-sm">
            Blind whiskey tasting. Score. Reveal. Crown a winner.
          </p>

          <div className="flex flex-col gap-3">
            <button
              onClick={() => router.push("/login?redirectTo=%2F")}
              className="bg-amber-500 hover:bg-amber-600 active:scale-95 text-black font-semibold py-3.5 rounded-2xl text-base"
            >
              Sign In
            </button>

            <button
              onClick={() => router.push("/login?redirectTo=%2F")}
              className="bg-zinc-100 hover:bg-white active:scale-95 text-zinc-900 font-semibold py-3.5 rounded-2xl"
            >
              Create Account
            </button>

            <button
              onClick={() => router.push("/leaderboard")}
              className="bg-zinc-800 hover:bg-zinc-700 active:scale-95 border border-zinc-700 font-semibold py-3 rounded-2xl text-sm"
            >
              Community
            </button>
          </div>

          <p className="mt-6 text-xs text-zinc-600 text-center">
            Sign in to start rating and hosting tastings.
          </p>
        </div>
      </main>
    );
  }

  if (view === "profile_setup") {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center bg-zinc-900 text-white p-6">
        <div className="w-full max-w-xs animate-fade-slide-in">
          <BrandTitle />
          <p className="text-zinc-400 mb-8 text-center text-sm">
            Finish your profile setup before continuing.
          </p>

          <div className="flex flex-col gap-3">
            <button
              onClick={() => router.push("/profile/setup")}
              className="bg-amber-500 hover:bg-amber-600 active:scale-95 text-black font-semibold py-3.5 rounded-2xl"
            >
              Finish Profile Setup
            </button>

            <button
              onClick={() => router.push("/login")}
              className="bg-zinc-800 hover:bg-zinc-700 active:scale-95 border border-zinc-700 font-semibold py-3 rounded-2xl text-sm"
            >
              Account
            </button>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-zinc-900 text-white p-6">
      <div className="w-full max-w-xs animate-fade-slide-in">
        <BrandTitle />

        <p className="text-zinc-400 mb-8 text-center text-sm">
          Blind whiskey tasting. Score. Reveal. Crown a winner.
        </p>

        <div className="flex flex-col gap-3">
          {/* Primary action */}
          <button
            onClick={() => router.push("/rate/new")}
            className="bg-amber-500 hover:bg-amber-600 active:scale-95 text-black font-semibold py-3.5 rounded-2xl text-base"
          >
            Rate Now
          </button>

          {/* Secondary action */}
          <button
            onClick={() => router.push("/create")}
            className="bg-zinc-100 hover:bg-white active:scale-95 text-zinc-900 font-semibold py-3.5 rounded-2xl"
          >
            Create Blind Session
          </button>

          {/* Tertiary actions */}
          <div className="flex flex-col gap-2 mt-1">
            <button
              onClick={() => router.push("/profile")}
              className="bg-zinc-800 hover:bg-zinc-700 active:scale-95 border border-zinc-700 font-semibold py-3 rounded-2xl text-sm"
            >
              Profile
            </button>

            <button
              onClick={() => router.push("/leaderboard")}
              className="bg-zinc-800 hover:bg-zinc-700 active:scale-95 border border-zinc-700 font-semibold py-3 rounded-2xl text-sm"
            >
              Community
            </button>

            <button
              onClick={() => router.push("/sessions")}
              className="bg-zinc-800 hover:bg-zinc-700 active:scale-95 border border-zinc-700 font-semibold py-3 rounded-2xl text-sm"
            >
              My Sessions
            </button>

            {isOwner ? (
              <button
                onClick={() => router.push("/admin/testers")}
                className="bg-zinc-800 hover:bg-zinc-700 active:scale-95 border border-zinc-700 font-semibold py-3 rounded-2xl text-sm"
              >
                Admin Testers
              </button>
            ) : null}

            {showJoinInput ? (
              <div className="flex flex-col gap-2 animate-fade-slide-in">
                <input
                  autoFocus
                  value={joinInput}
                  onChange={(e) => setJoinInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleJoin()}
                  placeholder="Paste join link or session ID"
                  className="w-full bg-zinc-800 border border-zinc-600 focus:border-amber-500 rounded-2xl px-4 py-3 text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-amber-500/30 transition-colors"
                />
                <div className="flex gap-2">
                  <button
                    onClick={handleJoin}
                    className="flex-1 bg-amber-500 hover:bg-amber-600 active:scale-95 text-black font-semibold py-3 rounded-2xl text-sm"
                  >
                    Go
                  </button>
                  <button
                    onClick={() => { setShowJoinInput(false); setJoinInput(""); }}
                    className="bg-zinc-700 hover:bg-zinc-600 active:scale-95 text-white font-semibold px-4 py-3 rounded-2xl text-sm"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setShowJoinInput(true)}
                className="bg-zinc-800 hover:bg-zinc-700 active:scale-95 border border-zinc-700 font-semibold py-3 rounded-2xl text-sm"
              >
                Join Session
              </button>
            )}
          </div>
        </div>

        <p className="mt-6 text-xs text-zinc-600 text-center">
          Guests: scan the QR code from the host dashboard.
        </p>
      </div>
    </main>
  );
}
