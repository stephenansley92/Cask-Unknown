"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

function setupRedirect(message = "") {
  if (!message) return "/profile/setup";
  return `/profile/setup?message=${encodeURIComponent(message)}`;
}

export async function saveProfileSetupAction(formData: FormData) {
  const displayNameValue = formData.get("displayName");
  const displayName =
    typeof displayNameValue === "string" ? displayNameValue.trim() : "";

  if (!displayName) {
    redirect(setupRedirect("Display name is required."));
  }

  const supabase = createSupabaseServerClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError) {
    redirect(setupRedirect(userError.message));
  }

  if (!user) {
    redirect("/login?redirectTo=%2Fprofile%2Fsetup");
  }

  const { data: existingProfile, error: existingError } = await supabase
    .from("user_profiles")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (existingError) {
    redirect(setupRedirect(existingError.message));
  }

  if (existingProfile) {
    redirect("/profile");
  }

  const { error: insertError } = await supabase.from("user_profiles").insert({
    user_id: user.id,
    email: user.email || "",
    display_name: displayName,
  });

  if (insertError) {
    redirect(setupRedirect(insertError.message));
  }

  redirect("/profile");
}
