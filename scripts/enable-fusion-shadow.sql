-- Rank fusion + cross-encoder shadow — enablement.
--
-- Run this against the D1 database that backs `netamps-landing`
-- (database_id 544297c4-e412-4b42-86d0-3c4383d92efa).
--
-- WHAT IT DOES AND DOES NOT DO
--   Turning both keys ON makes /api/products/suggest compute an ALTERNATIVE
--   ranking (RRF over FTS5 + alias/Jaro + category, then a
--   @cf/baai/bge-reranker-base cross-encoder pass) on every query, and record
--   how that alternative ORDER compares to the order actually served.
--
--   It does NOT change what any visitor sees. The response body is still the
--   cascade's result, byte for byte. The alternative ranking is computed in a
--   waitUntil() after the response is already on the wire.
--
--   Turn it on, collect real typeahead traffic, then READ the summary before
--   proposing any cutover.
--
-- WHY TWO KEYS
--   shadow_enabled   the existing legacy-vs-FTS5 comparison, whose recorded
--                    evidence is what justified the FTS cutover. Left as-is so
--                    this experiment cannot disturb that record.
--   fusion_shadow    the new RRF + cross-encoder experiment. Requires
--                    shadow_enabled to also be '1' — one master switch.
--
-- HOW TO READ THE RESULT
--   meanReorderDistance           ~0 means the new ranking reproduces the
--                                 current one and the change earns nothing.
--                                 High means rows are moving and each one needs
--                                 a reason.
--   crossEncoderSuccessRate       low or null means the reranker is not
--                                 actually running (no AI binding, unparseable
--                                 scores, timeout) and any distance you see is
--                                 RRF alone. Check the Worker logs for
--                                 '[fusion] rerank score shape unrecognised'.
--   top1ChangedQueries           the number that matters most. A reranker that
--                                 never changes the first result is not
--                                 earning its latency.
--
-- TO READ IT
--   curl -H 'Cookie: session_id=...' \
--     'https://netamps.com/api/products/shadow?experiment=fusion'
--
-- TO REVERT
--   UPDATE match_meta SET value = '0' WHERE key IN
--     ('shadow_enabled', 'fusion_shadow');

-- ── Enable ────────────────────────────────────────────────────────────────
INSERT OR REPLACE INTO match_meta (key, value) VALUES ('shadow_enabled', '1');
INSERT OR REPLACE INTO match_meta (key, value) VALUES ('fusion_shadow', '1');

-- Confirm the flag reads back as the code expects ('1', not 'true'/'yes').
SELECT key, value FROM match_meta WHERE key IN ('shadow_enabled', 'fusion_shadow');

-- ── Evidence table (created lazily on first write; created here so the first
--    real query does not pay for CREATE TABLE) ─────────────────────────────
CREATE TABLE IF NOT EXISTS catalog_shadow_fusion (
  id TEXT PRIMARY KEY,
  q TEXT NOT NULL,
  category TEXT,
  baseline_ids TEXT,
  fused_ids TEXT,
  rerank_applied INTEGER,
  top1_changed INTEGER,
  reorder_distance INTEGER,
  createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_shadow_fusion_created ON catalog_shadow_fusion(createdAt);