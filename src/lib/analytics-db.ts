import { fetchAll, fetchOne, query } from "./db";

let schemaPromise: Promise<void> | null = null;

/**
 * Idempotently ensure the analytics table has the `anon_id` column used to
 * tell anonymous visitors apart (hash of IP + user-agent). Runs once per
 * process; safe to call on every analytics path.
 */
export function ensureAnalyticsSchema(): Promise<void> {
  if (!schemaPromise) {
    schemaPromise = (async () => {
      await query("ALTER TABLE analytics ADD COLUMN IF NOT EXISTS anon_id text");
    })().catch((e) => {
      schemaPromise = null;
      throw e;
    });
  }
  return schemaPromise;
}

export async function logEvent(opts: {
  event_type: string;
  user_id?: string;
  username?: string;
  guild?: string;
  ship_id?: number;
  url?: string;
  metadata?: Record<string, unknown>;
  anon_id?: string;
}) {
  await ensureAnalyticsSchema();
  await fetchAll(
    `INSERT INTO analytics (event_type, user_id, username, guild, ship_id, url, metadata, anon_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      opts.event_type,
      opts.user_id ?? null,
      opts.username ?? null,
      opts.guild ?? null,
      opts.ship_id ?? null,
      opts.url ?? null,
      opts.metadata ? JSON.stringify(opts.metadata) : "{}",
      opts.anon_id ?? null,
    ]
  );
}

export interface DashboardData {
  totals: {
    total_events: number;
    unique_users: number;
    events_today: number;
    errors_today: number;
    total_collections: number;
  };
  views_per_day: { date: string; count: number }[];
  event_types: { event_type: string; count: number }[];
  top_pages: { url: string; count: number }[];
  recent_errors: {
    id: number;
    username: string | null;
    anon_id: string | null;
    url: string | null;
    metadata: Record<string, unknown>;
    created_at: string;
  }[];
}

export async function getDashboardData(
  date?: string,
  excludeUsernames?: string[],
  excludeAnonIds?: string[],
  excludeUserIds?: string[]
): Promise<DashboardData> {
  await ensureAnalyticsSchema();
  const usernames = excludeUsernames && excludeUsernames.length > 0 ? excludeUsernames : undefined;
  const anonIds = excludeAnonIds && excludeAnonIds.length > 0 ? excludeAnonIds : undefined;
  const userIds = excludeUserIds && excludeUserIds.length > 0 ? excludeUserIds : undefined;
  const dateClause = date
    ? "created_at >= $1::date AND created_at < ($1::date + INTERVAL '1 day')"
    : null;

  // Exclusion predicates: keep rows with no matching identity (NULL username /
  // NULL anon_id / NULL user_id) but drop rows whose username, anonymous id or
  // user id is excluded. user_id catches legacy rows where the username used a
  // different format. Each clause gets the next free $N index from the base args.
  const exclPredicates = (startIndex: number): { sql: string[]; args: unknown[] } => {
    const sql: string[] = [];
    const args: unknown[] = [];
    let idx = startIndex;
    if (usernames) {
      sql.push(`(username IS NULL OR username <> ALL($${idx}::text[]))`);
      args.push(usernames);
      idx++;
    }
    if (userIds) {
      sql.push(`(user_id IS NULL OR user_id <> ALL($${idx}::text[]))`);
      args.push(userIds);
      idx++;
    }
    if (anonIds) {
      sql.push(`(anon_id IS NULL OR anon_id <> ALL($${idx}::text[]))`);
      args.push(anonIds);
      idx++;
    }
    return { sql, args };
  };

  const where = (predicates: string[]): string =>
    predicates.length > 0 ? ` WHERE ${predicates.join(" AND ")}` : "";

  // Base predicates + args, then exclusions appended at the right $N index.
  const build = (base: { preds: string[]; args: unknown[] }): { where: string; args: unknown[] } => {
    const excl = exclPredicates(base.args.length + 1);
    return { where: where([...base.preds, ...excl.sql]), args: [...base.args, ...excl.args] };
  };

  const totalsBase = date
    ? { preds: [dateClause!], args: [date] }
    : { preds: [], args: [] };
  const totalsQ = build(totalsBase);
  const totals = await fetchOne(
    `
    SELECT
      COUNT(*)::int AS total_events,
      COUNT(DISTINCT COALESCE(user_id, anon_id))::int AS unique_users,
      COUNT(*) FILTER (WHERE ${date ? "TRUE" : "created_at >= CURRENT_DATE"})::int AS events_today,
      COUNT(*) FILTER (WHERE event_type = 'error' AND ${date ? "TRUE" : "created_at >= CURRENT_DATE"})::int AS errors_today,
      COUNT(*) FILTER (WHERE event_type = 'collection_create')::int AS total_collections
    FROM analytics${totalsQ.where}
    `,
    totalsQ.args,
  );

  const viewsBase = {
    preds: ["event_type = 'page_view'", "created_at >= CURRENT_DATE - INTERVAL '30 days'"],
    args: [],
  };
  const viewsQ = build(viewsBase);
  const viewsPerDay = await fetchAll(
    `
    SELECT DATE(created_at)::text AS date, COUNT(*)::int AS count
    FROM analytics${viewsQ.where}
    GROUP BY DATE(created_at)
    ORDER BY date
    `,
    viewsQ.args,
  );

  const eventTypesQ = build(totalsBase);
  const eventTypes = await fetchAll(
    `
    SELECT event_type, COUNT(*)::int AS count
    FROM analytics${eventTypesQ.where}
    GROUP BY event_type
    ORDER BY count DESC
    `,
    eventTypesQ.args,
  );

  const topPagesBase = date
    ? { preds: ["url IS NOT NULL", dateClause!], args: [date] }
    : { preds: ["url IS NOT NULL"], args: [] };
  const topPagesQ = build(topPagesBase);
  const topPages = await fetchAll(
    `
    SELECT url, COUNT(*)::int AS count
    FROM analytics${topPagesQ.where}
    GROUP BY url
    ORDER BY count DESC
    LIMIT 10
    `,
    topPagesQ.args,
  );

  const errorsBase = date
    ? { preds: ["event_type = 'error'", dateClause!], args: [date] }
    : { preds: ["event_type = 'error'"], args: [] };
  const errorsQ = build(errorsBase);
  const recentErrors = await fetchAll(
    `
    SELECT id, username, anon_id, url, metadata, created_at
    FROM analytics${errorsQ.where}
    ORDER BY created_at DESC
    LIMIT 20
    `,
    errorsQ.args,
  );

  return {
    totals: {
      total_events: totals?.total_events ?? 0,
      unique_users: totals?.unique_users ?? 0,
      events_today: totals?.events_today ?? 0,
      errors_today: totals?.errors_today ?? 0,
      total_collections: totals?.total_collections ?? 0,
    },
    views_per_day: viewsPerDay ?? [],
    event_types: eventTypes ?? [],
    top_pages: topPages ?? [],
    recent_errors: recentErrors ?? [],
  };
}
