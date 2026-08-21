-- 007: indexes for search and listing hot paths.
-- shipdb: tag containment, author/price/crew filters, default date sort.
-- collections: owner lookups, membership by ship, recency sort.
-- analytics_events: dashboard time-window scans.

CREATE INDEX IF NOT EXISTS idx_shipdb_tags_gin ON shipdb USING GIN (tags);
CREATE INDEX IF NOT EXISTS idx_shipdb_author ON shipdb (author);
CREATE INDEX IF NOT EXISTS idx_shipdb_price ON shipdb (price);
CREATE INDEX IF NOT EXISTS idx_shipdb_crew ON shipdb (crew);
CREATE INDEX IF NOT EXISTS idx_shipdb_date_desc ON shipdb (date DESC);

CREATE INDEX IF NOT EXISTS idx_collections_owner_ci ON collections (LOWER(owner));
CREATE INDEX IF NOT EXISTS idx_collections_created_at_desc ON collections (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_collections_ships_gin ON collections USING GIN (ships);

CREATE INDEX IF NOT EXISTS idx_analytics_created_at ON analytics (created_at);
CREATE INDEX IF NOT EXISTS idx_analytics_event_type ON analytics (event_type);
