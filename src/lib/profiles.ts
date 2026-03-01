export const ACTIVE_PROFILE_STORAGE_KEY = "cask_unknown_active_profile";
export const SAVED_PROFILES_STORAGE_KEY = "cask_unknown_saved_profiles";

// Seed list: permanent defaults that always appear.
export const BASE_PROFILES = ["Caleb", "Stephen", "Wayne's World", "Guest"] as const;

export function getProfileOptions() {
  const base = [...BASE_PROFILES];

  if (typeof window === "undefined") {
    return base;
  }

  const raw = window.localStorage.getItem(SAVED_PROFILES_STORAGE_KEY);
  if (!raw) {
    return base;
  }

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return base;
    }

    const custom = parsed
      .map((value) => (typeof value === "string" ? value.trim() : ""))
      .filter(Boolean);

    return [...new Set([...base, ...custom])];
  } catch {
    return base;
  }
}

export function saveProfileOption(name: string) {
  const clean = name.trim();
  if (!clean || typeof window === "undefined") {
    return;
  }

  const next = [...new Set([...getProfileOptions(), clean])];
  window.localStorage.setItem(SAVED_PROFILES_STORAGE_KEY, JSON.stringify(next));
}
