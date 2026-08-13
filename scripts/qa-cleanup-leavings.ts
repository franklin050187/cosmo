import pg from "pg";

const c = new pg.Client({
  host: process.env.POSTGRES_HOST,
  port: parseInt(process.env.POSTGRES_PORT ?? "6543", 10),
  database: process.env.POSTGRES_DATABASE,
  user: process.env.POSTGRES_USER,
  password: process.env.POSTGRES_PASSWORD,
  ssl: { rejectUnauthorized: false },
});

await c.connect();

const shipIds = (
  await c.query(
    "SELECT id FROM shipdb WHERE ship_name = 'valid-ship' AND id <> 1624"
  )
).rows.map((r: { id: number }) => r.id);

if (shipIds.length) {
  const inList = shipIds.join(",");
  // int[] columns -> use integer literals, not strings
  await c.query(`DELETE FROM favoritedb WHERE favorite && ARRAY[${inList}]`);
  await c.query(`DELETE FROM ship_signatures WHERE ship_id IN (${inList})`);
  await c.query(`DELETE FROM collections WHERE ships && ARRAY[${inList}]`);
  await c.query(`DELETE FROM shipdb WHERE id IN (${inList})`);
}

const collR = await c.query("DELETE FROM collections WHERE title LIKE 'QA Test %' RETURNING id");
const collIds = collR.rows.map((r: { id: number }) => r.id);

const v = await c.query("SELECT count(*)::text n FROM shipdb WHERE ship_name='valid-ship'").then((r) => r.rows[0].n);
const cc = await c.query("SELECT count(*)::text n FROM collections WHERE title LIKE 'QA Test %'").then((r) => r.rows[0].n);
console.log("deleted ships:", shipIds, "remaining valid-ship:", v);
console.log("deleted collections:", collIds, "remaining QA Test collections:", cc);

await c.end();
