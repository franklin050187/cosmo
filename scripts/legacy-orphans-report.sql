-- Read-only report of legacy rows that will never be auto-adopted by
-- migrateUsernameOnLogin: owner names carrying a historical discriminator
-- (anything but the modern "#0") whose discord_id is still NULL.
-- These can only be reconciled manually (e.g. matching display names).

SELECT 'shipdb' AS table_name, submitted_by AS owner_name, COUNT(*) AS rows
FROM shipdb
WHERE discord_id IS NULL
  AND submitted_by ~ '#[0-9]+$'
  AND submitted_by !~ '#0$'
GROUP BY submitted_by

UNION ALL

SELECT 'collections', owner, COUNT(*)
FROM collections
WHERE discord_id IS NULL
  AND owner ~ '#[0-9]+$'
  AND owner !~ '#0$'
GROUP BY owner

UNION ALL

SELECT 'favoritedb', name, COUNT(*)
FROM favoritedb
WHERE discord_id IS NULL
  AND name ~ '#[0-9]+$'
  AND name !~ '#0$'
GROUP BY name

ORDER BY table_name, rows DESC;
