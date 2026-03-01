import type { SupabaseClient } from "@supabase/supabase-js";

type DefaultTemplateItem = {
  item_key: string;
  label: string;
  max_points: number;
  weight: number;
  sort_order: number;
};

export const BLIND_MODE_DEFAULT_TEMPLATE = {
  name: "Default",
  is_default: true,
  items: [
    {
      item_key: "nose",
      label: "Nose",
      max_points: 10,
      weight: 10,
      sort_order: 1,
    },
    {
      item_key: "flavor",
      label: "Flavor",
      max_points: 20,
      weight: 20,
      sort_order: 2,
    },
    {
      item_key: "mouthfeel",
      label: "Mouthfeel",
      max_points: 10,
      weight: 10,
      sort_order: 3,
    },
    {
      item_key: "complexity",
      label: "Complexity",
      max_points: 10,
      weight: 10,
      sort_order: 4,
    },
    {
      item_key: "balance",
      label: "Balance",
      max_points: 10,
      weight: 10,
      sort_order: 5,
    },
    {
      item_key: "finish",
      label: "Finish",
      max_points: 10,
      weight: 10,
      sort_order: 6,
    },
    {
      item_key: "uniqueness",
      label: "Uniqueness",
      max_points: 10,
      weight: 10,
      sort_order: 7,
    },
    {
      item_key: "drinkability",
      label: "Drinkability",
      max_points: 10,
      weight: 10,
      sort_order: 8,
    },
    {
      item_key: "packaging",
      label: "Packaging / Looks",
      max_points: 5,
      weight: 5,
      sort_order: 9,
    },
    {
      item_key: "value",
      label: "Value",
      max_points: 5,
      weight: 5,
      sort_order: 10,
    },
  ] satisfies DefaultTemplateItem[],
} as const;

async function insertTemplateItems(
  supabase: SupabaseClient,
  templateId: string,
  items: readonly DefaultTemplateItem[]
) {
  const withWeights = items.map((item) => ({
    template_id: templateId,
    item_key: item.item_key,
    label: item.label,
    max_points: item.max_points,
    weight: item.weight,
    sort_order: item.sort_order,
  }));

  const weightedInsert = await supabase
    .from("template_items")
    .insert(withWeights);

  if (!weightedInsert.error) {
    return;
  }

  const withMaxScore = items.map((item) => ({
    template_id: templateId,
    item_key: item.item_key,
    label: item.label,
    max_score: item.max_points,
    sort_order: item.sort_order,
  }));

  const fallbackInsert = await supabase
    .from("template_items")
    .insert(withMaxScore);

  if (fallbackInsert.error) {
    throw fallbackInsert.error;
  }
}

export async function ensureDefaultRateTemplate(
  supabase: SupabaseClient,
  userId: string
) {
  const { data: existingTemplates, error: existingError } = await supabase
    .from("templates")
    .select("id")
    .eq("user_id", userId)
    .limit(1);

  if (existingError) {
    throw existingError;
  }

  if ((existingTemplates || []).length > 0) {
    return false;
  }

  const { data: createdTemplate, error: createError } = await supabase
    .from("templates")
    .insert({
      user_id: userId,
      name: BLIND_MODE_DEFAULT_TEMPLATE.name,
      is_default: BLIND_MODE_DEFAULT_TEMPLATE.is_default,
    })
    .select("id")
    .single();

  if (createError) {
    throw createError;
  }

  const templateId = createdTemplate?.id as string | undefined;
  if (!templateId) {
    throw new Error("Default template was created without an id.");
  }

  try {
    await insertTemplateItems(
      supabase,
      templateId,
      BLIND_MODE_DEFAULT_TEMPLATE.items
    );
  } catch (error) {
    await supabase.from("templates").delete().eq("id", templateId);
    throw error;
  }

  return true;
}

export type RateTemplate = {
  id: string;
  name: string;
};

export type RateTemplateItem = {
  id: string;
  itemKey: string;
  label: string;
  maxPoints: number;
  weight: number;
  sortOrder: number;
};

export type BlindModeCategorySetting = {
  key: string;
  label: string;
  min: number;
  max: number;
  group: "core" | "reveal";
  description: string;
  examples: string;
};

export const BLIND_MODE_CATEGORY_SETTINGS: BlindModeCategorySetting[] = [
  {
    key: "nose",
    label: "Nose",
    min: 0,
    max: 10,
    group: "core",
    description: "How appealing the aroma is before you sip.",
    examples: "Examples: vanilla, caramel, oak, fruit, baking spice",
  },
  {
    key: "flavor",
    label: "Flavor",
    min: 0,
    max: 20,
    group: "core",
    description: "How much you enjoy the taste on the palate.",
    examples: "Examples: toffee, cherry, cinnamon, peanut, dark chocolate",
  },
  {
    key: "mouthfeel",
    label: "Mouthfeel",
    min: 0,
    max: 10,
    group: "core",
    description: "Texture and body in the mouth.",
    examples: "Examples: oily, creamy, silky, thin, hot",
  },
  {
    key: "complexity",
    label: "Complexity",
    min: 0,
    max: 10,
    group: "core",
    description: "How layered, interesting, and evolving it feels.",
    examples: "Examples: changing notes, depth, new flavors on revisit",
  },
  {
    key: "balance",
    label: "Balance",
    min: 0,
    max: 10,
    group: "core",
    description: "How well the sweetness, oak, proof, and spice fit together.",
    examples: "Examples: integrated, harmonious, not too sweet, not too sharp",
  },
  {
    key: "finish",
    label: "Finish",
    min: 0,
    max: 10,
    group: "core",
    description: "How pleasant and lasting the aftertaste is.",
    examples: "Examples: long, warm, drying, lingering spice, clean fade",
  },
  {
    key: "uniqueness",
    label: "Uniqueness",
    min: 0,
    max: 10,
    group: "core",
    description:
      "How distinctive or memorable it is versus the rest of the flight.",
    examples: "Examples: unusual profile, standout note, memorable finish",
  },
  {
    key: "drinkability",
    label: "Drinkability",
    min: 0,
    max: 10,
    group: "core",
    description: "How easy it is to keep sipping and enjoy.",
    examples: "Examples: approachable, smooth, easy to revisit, not harsh",
  },
  {
    key: "packaging",
    label: "Packaging / Looks",
    min: 0,
    max: 5,
    group: "reveal",
    description:
      "How much you like the bottle presentation once the host unlocks it.",
    examples: "Examples: label design, bottle shape, shelf appeal, presentation",
  },
  {
    key: "value",
    label: "Value",
    min: 0,
    max: 5,
    group: "reveal",
    description:
      "How fair the bottle feels for the price after reveal-stage scoring opens.",
    examples:
      "Examples: worth the money, overpriced, daily buy, special occasion buy",
  },
];

export function getBlindModeCategorySetting(itemKey: string) {
  return BLIND_MODE_CATEGORY_SETTINGS.find((item) => item.key === itemKey) || null;
}

async function loadDefaultTemplate(
  supabase: SupabaseClient,
  userId: string
): Promise<RateTemplate | null> {
  const { data: defaultTemplate, error: defaultError } = await supabase
    .from("templates")
    .select("id,name")
    .eq("user_id", userId)
    .eq("is_default", true)
    .limit(1)
    .maybeSingle();

  if (defaultError) {
    throw defaultError;
  }

  if (defaultTemplate) {
    return {
      id: defaultTemplate.id as string,
      name: (defaultTemplate.name as string) || BLIND_MODE_DEFAULT_TEMPLATE.name,
    };
  }

  const { data: firstTemplate, error: firstError } = await supabase
    .from("templates")
    .select("id,name")
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();

  if (firstError) {
    throw firstError;
  }

  if (!firstTemplate) {
    return null;
  }

  return {
    id: firstTemplate.id as string,
    name: (firstTemplate.name as string) || BLIND_MODE_DEFAULT_TEMPLATE.name,
  };
}

async function loadTemplateItems(
  supabase: SupabaseClient,
  templateId: string
): Promise<RateTemplateItem[]> {
  const weightedResponse = await supabase
    .from("template_items")
    .select("id,item_key,label,max_points,weight,sort_order")
    .eq("template_id", templateId)
    .order("sort_order", { ascending: true });

  if (!weightedResponse.error) {
    return ((weightedResponse.data || []) as Record<string, unknown>[]).map(
      (item) => ({
        id: item.id as string,
        itemKey: item.item_key as string,
        label: item.label as string,
        maxPoints: Number(item.max_points ?? 0),
        weight: Number(item.weight ?? item.max_points ?? 0),
        sortOrder: Number(item.sort_order ?? 0),
      })
    );
  }

  const fallbackResponse = await supabase
    .from("template_items")
    .select("id,item_key,label,max_score,sort_order")
    .eq("template_id", templateId)
    .order("sort_order", { ascending: true });

  if (fallbackResponse.error) {
    throw fallbackResponse.error;
  }

  return ((fallbackResponse.data || []) as Record<string, unknown>[]).map(
    (item) => ({
      id: item.id as string,
      itemKey: item.item_key as string,
      label: item.label as string,
      maxPoints: Number(item.max_score ?? 0),
      weight: Number(item.max_score ?? 0),
      sortOrder: Number(item.sort_order ?? 0),
    })
  );
}

export async function getDefaultRateTemplateWithItems(
  supabase: SupabaseClient,
  userId: string
) {
  await ensureDefaultRateTemplate(supabase, userId);

  const template = await loadDefaultTemplate(supabase, userId);
  if (!template) {
    throw new Error("No default template available.");
  }

  const items = await loadTemplateItems(supabase, template.id);

  return {
    template,
    items,
  };
}
