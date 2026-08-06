import { fetchAll, fetchOne } from "./db";

export async function logEvent(opts: {
  event_type: string;
  user_id?: string;
  username?: string;
  guild?: string;
  ship_id?: number;
  url?: string;
  metadata?: Record<string, unknown>;
}) {
  await fetchAll(
    `INSERT INTO analytics (event_type, user_id, username, guild, ship_id, url, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      opts.event_type,
      opts.user_id ?? null,
      opts.username ?? null,
      opts.guild ?? null,
      opts.ship_id ?? null,
      opts.url ?? null,
      opts.metadata ? JSON.stringify(opts.metadata) : "{}",
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
    url: string | null;
    metadata: Record<string, unknown>;
    created_at: string;
  }[];
}

export async function getDashboardData(date?: string): Promise<DashboardData> {
  const dateClause = date
    ? "created_at >= $1::date AND created_at < ($1::date + INTERVAL '1 day')"
    : null;
  const dateArgs = date ? [date] : [];

  const totals = await fetchOne(
    `
    SELECT
      COUNT(*)::int AS total_events,
      COUNT(DISTINCT user_id)::int AS unique_users,
      COUNT(*) FILTER (WHERE ${date ? "TRUE" : "created_at >= CURRENT_DATE"})::int AS events_today,
      COUNT(*) FILTER (WHERE event_type = 'error' AND ${date ? "TRUE" : "created_at >= CURRENT_DATE"})::int AS errors_today,
      COUNT(*) FILTER (WHERE event_type = 'collection_create')::int AS total_collections
    FROM analytics
    ${dateClause ? `WHERE ${dateClause}` : ""}
    `,
    dateArgs,
  );

  const viewsPerDay = await fetchAll(`
    SELECT DATE(created_at)::text AS date, COUNT(*)::int AS count
    FROM analytics
    WHERE event_type = 'page_view'
      AND created_at >= CURRENT_DATE - INTERVAL '30 days'
    GROUP BY DATE(created_at)
    ORDER BY date
  `);

  const eventTypes = await fetchAll(
    `
    SELECT event_type, COUNT(*)::int AS count
    FROM analytics
    ${dateClause ? `WHERE ${dateClause}` : ""}
    GROUP BY event_type
    ORDER BY count DESC
    `,
    dateArgs,
  );

  const topPages = await fetchAll(
    `
    SELECT url, COUNT(*)::int AS count
    FROM analytics
    WHERE url IS NOT NULL
    ${dateClause ? `AND ${dateClause}` : ""}
    GROUP BY url
    ORDER BY count DESC
    LIMIT 10
    `,
    dateArgs,
  );

  const recentErrors = await fetchAll(
    `
    SELECT id, username, url, metadata, created_at
    FROM analytics
    WHERE event_type = 'error'
    ${dateClause ? `AND ${dateClause}` : ""}
    ORDER BY created_at DESC
    LIMIT 20
    `,
    dateArgs,
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
