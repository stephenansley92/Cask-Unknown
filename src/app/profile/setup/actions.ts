"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { safeInternalPath } from "@/lib/redirects";

function setupRedirect(message = "", redirectTo = "") {
  const params = new URLSearchParams();
  if (message) params.set("message", message);
  if (redirectTo) params.set("redirectTo", redirectTo);
  const query = params.toString();
  return query ? `/profile/setup?${query}` : "/profile/setup";
}

export async function saveProfileSetupAction(formData: FormData) {
  const displayNameValue = formData.get("displayName");
  const displayName =
    typeof displayNameValue === "string" ? displayNameValue.trim() : "";
  const redirectTo = safeInternalPath(formData.get("redirectTo"));

  if (!displayName) {
    redirect(setupRedirect("Display name is required.", redirectTo));
  }

  const supabase = createSupabaseServerClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError) {
    redirect(setupRedirect(userError.message, redirectTo));
  }

  if (!user) {
    const setupPath = redirectTo
      ? `/profile/setup?redirectTo=${encodeURIComponent(redirectTo)}`
      : "/profile/setup";
    redirect(`/login?redirectTo=${encodeURIComponent(setupPath)}`);
  }

  const { data: existingProfile, error: existingError } = await supabase
    .from("user_profiles")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (existingError) {
    redirect(setupRedirect(existingError.message, redirectTo));
  }

  if (existingProfile) {
    redirect(redirectTo || "/profile");
  }

  const { error: insertError } = await supabase.from("user_profiles").insert({
    user_id: user.id,
    email: user.email || "",
    display_name: displayName,
  });

  if (insertError) {
    redirect(setupRedirect(insertError.message, redirectTo));
  }

  redirect(redirectTo || "/profile");
}
