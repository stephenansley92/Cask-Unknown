"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  buildWhiskeyIdentityKey,
  buildWhiskeyInsertPayload,
  EMPTY_WHISKEY_FORM_VALUES,
  type WhiskeyFormValues,
} from "@/lib/whiskey/schema";

const OWNER_EMAIL = "stephen.ansley92@gmail.com";

function adminRedirect(message = "") {
  if (!message) return "/admin/library-import";
  return `/admin/library-import?message=${encodeURIComponent(message)}`;
}

async function requireOwner() {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?redirectTo=%2Fadmin%2Flibrary-import");
  }

  if ((user.email || "").trim().toLowerCase() !== OWNER_EMAIL) {
    redirect("/profile");
  }

  return { supabase, user };
}

function parseCsv(text: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let index = 0;

  const input = text.replace(/^\uFEFF/, "");

  while (index < input.length) {
    const char = input[index];
    const next = input[index + 1];

    if (inQuotes) {
      if (char === '"' && next === '"') {
        field += '"';
        index += 2;
        continue;
      }
      if (char === '"') {
        inQuotes = false;
        index += 1;
        continue;
      }
      field += char;
      index += 1;
      continue;
    }

    if (char === '"') {
      inQuotes = true;
      index += 1;
      continue;
    }

    if (char === ",") {
      row.push(field);
      field = "";
      index += 1;
      continue;
    }

    if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      index += 1;
      continue;
    }

    if (char === "\r") {
      index += 1;
      continue;
    }

    field += char;
    index += 1;
  }

  row.push(field);
  if (row.some((value) => value.trim().length > 0)) {
    rows.push(row);
  }

  return rows;
}

function normalizeHeader(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function getCsvValue(
  row: string[],
  headerIndexByKey: Map<string, number>,
  key: string
) {
  const index = headerIndexByKey.get(key);
  if (index === undefined || index < 0 || index >= row.length) return "";
  return row[index]?.trim() || "";
}

type ExistingWhiskeyRow = {
  id: string;
  name: string;
  distillery: string | null;
  proof: number | null;
  bottle_size: string | null;
  category: string | null;
  subcategory: string | null;
  rarity: string | null;
  msrp: number | null;
  secondary: number | null;
  paid: number | null;
  status: string | null;
  notes: string | null;
  identity_key: string | null;
};

function shouldFillText(existing: string | null, incoming: string | null) {
  return (!existing || !existing.trim()) && Boolean(incoming && incoming.trim());
}

function shouldFillNumber(existing: number | null, incoming: number | null) {
  return (existing === null || existing === undefined) && incoming !== null;
}

export async function importCollectionCsvAction(formData: FormData) {
  const { supabase, user } = await requireOwner();

  const fileValue = formData.get("file");
  if (!(fileValue instanceof File)) {
    redirect(adminRedirect("Please choose a CSV file."));
  }

  const rawText = await fileValue.text();
  if (!rawText.trim()) {
    redirect(adminRedirect("CSV is empty."));
  }

  const rows = parseCsv(rawText);
  if (rows.length < 2) {
    redirect(adminRedirect("CSV must include a header row and at least one data row."));
  }

  const headers = rows[0].map(normalizeHeader);
  const headerIndexByKey = new Map<string, number>();
  headers.forEach((header, index) => {
    headerIndexByKey.set(header, index);
  });

  if (!headerIndexByKey.has("name")) {
    redirect(adminRedirect("CSV is missing required Name column."));
  }

  const { data: existingData, error: existingError } = await supabase
    .from("whiskeys")
    .select(
      "id,name,distillery,proof,bottle_size,category,subcategory,rarity,msrp,secondary,paid,status,notes,identity_key"
    )
    .eq("user_id", user.id);

  if (existingError) {
    redirect(adminRedirect(existingError.message));
  }

  const existingByKey = new Map<string, ExistingWhiskeyRow>();
  for (const raw of (existingData || []) as ExistingWhiskeyRow[]) {
    const key =
      raw.identity_key ||
      buildWhiskeyIdentityKey({
        name: raw.name,
        distillery: raw.distillery,
        proof: raw.proof,
        bottleSize: raw.bottle_size,
      });
    if (key) existingByKey.set(key, raw);
  }

  let inserted = 0;
  let updated = 0;
  let skipped = 0;

  for (const row of rows.slice(1)) {
    const whiskeyValues: WhiskeyFormValues = {
      ...EMPTY_WHISKEY_FORM_VALUES,
      name: getCsvValue(row, headerIndexByKey, "name"),
      bottleSize: getCsvValue(row, headerIndexByKey, "size"),
      category: getCsvValue(row, headerIndexByKey, "category"),
      subcategory: getCsvValue(row, headerIndexByKey, "subcategory"),
      proof: getCsvValue(row, headerIndexByKey, "proof"),
      rarity: getCsvValue(row, headerIndexByKey, "rarity"),
      distillery: getCsvValue(row, headerIndexByKey, "distillery"),
      msrp: getCsvValue(row, headerIndexByKey, "msrp"),
      secondary: getCsvValue(row, headerIndexByKey, "secondary"),
      paid: getCsvValue(row, headerIndexByKey, "paid"),
      status: getCsvValue(row, headerIndexByKey, "status"),
      notes: getCsvValue(row, headerIndexByKey, "notes"),
    };

    const payload = buildWhiskeyInsertPayload(whiskeyValues);
    if (!payload.name) {
      skipped += 1;
      continue;
    }

    const key = payload.identity_key || "";
    const existing = key ? existingByKey.get(key) : undefined;

    if (existing) {
      const patch: Record<string, string | number | null> = {};

      if (shouldFillText(existing.distillery, payload.distillery)) {
        patch.distillery = payload.distillery;
      }
      if (shouldFillNumber(existing.proof, payload.proof)) {
        patch.proof = payload.proof;
      }
      if (shouldFillText(existing.bottle_size, payload.bottle_size)) {
        patch.bottle_size = payload.bottle_size;
      }
      if (shouldFillText(existing.category, payload.category)) {
        patch.category = payload.category;
      }
      if (shouldFillText(existing.subcategory, payload.subcategory)) {
        patch.subcategory = payload.subcategory;
      }
      if (shouldFillText(existing.rarity, payload.rarity)) {
        patch.rarity = payload.rarity;
      }
      if (shouldFillNumber(existing.msrp, payload.msrp)) {
        patch.msrp = payload.msrp;
      }
      if (shouldFillNumber(existing.secondary, payload.secondary)) {
        patch.secondary = payload.secondary;
      }
      if (shouldFillNumber(existing.paid, payload.paid)) {
        patch.paid = payload.paid;
      }
      if (shouldFillText(existing.status, payload.status)) {
        patch.status = payload.status;
      }
      if (shouldFillText(existing.notes, payload.notes)) {
        patch.notes = payload.notes;
      }
      if (!existing.identity_key && key) {
        patch.identity_key = key;
      }

      if (Object.keys(patch).length === 0) {
        skipped += 1;
        continue;
      }

      const { error: updateError } = await supabase
        .from("whiskeys")
        .update(patch)
        .eq("id", existing.id);

      if (updateError) {
        redirect(adminRedirect(updateError.message));
      }

      updated += 1;
      continue;
    }

    const payloadWithoutAge = Object.fromEntries(
      Object.entries(payload).filter(([key]) => key !== "age")
    );

    const { data: insertedRow, error: insertError } = await supabase
      .from("whiskeys")
      .insert({
        user_id: user.id,
        ...payloadWithoutAge,
      })
      .select(
        "id,name,distillery,proof,bottle_size,category,subcategory,rarity,msrp,secondary,paid,status,notes,identity_key"
      )
      .single();

    if (insertError) {
      redirect(adminRedirect(insertError.message));
    }

    if (insertedRow) {
      inserted += 1;
      const mapped = insertedRow as ExistingWhiskeyRow;
      const mappedKey =
        mapped.identity_key ||
        buildWhiskeyIdentityKey({
          name: mapped.name,
          distillery: mapped.distillery,
          proof: mapped.proof,
          bottleSize: mapped.bottle_size,
        });
      if (mappedKey) existingByKey.set(mappedKey, mapped);
    }
  }

  redirect(
    adminRedirect(
      `Import complete. Rows: ${rows.length - 1}. Inserted: ${inserted}. Updated: ${updated}. Skipped: ${skipped}.`
    )
  );
}
