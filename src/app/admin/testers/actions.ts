"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const OWNER_EMAIL = "stephen.ansley92@gmail.com";

function adminRedirect(message = "") {
  if (!message) return "/admin/testers";
  return `/admin/testers?message=${encodeURIComponent(message)}`;
}

async function requireOwner() {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error) {
    redirect(adminRedirect(error.message));
  }

  if (!user) {
    redirect("/login?redirectTo=%2Fadmin%2Ftesters");
  }

  if ((user.email || "").trim().toLowerCase() !== OWNER_EMAIL) {
    redirect("/profile");
  }

  return { supabase, user };
}

export async function saveTesterDisplayNameAction(formData: FormData) {
  const { supabase } = await requireOwner();

  const userIdValue = formData.get("userId");
  const emailValue = formData.get("email");
  const displayNameValue = formData.get("displayName");

  const userId = typeof userIdValue === "string" ? userIdValue.trim() : "";
  const email = typeof emailValue === "string" ? emailValue.trim() : "";
  const displayName =
    typeof displayNameValue === "string" ? displayNameValue.trim() : "";

  if (!userId || !email) {
    redirect(adminRedirect("Missing tester identity."));
  }

  if (!displayName) {
    redirect(adminRedirect("Display name is required."));
  }

  const { error } = await supabase.from("user_profiles").upsert(
    {
      user_id: userId,
      email,
      display_name: displayName,
    },
    {
      onConflict: "user_id",
    }
  );

  if (error) {
    redirect(adminRedirect(error.message));
  }

  redirect(adminRedirect("Tester profile saved."));
}

export async function addTesterByEmailAction(formData: FormData) {
  const { supabase } = await requireOwner();

  const emailValue = formData.get("email");
  const displayNameValue = formData.get("displayName");

  const email = typeof emailValue === "string" ? emailValue.trim() : "";
  const displayName =
    typeof displayNameValue === "string" ? displayNameValue.trim() : "";

  if (!email || !displayName) {
    redirect(adminRedirect("Email and display name are required."));
  }

  const { data: signupEvent, error: signupEventError } = await supabase
    .from("signup_events")
    .select("new_user_id,new_user_email")
    .ilike("new_user_email", email)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (signupEventError) {
    redirect(adminRedirect("signup_events is unavailable for email lookup."));
  }

  if (!signupEvent?.new_user_id) {
    redirect(adminRedirect("No signup event found for that email."));
  }

  const { error } = await supabase.from("user_profiles").upsert(
    {
      user_id: signupEvent.new_user_id,
      email: signupEvent.new_user_email || email,
      display_name: displayName,
    },
    {
      onConflict: "user_id",
    }
  );

  if (error) {
    redirect(adminRedirect(error.message));
  }

  redirect(adminRedirect("Tester profile added."));
}
