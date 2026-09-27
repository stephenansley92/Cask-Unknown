// Flavor vocabulary for quick tap-to-tag tasting notes. Tags are stored
// lowercase (the database normalizes them too); labels are for display.

export const FLAVOR_FAMILIES = [
  {
    key: "sweet",
    label: "Sweet",
    tags: ["caramel", "vanilla", "toffee", "honey", "maple", "brown sugar", "chocolate"],
  },
  {
    key: "fruit",
    label: "Fruit",
    tags: ["cherry", "apple", "orange peel", "dried fruit", "banana", "berry"],
  },
  {
    key: "spice",
    label: "Spice",
    tags: ["cinnamon", "clove", "black pepper", "nutmeg", "rye spice", "mint"],
  },
  {
    key: "wood",
    label: "Wood & earth",
    tags: ["oak", "char", "tobacco", "leather", "cedar", "smoke"],
  },
  {
    key: "grain",
    label: "Grain & nut",
    tags: ["grain", "bread", "corn", "peanut", "almond", "pecan"],
  },
  {
    key: "other",
    label: "Other",
    tags: ["floral", "herbal", "citrus", "ethanol heat", "medicinal", "peat"],
  },
] as const;

export const MAX_FLAVOR_TAGS = 16;

const FAMILY_BY_TAG = new Map<string, string>(
  FLAVOR_FAMILIES.flatMap((family) => family.tags.map((tag) => [tag, family.key] as const)),
);

export function flavorFamilyOf(tag: string) {
  return FAMILY_BY_TAG.get(tag.toLowerCase()) ?? "other";
}

export function flavorLabel(tag: string) {
  const clean = tag.trim();
  return clean.charAt(0).toUpperCase() + clean.slice(1);
}

/** Lowercase, trim, dedupe, and cap a tag list the way the database does. */
export function normalizeFlavorTags(tags: readonly string[] | null | undefined): string[] {
  const seen = new Set<string>();
  for (const raw of tags ?? []) {
    const tag = String(raw).trim().toLowerCase().slice(0, 32);
    if (tag) seen.add(tag);
  }
  return [...seen].slice(0, MAX_FLAVOR_TAGS);
}

export function toggleFlavorTag(tags: readonly string[], tag: string): string[] {
  const key = tag.toLowerCase();
  if (tags.includes(key)) return tags.filter((t) => t !== key);
  if (tags.length >= MAX_FLAVOR_TAGS) return [...tags];
  return [...tags, key];
}

/** Count tags across many tag lists, most common first. */
export function countFlavorTags(lists: Array<readonly string[] | null | undefined>) {
  const counts = new Map<string, number>();
  for (const list of lists) {
    for (const tag of normalizeFlavorTags(list)) counts.set(tag, (counts.get(tag) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
}
