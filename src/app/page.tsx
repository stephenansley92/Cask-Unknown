"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

const OWNER_EMAIL = "stephen.ansley92@gmail.com";

export default function Home() {
  const router = useRouter();
  const [isOwner, setIsOwner] = useState(false);

  useEffect(() => {
    const loadUser = async () => {
      const authClient = createSupabaseBrowserClient();
      const {
        data: { user },
      } = await authClient.auth.getUser();

      setIsOwner(
        (user?.email || "").trim().toLowerCase() === OWNER_EMAIL
      );
    };

    loadUser();
  }, []);

  return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-zinc-900 text-white p-6">
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
          Users
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
              "For now, guests join using the host’s QR code / join link.\n\n(Join-by-code screen coming next.)"
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
