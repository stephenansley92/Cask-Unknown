export const WHISKEY_SELECT_COLUMNS = [
  "id",
  "name",
  "distillery",
  "proof",
  "age",
  "bottle_size",
  "category",
  "subcategory",
  "rarity",
  "msrp",
  "secondary",
  "paid",
  "status",
  "notes",
  "identity_key",
].join(",");

export type WhiskeyOption = {
  id: string;
  name: string;
  distillery: string | null;
  proof: number | null;
  age: string | null;
  bottleSize: string | null;
  category: string | null;
  subcategory: string | null;
  rarity: string | null;
  msrp: number | null;
  secondary: number | null;
  paid: number | null;
  status: string | null;
  notes: string | null;
  identityKey: string | null;
};

export type WhiskeyFormValues = {
  name: string;
  distillery: string;
  proof: string;
  age: string;
  bottleSize: string;
  category: string;
  subcategory: string;
  rarity: string;
  msrp: string;
  secondary: string;
  paid: string;
  status: string;
  notes: string;
};

export const EMPTY_WHISKEY_FORM_VALUES: WhiskeyFormValues = {
  name: "",
  distillery: "",
  proof: "",
  age: "",
  bottleSize: "",
  category: "",
  subcategory: "",
  rarity: "",
  msrp: "",
  secondary: "",
  paid: "",
  status: "",
  notes: "",
};

function collapseWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

export function toNullableText(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const clean = collapseWhitespace(String(value));
  return clean ? clean : null;
}

export function parseOptionalNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const raw = String(value).trim();
  if (!raw) return null;

  const clean = raw.replace(/[$,\s]/g, "");
  if (!clean) return null;

  const parsed = Number(clean);
  if (Number.isNaN(parsed)) return null;
  return parsed;
}

function normalizeToken(value: string | null | undefined) {
  if (!value) return "";
  return collapseWhitespace(value).toLowerCase();
}

function normalizeProofValue(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return "";
  }
  return String(Number(value));
}

export function buildWhiskeyIdentityKey(input: {
  name: string | null | undefined;
  distillery?: string | null | undefined;
  proof?: number | null | undefined;
  bottleSize?: string | null | undefined;
}) {
  const name = normalizeToken(input.name);
  if (!name) return "";

  return [
    name,
    normalizeToken(input.distillery || ""),
    normalizeProofValue(input.proof),
    normalizeToken(input.bottleSize || ""),
  ].join("|");
}

export function mapWhiskeyRow(row: Record<string, unknown>): WhiskeyOption {
  return {
    id: String(row.id || ""),
    name: String(row.name || ""),
    distillery: toNullableText(row.distillery),
    proof: parseOptionalNumber(row.proof),
    age: toNullableText(row.age),
    bottleSize: toNullableText(row.bottle_size),
    category: toNullableText(row.category),
    subcategory: toNullableText(row.subcategory),
    rarity: toNullableText(row.rarity),
    msrp: parseOptionalNumber(row.msrp),
    secondary: parseOptionalNumber(row.secondary),
    paid: parseOptionalNumber(row.paid),
    status: toNullableText(row.status),
    notes: toNullableText(row.notes),
    identityKey: toNullableText(row.identity_key),
  };
}

export function buildWhiskeySearchText(whiskey: WhiskeyOption) {
  return [
    whiskey.name,
    whiskey.distillery,
    whiskey.proof !== null ? String(whiskey.proof) : null,
    whiskey.bottleSize,
    whiskey.category,
    whiskey.subcategory,
    whiskey.rarity,
    whiskey.status,
    whiskey.notes,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

export function buildWhiskeyInsertPayload(values: WhiskeyFormValues) {
  const name = collapseWhitespace(values.name);
  const distillery = toNullableText(values.distillery);
  const proof = parseOptionalNumber(values.proof);
  const bottleSize = toNullableText(values.bottleSize);

  return {
    name,
    distillery,
    proof,
    age: toNullableText(values.age),
    bottle_size: bottleSize,
    category: toNullableText(values.category),
    subcategory: toNullableText(values.subcategory),
    rarity: toNullableText(values.rarity),
    msrp: parseOptionalNumber(values.msrp),
    secondary: parseOptionalNumber(values.secondary),
    paid: parseOptionalNumber(values.paid),
    status: toNullableText(values.status),
    notes: toNullableText(values.notes),
    identity_key: buildWhiskeyIdentityKey({
      name,
      distillery,
      proof,
      bottleSize,
    }),
  };
}
