import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import pg from "pg";

const { Client } = pg;
const databaseUrl = process.env.SUPABASE_DB_URL;
const outputDirectory = path.resolve(
  process.cwd(),
  process.argv[2] ?? "artifacts/supabase-preflight",
);

if (!databaseUrl) {
  throw new Error("Set SUPABASE_DB_URL before running the catalog export.");
}

const catalogQueries = {
  database: `
    select
      current_database() as database_name,
      current_setting('server_version') as postgres_version,
      now() as inspected_at
  `,
  extensions: `
    select extname as name, extversion as version
    from pg_extension
    order by extname
  `,
  enums: `
    select
      n.nspname as schema_name,
      t.typname as enum_name,
      e.enumlabel as value,
      e.enumsortorder as sort_order
    from pg_type t
    join pg_enum e on e.enumtypid = t.oid
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public'
    order by t.typname, e.enumsortorder
  `,
  tables: `
    select
      c.relname as table_name,
      c.relrowsecurity as row_level_security_enabled,
      c.relforcerowsecurity as row_level_security_forced
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind in ('r', 'p')
    order by c.relname
  `,
  columns: `
    select
      table_name,
      ordinal_position,
      column_name,
      data_type,
      udt_name,
      is_nullable,
      column_default,
      is_identity,
      identity_generation,
      is_generated,
      generation_expression
    from information_schema.columns
    where table_schema = 'public'
    order by table_name, ordinal_position
  `,
  constraints: `
    select
      c.relname as table_name,
      con.conname as constraint_name,
      con.contype as constraint_type,
      pg_get_constraintdef(con.oid, true) as definition
    from pg_constraint con
    join pg_class c on c.oid = con.conrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
    order by c.relname, con.conname
  `,
  indexes: `
    select tablename as table_name, indexname as index_name, indexdef as definition
    from pg_indexes
    where schemaname = 'public'
    order by tablename, indexname
  `,
  policies: `
    select tablename as table_name, policyname as policy_name, permissive, roles, cmd, qual, with_check
    from pg_policies
    where schemaname = 'public'
    order by tablename, policyname
  `,
  functions: `
    select
      p.proname as function_name,
      pg_get_function_identity_arguments(p.oid) as arguments,
      p.prosecdef as security_definer,
      p.provolatile as volatility,
      pg_get_userbyid(p.proowner) as owner,
      has_function_privilege('anon', p.oid, 'execute') as anon_can_execute,
      has_function_privilege('authenticated', p.oid, 'execute') as authenticated_can_execute,
      pg_get_functiondef(p.oid) as definition
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
    order by p.proname, arguments
  `,
  triggers: `
    select
      c.relname as table_name,
      t.tgname as trigger_name,
      pg_get_triggerdef(t.oid, true) as definition
    from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and not t.tgisinternal
    order by c.relname, t.tgname
  `,
  tableGrants: `
    select grantee, table_name, privilege_type, is_grantable
    from information_schema.table_privileges
    where table_schema = 'public'
    order by table_name, grantee, privilege_type
  `,
  routineGrants: `
    select grantee, routine_name, privilege_type, is_grantable
    from information_schema.routine_privileges
    where routine_schema = 'public'
    order by routine_name, grantee, privilege_type
  `,
  publications: `
    select pubname as publication_name, tablename as table_name
    from pg_publication_tables
    where schemaname = 'public'
    order by pubname, tablename
  `,
};

function jsonReplacer(_key, value) {
  return typeof value === "bigint" ? value.toString() : value;
}

const client = new Client({
  connectionString: databaseUrl,
  ssl: { rejectUnauthorized: false },
  application_name: "cask-unknown-read-only-preflight",
});

await mkdir(outputDirectory, { recursive: true });

try {
  await client.connect();
  await client.query("begin transaction read only");

  const catalog = {};
  for (const [name, query] of Object.entries(catalogQueries)) {
    const result = await client.query(query);
    catalog[name] = result.rows;
  }

  const preflightSql = await readFile(
    path.resolve(process.cwd(), "supabase/preflight.sql"),
    "utf8",
  );
  const preflightResults = await client.query(preflightSql);
  const resultSets = Array.isArray(preflightResults)
    ? preflightResults
    : [preflightResults];

  await writeFile(
    path.join(outputDirectory, "production-catalog.json"),
    `${JSON.stringify(catalog, jsonReplacer, 2)}\n`,
    "utf8",
  );
  await writeFile(
    path.join(outputDirectory, "preflight-results.json"),
    `${JSON.stringify(
      resultSets
        .filter((result) => result.command === "SELECT")
        .map((result) => ({ fields: result.fields.map((field) => field.name), rows: result.rows })),
      jsonReplacer,
      2,
    )}\n`,
    "utf8",
  );

  await client.query("rollback");
} catch (error) {
  try {
    await client.query("rollback");
  } catch {
    // The connection may have failed before a transaction was opened.
  }
  throw error;
} finally {
  await client.end();
}

console.log(`Catalog export: ${path.join(outputDirectory, "production-catalog.json")}`);
console.log(`Preflight data: ${path.join(outputDirectory, "preflight-results.json")}`);
