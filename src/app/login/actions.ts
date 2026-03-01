"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

function getRedirectTo(formData: FormData) {
  const value = formData.get("redirectTo");
  if (typeof value !== "string") return "";
  return value.startsWith("/") ? value : "";
}

function loginRedirect(message: string, redirectTo = "") {
  const params = new URLSearchParams({
    message,
  });

  if (redirectTo) {
    params.set("redirectTo", redirectTo);
  }

  return `/login?${params.toString()}`;
}

function getEmail(formData: FormData) {
  const value = formData.get("email");
  return typeof value === "string" ? value.trim() : "";
}

function getPassword(formData: FormData) {
  const value = formData.get("password");
  return typeof value === "string" ? value : "";
}

export async function signInAction(formData: FormData) {
  const email = getEmail(formData);
  const password = getPassword(formData);
  const redirectTo = getRedirectTo(formData);

  if (!email || !password) {
    redirect(loginRedirect("Email and password are required.", redirectTo));
  }

  const supabase = createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    redirect(loginRedirect(error.message, redirectTo));
  }

  redirect(redirectTo || loginRedirect("Signed in."));
}

export async function signUpAction(formData: FormData) {
  const email = getEmail(formData);
  const password = getPassword(formData);
  const redirectTo = getRedirectTo(formData);

  if (!email || !password) {
    redirect(loginRedirect("Email and password are required.", redirectTo));
  }

  const origin = headers().get("origin") || "http://localhost:3000";
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${origin}/auth/callback?next=${encodeURIComponent(
        redirectTo || "/login"
      )}`,
    },
  });

  if (error) {
    redirect(loginRedirect(error.message, redirectTo));
  }

  if (data.session) {
    redirect(redirectTo || loginRedirect("Account created and signed in."));
  }

  redirect(
    loginRedirect("Check your email to confirm your account.", redirectTo)
  );
}

export async function signOutAction() {
  const supabase = createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect(loginRedirect("Signed out."));
}
