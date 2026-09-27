import type { SupabaseClient } from "@supabase/supabase-js";
import type { PalateEntry, PalateMatchRow } from "@/lib/palate/profile";

export type PublicSession = {
  id: string;
  title: string;
  is_blind: boolean;
  status: string;
  created_at?: string;
};

export type SessionParticipant = {
  id: string;
  session_id: string;
  display_name: string;
  user_id?: string | null;
  access_token: string;
  created_at?: string;
};

export type SessionPour = {
  id: string;
  session_id: string;
  code: string;
  bottle_name?: string | null;
  whiskey_id?: string | null;
  whiskey_name?: string | null;
  sort_order: number;
};

export type SessionScore = {
  id: string;
  session_id: string;
  pour_id: string;
  participant_id: string;
  nose: number;
  flavor: number;
  mouthfeel: number;
  complexity: number;
  balance: number;
  finish: number;
  uniqueness: number;
  drinkability: number;
  packaging: number;
  value: number;
  total: number;
  notes?: string | null;
  core_locked?: boolean | null;
  core_locked_at?: string | null;
  final_locked?: boolean | null;
  final_locked_at?: string | null;
  created_at?: string;
};

export type ParticipantSessionSnapshot = {
  session: PublicSession;
  participant: Omit<SessionParticipant, "access_token">;
  pours: SessionPour[];
  scores: SessionScore[];
};

export type HostSessionSnapshot = {
  session: PublicSession;
  pours: SessionPour[];
  participants: Array<Omit<SessionParticipant, "access_token">>;
  scores: SessionScore[];
};

export type RevealSessionSnapshot = {
  session: PublicSession;
  pours: SessionPour[];
  participants: Array<Omit<SessionParticipant, "access_token">>;
  scores: SessionScore[];
  /** Present once the reveal-night migration is applied; empty until the big reveal. */
  guesses?: Array<{
    pour_id: string;
    participant_id: string;
    bottle_guess: string | null;
    proof_guess: number | null;
    price_guess: number | null;
  }>;
};

type RpcResult<T> = { data: T | null; error: { message: string } | null };

function result<T>(value: RpcResult<unknown>): RpcResult<T> {
  return { data: value.data as T | null, error: value.error };
}

export async function getPublicSession(client: SupabaseClient, sessionId: string) {
  const response = await client.rpc("get_public_session", { p_session_id: sessionId }).single();
  return result<PublicSession>(response);
}

export async function createHostedSession(
  client: SupabaseClient,
  title: string,
  isBlind: boolean,
) {
  const response = await client
    .rpc("create_hosted_session", { p_title: title, p_is_blind: isBlind })
    .single();
  return result<{ id: string; host_key: string }>(response);
}

export async function listHostedSessions(client: SupabaseClient) {
  const response = await client.rpc("list_hosted_sessions");
  return result<Array<Pick<PublicSession, "id" | "title" | "status" | "created_at">>>(
    response,
  );
}

export async function getRevealSession(client: SupabaseClient, sessionId: string) {
  const response = await client.rpc("get_reveal_session", { p_session_id: sessionId });
  return result<RevealSessionSnapshot>(response);
}

export async function resumeSessionParticipant(
  client: SupabaseClient,
  sessionId: string,
  participantId: string,
  accessToken: string,
) {
  const response = await client
    .rpc("resume_session_participant", {
      p_session_id: sessionId,
      p_participant_id: participantId,
      p_access_token: accessToken,
    })
    .single();
  return result<SessionParticipant>(response);
}

export async function joinSession(
  client: SupabaseClient,
  sessionId: string,
  displayName: string,
) {
  const response = await client
    .rpc("join_session", { p_session_id: sessionId, p_display_name: displayName })
    .single();
  return result<SessionParticipant>(response);
}

export async function getParticipantSession(
  client: SupabaseClient,
  sessionId: string,
  participantId: string,
  accessToken: string,
) {
  const response = await client.rpc("get_participant_session", {
    p_session_id: sessionId,
    p_participant_id: participantId,
    p_access_token: accessToken,
  });
  return result<ParticipantSessionSnapshot>(response);
}

export async function saveParticipantScore(
  client: SupabaseClient,
  input: {
    sessionId: string;
    pourId: string;
    participantId: string;
    accessToken: string;
    score: Record<string, number | string | string[]>;
    lockCore?: boolean;
    lockFinal?: boolean;
  },
) {
  const response = await client.rpc("save_participant_score", {
    p_session_id: input.sessionId,
    p_pour_id: input.pourId,
    p_participant_id: input.participantId,
    p_access_token: input.accessToken,
    p_score: input.score,
    p_lock_core: input.lockCore ?? false,
    p_lock_final: input.lockFinal ?? false,
  });
  return result<SessionScore>(response);
}

export async function getHostSession(
  client: SupabaseClient,
  sessionId: string,
  legacyHostKey: string,
) {
  const response = await client.rpc("get_host_session", {
    p_session_id: sessionId,
    p_legacy_host_key: legacyHostKey || null,
  });
  return result<HostSessionSnapshot>(response);
}

export async function setHostSessionStatus(
  client: SupabaseClient,
  sessionId: string,
  status: string,
  legacyHostKey: string,
) {
  return client.rpc("host_set_session_status", {
    p_session_id: sessionId,
    p_status: status,
    p_legacy_host_key: legacyHostKey || null,
  });
}

export async function unlockHostScores(
  client: SupabaseClient,
  sessionId: string,
  legacyHostKey: string,
) {
  return client.rpc("host_unlock_scores", {
    p_session_id: sessionId,
    p_legacy_host_key: legacyHostKey || null,
  });
}

export async function upsertHostPours(
  client: SupabaseClient,
  sessionId: string,
  rows: Array<Record<string, unknown>>,
  legacyHostKey: string,
) {
  const response = await client.rpc("host_upsert_pours", {
    p_session_id: sessionId,
    p_rows: rows,
    p_legacy_host_key: legacyHostKey || null,
  });
  return result<SessionPour[]>(response);
}

export async function deleteHostPour(
  client: SupabaseClient,
  sessionId: string,
  pourId: string,
  legacyHostKey: string,
) {
  return client.rpc("host_delete_pour", {
    p_session_id: sessionId,
    p_pour_id: pourId,
    p_legacy_host_key: legacyHostKey || null,
  });
}

export async function deleteHostParticipant(
  client: SupabaseClient,
  sessionId: string,
  participantId: string,
  legacyHostKey: string,
) {
  return client.rpc("host_delete_participant", {
    p_session_id: sessionId,
    p_participant_id: participantId,
    p_legacy_host_key: legacyHostKey || null,
  });
}

// ── Reveal night (202609270001_reveal_night.sql) ─────────────────────────
// Until that migration is applied these RPCs don't exist; callers treat an
// error as "feature unavailable" and hide the UI.

export type GuessingSettings = { bottles: boolean; proof: boolean; price: boolean };

export type ParticipantGuess = {
  pour_id: string;
  bottle_guess: string | null;
  proof_guess: number | null;
  price_guess: number | null;
};

export type ParticipantGuessing = {
  settings: GuessingSettings;
  candidates: string[];
  guesses: ParticipantGuess[];
};

export function guessingEnabled(settings: GuessingSettings | null | undefined) {
  return Boolean(settings && (settings.bottles || settings.proof || settings.price));
}

export async function getSessionGuessing(client: SupabaseClient, sessionId: string) {
  const response = await client.rpc("get_session_guessing", { p_session_id: sessionId });
  return result<GuessingSettings>(response);
}

export async function hostSetGuessing(
  client: SupabaseClient,
  sessionId: string,
  settings: Partial<GuessingSettings>,
  legacyHostKey: string,
) {
  const response = await client.rpc("host_set_guessing", {
    p_session_id: sessionId,
    p_settings: settings,
    p_legacy_host_key: legacyHostKey || null,
  });
  return result<GuessingSettings>(response);
}

export async function getParticipantGuessing(
  client: SupabaseClient,
  sessionId: string,
  participantId: string,
  accessToken: string,
) {
  const response = await client.rpc("get_participant_guessing", {
    p_session_id: sessionId,
    p_participant_id: participantId,
    p_access_token: accessToken,
  });
  return result<ParticipantGuessing>(response);
}

export async function saveParticipantGuess(
  client: SupabaseClient,
  input: {
    sessionId: string;
    pourId: string;
    participantId: string;
    accessToken: string;
    guess: { bottle_guess?: string | null; proof_guess?: number | null; price_guess?: number | null };
  },
) {
  const response = await client.rpc("save_participant_guess", {
    p_session_id: input.sessionId,
    p_pour_id: input.pourId,
    p_participant_id: input.participantId,
    p_access_token: input.accessToken,
    p_guess: input.guess,
  });
  return result<ParticipantGuess>(response);
}

export type WhiskeySummary = {
  whiskey: {
    id: string;
    name: string;
    distillery: string | null;
    proof: number | null;
    category: string | null;
    subcategory: string | null;
    bottle_size: string | null;
    rarity: string | null;
    msrp: number | null;
    secondary: number | null;
  };
  stats: {
    count: number;
    blind_count: number;
    rate_count: number;
    avg_total: number | null;
    categories: Record<string, number>;
    tags: { tag: string; count: number }[];
  };
  mine: { id: string; source: "blind" | "rate"; total: number; created_at: string }[];
  notes: {
    author: string;
    user_id: string | null;
    total: number;
    notes: string;
    source: "blind" | "rate";
    created_at: string;
  }[];
};

export async function getWhiskeySummary(client: SupabaseClient, whiskeyId: string) {
  const response = await client.rpc("get_whiskey_summary", { p_whiskey_id: whiskeyId });
  return result<WhiskeySummary>(response);
}

export async function getMyPalate(client: SupabaseClient) {
  const response = await client.rpc("get_my_palate");
  return result<{ entries: PalateEntry[]; matches: PalateMatchRow[] }>(response);
}
