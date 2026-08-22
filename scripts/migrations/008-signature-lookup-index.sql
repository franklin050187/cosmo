-- 008: index for duplicate-signature lookups on the upload path.
-- Integrity is already guaranteed by the (ship_id) primary key; this only
-- speeds the exact-match lookup in findDuplicateBySignature.

CREATE INDEX IF NOT EXISTS idx_ship_signatures_signature ON ship_signatures (signature);
