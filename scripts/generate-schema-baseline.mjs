import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const catalogPath = path.resolve(
  process.cwd(),
  process.argv[2] ?? "artifacts/supabase-preflight/production-catalog.json",
);
const outputPath = path.resolve(
  process.cwd(),
  process.argv[3] ?? "supabase/baseline/20260711_production.sql",
);
const catalog = JSON.parse(await readFile(catalogPath, "utf8"));

const quote = (value) => `"${String(value).replaceAll('"', '""')}"`;
const tableName = (value) => `public.${quote(value)}`;

function columnType(column) {
  if (column.data_type === "USER-DEFINED") return quote(column.udt_name);
  if (column.data_type === "ARRAY") return `${quote(column.udt_name.replace(/^_/, ""))}[]`;
  return column.data_type;
}

function policyRoles(value) {
  return value
    .replace(/^\{/, "")
    .replace(/\}$/, "")
    .split(",")
    .map((role) => (role === "public" ? "public" : quote(role)))
    .join(", ");
}

const lines = [
  "-- Canonical data-free baseline captured from production on 2026-07-11.",
  "-- Apply this once to a fresh Supabase project, then apply files in supabase/migrations in order.",
  "-- Never apply this baseline over an existing database.",
  "",
  "begin;",
  "",
  "create extension if not exists pgcrypto with schema extensions;",
  'create extension if not exists "uuid-ossp" with schema extensions;',
  "",
];

const columnsByTable = Map.groupBy(catalog.columns, (column) => column.table_name);
for (const table of catalog.tables) {
  const columns = columnsByTable.get(table.table_name) ?? [];
  lines.push(`create table ${tableName(table.table_name)} (`);
  lines.push(
    columns
      .map((column) => {
        const parts = [`  ${quote(column.column_name)} ${columnType(column)}`];
        if (column.column_default != null) parts.push(`default ${column.column_default}`);
        if (column.is_nullable === "NO") parts.push("not null");
        return parts.join(" ");
      })
      .join(",\n"),
  );
  lines.push(");", "");
}

const orderedConstraints = [
  ...catalog.constraints.filter((constraint) => constraint.constraint_type !== "f"),
  ...catalog.constraints.filter((constraint) => constraint.constraint_type === "f"),
];
for (const constraint of orderedConstraints) {
  lines.push(
    `alter table ${tableName(constraint.table_name)} add constraint ${quote(constraint.constraint_name)} ${constraint.definition};`,
  );
}
lines.push("");

const constraintNames = new Set(catalog.constraints.map((constraint) => constraint.constraint_name));
for (const index of catalog.indexes) {
  if (!constraintNames.has(index.index_name)) lines.push(`${index.definition};`);
}
lines.push("");

for (const fn of catalog.functions) {
  lines.push(`${fn.definition.trim()};`, "");
  const signature = `public.${quote(fn.function_name)}(${fn.arguments})`;
  lines.push(`revoke all on function ${signature} from public;`);
  const grantees = [];
  if (fn.anon_can_execute) grantees.push("anon");
  if (fn.authenticated_can_execute) grantees.push("authenticated");
  if (grantees.length > 0) {
    lines.push(`grant execute on function ${signature} to ${grantees.join(", ")};`);
  }
  lines.push("");
}

for (const trigger of catalog.triggers) lines.push(`${trigger.definition};`);
lines.push(
  "create trigger on_auth_user_created_signup_event after insert on auth.users",
  "for each row execute function public.log_signup_event();",
  "",
);

for (const table of catalog.tables) {
  if (table.row_level_security_enabled) {
    lines.push(`alter table ${tableName(table.table_name)} enable row level security;`);
  }
}
lines.push("");

for (const policy of catalog.policies) {
  const command = policy.cmd === "ALL" ? "all" : policy.cmd.toLowerCase();
  lines.push(
    `create policy ${quote(policy.policy_name)} on ${tableName(policy.table_name)}`,
    `  as ${policy.permissive.toLowerCase()} for ${command} to ${policyRoles(policy.roles)}`,
  );
  if (policy.qual != null) lines.push(`  using (${policy.qual})`);
  if (policy.with_check != null) lines.push(`  with check (${policy.with_check})`);
  lines.push(";", "");
}

const allowedGrantees = new Set(["anon", "authenticated", "service_role"]);
const groupedGrants = new Map();
for (const grant of catalog.tableGrants) {
  if (!allowedGrantees.has(grant.grantee)) continue;
  const key = `${grant.grantee}\0${grant.table_name}`;
  const item = groupedGrants.get(key) ?? {
    grantee: grant.grantee,
    tableName: grant.table_name,
    privileges: [],
  };
  item.privileges.push(grant.privilege_type.toLowerCase());
  groupedGrants.set(key, item);
}
for (const grant of groupedGrants.values()) {
  lines.push(
    `grant ${[...new Set(grant.privileges)].sort().join(", ")} on table ${tableName(grant.tableName)} to ${quote(grant.grantee)};`,
  );
}

lines.push("", "commit;", "");
await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(outputPath, lines.join("\n"), "utf8");
console.log(`Schema baseline: ${outputPath}`);
