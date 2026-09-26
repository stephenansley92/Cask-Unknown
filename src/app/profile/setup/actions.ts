"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { safeInternalPath } from "@/lib/redirects";
import { logEvent, newCorrelationId, userFacingError } from "@/lib/log";

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

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError) {
    const ref = newCorrelationId();
    logEvent("error", "profile_setup.get_user_failed", {
      ref,
      code: userError.code,
      message: userError.message,
    });
    redirect(
      setupRedirect(
        userFacingError("Could not verify your session. Please try again.", ref),
        redirectTo
      )
    );
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
    const ref = newCorrelationId();
    logEvent("error", "profile_setup.profile_check_failed", {
      ref,
      code: existingError.code,
      message: existingError.message,
    });
    redirect(
      setupRedirect(
        userFacingError("Could not check your profile. Please try again.", ref),
        redirectTo
      )
    );
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
    const ref = newCorrelationId();
    logEvent("error", "profile_setup.insert_failed", {
      ref,
      code: insertError.code,
      message: insertError.message,
    });
    redirect(
      setupRedirect(
        userFacingError("Could not save your profile. Please try again.", ref),
        redirectTo
      )
    );
  }

  redirect(redirectTo || "/profile");
}
