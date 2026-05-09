import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const next = requestUrl.searchParams.get("next");
  const redirectPath = next && next.startsWith("/") ? next : "/login";

  if (code) {
    const supabase = createSupabaseServerClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      // Check whether the user has completed profile setup
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user) {
        const { data: profile } = await supabase
          .from("user_profiles")
          .select("user_id")
          .eq("user_id", user.id)
          .maybeSingle();

        if (!profile) {
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
  }

  return NextResponse.redirect(
    new URL(
      "/login?message=Unable%20to%20complete%20sign%20in.",
      requestUrl.origin
    )
  );
}
