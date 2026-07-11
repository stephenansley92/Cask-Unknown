import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { safeInternalPath } from "@/lib/redirects";
import { logEvent } from "@/lib/log";

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const next = requestUrl.searchParams.get("next");
  const redirectPath = safeInternalPath(next, "/login");

  if (code) {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      // Check whether the user has completed profile setup
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user) {
        const { data: profile, error: profileError } = await supabase
          .from("user_profiles")
          .select("user_id")
          .eq("user_id", user.id)
          .maybeSingle();

        if (profileError) {
          // Outage, not a missing profile: continue to the destination
          // instead of pushing an existing user into setup.
          logEvent("error", "auth.callback.profile_check_failed", {
            code: profileError.code,
            message: profileError.message,
          });
        } else if (!profile) {
          const setupUrl = new URL("/profile/setup", requestUrl.origin);
          // Preserve the intended destination so setup can redirect there after completion
          if (redirectPath !== "/login") {
            setupUrl.searchParams.set("redirectTo", redirectPath);
          }
          return NextResponse.redirect(setupUrl);
        }
      }

      return NextResponse.redirect(new URL(redirectPath, requestUrl.origin));
    }

    logEvent("error", "auth.callback.exchange_failed", {
      code: error.code,
      message: error.message,
    });
  }

  return NextResponse.redirect(
    new URL(
      "/login?message=Unable%20to%20complete%20sign%20in.",
      requestUrl.origin
    )
  );
}
