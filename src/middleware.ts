import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  const { response, user } = await updateSession(request);
  const pathname = request.nextUrl.pathname;
  const protectedPrefixes = ["/rate", "/templates", "/history"];
  const isProtected =
    pathname === "/profile" ||
    protectedPrefixes.some(
      (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
    );

  // Not a protected route — let through
  if (!isProtected) return response;

  // Protected but not authenticated — redirect to login
  if (!user) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.searchParams.set(
      "redirectTo",
      `${request.nextUrl.pathname}${request.nextUrl.search}`
    );
    return NextResponse.redirect(loginUrl);
  }

  // Authenticated but may not have completed profile setup
  if (pathname !== "/profile/setup") {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (supabaseUrl && supabaseAnonKey) {
      const checkClient = createServerClient(supabaseUrl, supabaseAnonKey, {
        cookies: {
          getAll: () => request.cookies.getAll(),
          setAll: () => {},
        },
      });

      const { data: profile } = await checkClient
        .from("user_profiles")
        .select("user_id")
        .eq("user_id", user.id)
        .maybeSingle();

      if (!profile) {
        const setupUrl = request.nextUrl.clone();
        setupUrl.pathname = "/profile/setup";
        setupUrl.searchParams.set(
          "redirectTo",
          `${pathname}${request.nextUrl.search}`
        );
        return NextResponse.redirect(setupUrl);
      }
    }
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
