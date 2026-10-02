#!/usr/bin/env node

/**
 * Applies migrations 0012-0016 (member groups, usage alerts, Reglamento v2, QR access control)
 * to the production Turso database, safely:
 *
 *   1. Backs up every table to backups/turso-<timestamp>.json (local file, gitignored).
 *   2. Detects which migrations are already applied and only runs the missing ones.
 *      All of them only ADD columns/tables/indexes; 0014 also overwrites five settings rows.
 *   3. Checks that no table lost rows.
 *
 * Dry run by default (backup + report only). Pass --apply to run the migrations.
 *
 * Usage (PowerShell):
 *   $env:DATABASE_URL="libsql://..."; $env:DATABASE_AUTH_TOKEN="..."
 *   node scripts/migrate-prod-reglamento.mjs            # dry run
 *   node scripts/migrate-prod-reglamento.mjs --apply    # apply
 */

import { createClient } from "@libsql/client";
import { mkdirSync, readFileSync, writeFileSync } from "fs";

const apply = process.argv.includes("--apply");
const url = process.env.DATABASE_URL;
const authToken = process.env.DATABASE_AUTH_TOKEN;

if (!url || !url.startsWith("libsql://") || !authToken) {
  console.error("❌ Set DATABASE_URL (libsql://...) and DATABASE_AUTH_TOKEN for the production Turso database.");
  process.exit(1);
}

const client = createClient({ url, authToken });

async function tableNames() {
  const res = await client.execute(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_litestream%' AND name NOT LIKE 'libsql_%'"
  );
  return res.rows.map((r) => String(r.name));
}

async function columns(table) {
  const res = await client.execute(`PRAGMA table_info(\`${table}\`)`);
  return res.rows.map((r) => String(r.name));
}

async function rowCounts(tables) {
  const counts = {};
  for (const t of tables) {
    const res = await client.execute(`SELECT count(*) AS n FROM \`${t}\``);
    counts[t] = Number(res.rows[0].n);
  }
  return counts;
}

// Each migration's marker: present = already applied
const MIGRATIONS = [
  { file: "0012_add_member_groups.sql", applied: async (t) => (await columns("members")).includes("member_code") },
  { file: "0013_add_member_usage_alerts.sql", applied: async (t) => t.includes("member_usage_alerts") },
  { file: "0014_align_reglamento_v2.sql", applied: async () => (await columns("bookings")).includes("late_cancellation") },
  { file: "0015_add_pilot_and_declared_people.sql", applied: async () => (await columns("bookings")).includes("pilot_name") },
  { file: "0016_add_access_codes_and_check_ins.sql", applied: async () => (await columns("bookings")).includes("access_code") },
];

async function main() {
  console.log(`🔗 ${url}`);
  console.log(apply ? "⚙️  Mode: APPLY" : "🔍 Mode: DRY RUN (nothing will be changed; use --apply)");

  // 1. Backup
  const tables = await tableNames();
  const backup = {};
  for (const t of tables) {
    backup[t] = (await client.execute(`SELECT * FROM \`${t}\``)).rows;
  }
  mkdirSync("backups", { recursive: true });
  const backupFile = `backups/turso-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
  writeFileSync(backupFile, JSON.stringify(backup, (_k, v) => (typeof v === "bigint" ? Number(v) : v), 2));
  const before = await rowCounts(tables);
  console.log(`💾 Backup: ${backupFile}`);
  console.log("📊 Rows:", Object.entries(before).map(([t, n]) => `${t}=${n}`).join(", "));

  // 2. Pending migrations
  const pending = [];
  for (const m of MIGRATIONS) {
    const done = await m.applied(tables);
    console.log(`${done ? "✅ already applied" : "⏳ pending        "}  ${m.file}`);
    if (!done) pending.push(m);
  }

  if (pending.length === 0) {
    console.log("🎉 Nothing to do: all migrations are already applied.");
    return;
  }

  if (!apply) {
    console.log(`\nRun again with --apply to apply ${pending.length} migration(s).`);
    return;
  }

  for (const m of pending) {
    await client.executeMultiple(readFileSync(`migrations/${m.file}`, "utf8"));
    console.log(`✅ Applied ${m.file}`);
  }

  // 3. Verify no rows were lost
  const after = await rowCounts(tables);
  const lost = tables.filter((t) => after[t] < before[t]);
  if (lost.length > 0) {
    console.error("❌ Row count dropped in:", lost.join(", "), `- restore from ${backupFile}`);
    process.exit(1);
  }
  console.log("🛡️  Verified: no table lost rows.");
  console.log("🎉 Done.");
}

main().catch((err) => {
  console.error("❌", err.message);
  console.error("Stopped. Data already in the database is untouched by a failed ALTER/CREATE; the backup file is above.");
  process.exit(1);
});
