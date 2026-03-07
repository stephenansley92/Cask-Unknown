"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type HistoryMode = "blind" | "rate";

function getSingleFormValue(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

function normalizeMode(value: string): HistoryMode | null {
  if (value === "blind" || value === "rate") return value;
  return null;
}

function normalizeReturnTo(value: string) {
  if (!value || !value.startsWith("/")) {
    return "/profile";
  }

  return value;
}

function withMessage(path: string, message: string) {
  const separator = path.includes("?") ? "&" : "?";
  return `${path}${separator}message=${encodeURIComponent(message)}`;
}

export async function deleteHistoryEntryAction(formData: FormData) {
  const mode = normalizeMode(getSingleFormValue(formData, "mode"));
  const entryId = getSingleFormValue(formData, "entryId");
  const returnTo = normalizeReturnTo(getSingleFormValue(formData, "returnTo"));

  if (!mode || !entryId) {
    redirect(withMessage(returnTo, "Invalid delete request."));
  }

  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/login?redirectTo=${encodeURIComponent(returnTo)}`);
  }

  if (mode === "rate") {
    const { error } = await supabase
      .from("ratings")
      .delete()
      .eq("id", entryId)
      .eq("user_id", user.id);

    if (error) {
      redirect(withMessage(returnTo, error.message));
    }

    redirect(withMessage(returnTo, "Deleted."));
  }

  const { data: scoreData, error: scoreError } = await supabase
    .from("scores")
    .select("id,participant_id")
    .eq("id", entryId)
    .maybeSingle();

  if (scoreError || !scoreData) {
    redirect(withMessage(returnTo, scoreError?.message || "Score not found."));
  }

  const participantId = scoreData.participant_id as string;
  const { data: participantData, error: participantError } = await supabase
    .from("participants")
    .select("id,user_id")
    .eq("id", participantId)
    .maybeSingle();

  if (participantError || !participantData) {
    redirect(
      withMessage(returnTo, participantError?.message || "Participant not found.")
    );
  }

  if ((participantData.user_id as string | null) !== user.id) {
    redirect(withMessage(returnTo, "You do not have permission to delete this."));
  }

  const { error: deleteError } = await supabase
    .from("scores")
    .delete()
    .eq("id", entryId)
    .eq("participant_id", participantId);

  if (deleteError) {
    redirect(withMessage(returnTo, deleteError.message));
  }

  redirect(withMessage(returnTo, "Deleted."));
}
