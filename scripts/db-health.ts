import pg from "pg";

const { Client } = pg;

const APP_TABLES = ["shipdb", "analytics", "ship_signatures", "favoritedb", "collections"];

let pass = 0;
let warn = 0;
let fail = 0;

function ok(label: string, detail = "") {
  pass++;
  console.log(`  ✓ ${label}${detail ? ` — ${detail}` : ""}`);
}

function warn_(label: string, detail: string) {
  warn++;
  console.log(`  ⚠ ${label} — ${detail}`);
}

function fail_(label: string, detail: string) {
  fail++;
  console.log(`  ✗ ${label} — ${detail}`);
}

function section(title: string) {
  console.log(`\n── ${title} ─${"─".repeat(Math.max(0, 60 - title.length))}`);
}

async function main() {
  const client = new Client({
    host: process.env.POSTGRES_HOST,
    port: parseInt(process.env.POSTGRES_PORT ?? "6543", 10),
    database: process.env.POSTGRES_DATABASE,
    user: process.env.POSTGRES_USER,
    password: process.env.POSTGRES_PASSWORD,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();

  console.log("PostgreSQL health check");
  console.log("=======================");

  const svr = await client.query("SELECT version(), pg_postmaster_start_time() AS started");
  const started = new Date(svr.rows[0].started);
  const uptimeDays = Math.floor((Date.now() - started.getTime()) / 86400000);
  ok(
    `connected to ${process.env.POSTGRES_HOST}`,
    `version ${svr.rows[0].version.split(" on ")[0].split(" ").slice(0, 2).join(" ")}, up ${uptimeDays}d`
  );

  section("Memory configuration");
  const cfg = await client.query(
    "SELECT name, setting, unit FROM pg_settings WHERE name IN ('shared_buffers','work_mem','effective_cache_size','max_connections','temp_buffers')"
  );
  const cfgMap: Record<string, string> = {};
  for (const r of cfg.rows) cfgMap[r.name] = `${r.setting}${r.unit ?? ""}`;
  for (const name of ["shared_buffers", "work_mem", "effective_cache_size", "max_connections", "temp_buffers"]) {
    console.log(`    ${name.padEnd(22)} ${cfgMap[name] ?? "n/a"}`);
  }
  const eckb = parseInt(cfgMap.effective_cache_size ?? "0", 10);
  if (eckb > 0 && eckb <= 393216) {
    warn_("effective_cache_size", `${cfgMap.effective_cache_size} is low — consider 50-70% of instance RAM in Supabase settings`);
  }

  section("Cache effectiveness");
  const hit = await client.query(
    `SELECT round((blks_hit*100.0/(blks_hit+blks_read+1))::numeric,2) AS pct,
            blks_read, temp_files, pg_size_pretty(temp_bytes) AS temp_bytes
     FROM pg_stat_database WHERE datname = current_database()`
  );
  const h = hit.rows[0];
  const hitPct = parseFloat(h.pct);
  if (hitPct >= 99) ok("shared buffer cache hit ratio", `${hitPct}%`);
  else if (hitPct >= 95) warn_("shared buffer cache hit ratio", `${hitPct}% (target ≥ 99%)`);
  else fail_("shared buffer cache hit ratio", `${hitPct}% (target ≥ 99%)`);
  ok("temp files (disk spills)", `${h.temp_files} files / ${h.temp_bytes}`);

  section("Connections");
  const conn = await client.query(
    `SELECT count(*)::int AS total,
            count(*) FILTER (WHERE state='active')::int AS active,
            count(*) FILTER (WHERE state='idle')::int AS idle,
            count(*) FILTER (WHERE state='idle in transaction')::int AS idle_txn
     FROM pg_stat_activity`
  );
  const c = conn.rows[0];
  const maxConn = parseInt(cfgMap.max_connections ?? "100", 10);
  ok("total connections", `${c.total}/${maxConn} (active ${c.active}, idle ${c.idle})`);
  if (c.idle_txn > 0) warn_("idle in transaction", `${c.idle_txn} connections holding resources`);
  else ok("idle in transaction", "0");

  const long = await client.query(
    `SELECT pid, now()-query_start AS age, left(query, 70) AS q
     FROM pg_stat_activity
     WHERE state='active' AND query_start < now() - interval '5 seconds'
       AND query NOT ILIKE '%pg_stat%' ORDER BY query_start LIMIT 5`
  );
  if (long.rows.length === 0) ok("long-running queries", "none > 5s");
  else {
    warn_("long-running queries", `${long.rows.length} active > 5s`);
    for (const r of long.rows) console.log(`      pid ${r.pid} ${r.age}: ${r.q}`);
  }

  section("Top queries (pg_stat_statements)");
  try {
    const topTotal = await client.query(
      `SELECT round(total_exec_time::numeric) AS total_ms, calls,
              round(mean_exec_time::numeric,1) AS mean_ms,
              left(regexp_replace(query,'\\s+',' ','g'), 70) AS q
       FROM pg_stat_statements
       WHERE query NOT ILIKE '%source: dashboard%'
       ORDER BY total_exec_time DESC LIMIT 5`
    );
    console.log("  by total time:");
    for (const r of topTotal.rows) {
      console.log(`    ${r.total_ms}ms / ${r.calls} calls (mean ${r.mean_ms}ms): ${r.q}`);
    }
    const topMean = await client.query(
      `SELECT round(mean_exec_time::numeric,1) AS mean_ms, calls,
              left(regexp_replace(query,'\\s+',' ','g'), 70) AS q
       FROM pg_stat_statements
       WHERE query NOT ILIKE '%source: dashboard%'
       ORDER BY mean_exec_time DESC LIMIT 5`
    );
    console.log("  by mean latency:");
    for (const r of topMean.rows) {
      console.log(`    ${r.mean_ms}ms mean / ${r.calls} calls: ${r.q}`);
    }
  } catch {
    warn_("pg_stat_statements", "extension not accessible — skipping query analysis");
  }

  section("App tables & scan patterns");
  const tables = await client.query(
    `SELECT relname, pg_size_pretty(pg_total_relation_size(relid)) AS size,
            pg_total_relation_size(relid) AS bytes,
            n_live_tup, n_dead_tup, seq_scan, idx_scan, last_autovacuum
     FROM pg_stat_user_tables
     WHERE schemaname='public' AND relname = ANY($1::text[])
     ORDER BY pg_total_relation_size(relid) DESC`,
    [APP_TABLES]
  );
  for (const t of tables.rows) {
    const seqHeavy = t.bytes > 1048576 && t.seq_scan > 1000 && t.seq_scan > t.idx_scan * 2;
    console.log(
      `    ${String(t.relname).padEnd(18)} ${String(t.size).padStart(9)} rows=${t.n_live_tup} seq=${t.seq_scan} idx=${t.idx_scan}`
    );
    if (seqHeavy) warn_(`${t.relname} seq-scans`, `${t.seq_scan} seq vs ${t.idx_scan} idx — consider indexes`);
  }
  const dead = tables.rows.find((t) => t.n_dead_tup > 500 && (t.last_autovacuum === null || Date.now() - new Date(t.last_autovacuum).getTime() > 86400000));
  if (dead) warn_("autovacuum lag", `${dead.relname}: ${dead.n_dead_tup} dead tuples, last autovacuum ${dead.last_autovacuum}`);
  else ok("autovacuum / dead tuples", "healthy");

  section("Index health");
  const zeroScan = await client.query(
    `SELECT c.relname AS table, ic.relname AS index, pg_size_pretty(pg_relation_size(ic.oid)) AS size
     FROM pg_index i
     JOIN pg_class c ON c.oid = i.indrelid
     JOIN pg_class ic ON ic.oid = i.indexrelid
     LEFT JOIN pg_stat_user_indexes s ON s.indexrelid = i.indexrelid
     WHERE c.relname = ANY($1::text[]) AND i.indisprimary IS FALSE
       AND (s.idx_scan IS NULL OR s.idx_scan = 0)
     ORDER BY pg_relation_size(ic.oid) DESC`,
    [APP_TABLES]
  );
  if (zeroScan.rows.length === 0) ok("unused indexes", "none (all app indexes are used)");
  else {
    warn_("unused indexes", `${zeroScan.rows.length} with 0 scans — drop candidates:`);
    for (const r of zeroScan.rows) console.log(`      ${r.table}.${r.index} (${r.size})`);
  }

  const dup = await client.query(
    `SELECT tablename, regexp_replace(indexdef, 'CREATE (UNIQUE )?INDEX [^ ]+ ON', 'CREATE INDEX ON') AS def, count(*)::int AS n
     FROM pg_indexes WHERE schemaname='public'
     GROUP BY tablename, def HAVING count(*) > 1`
  );
  if (dup.rows.length === 0) ok("duplicate indexes", "none");
  else {
    fail_("duplicate indexes", `${dup.rows.length} groups share identical definitions`);
    for (const r of dup.rows) console.log(`      ${r.table_name}: ${r.n}x — ${r.def}`);
  }

  console.log("\n── summary ─────────────────────────────────────");
  console.log(`  ${pass} ok, ${warn} warnings, ${fail} problems`);
  await client.end();
  process.exit(fail > 0 ? 1 : 0);
}

main().catch(async (err) => {
  console.error("Health check failed:", err);
  process.exit(2);
});
