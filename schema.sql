-- ITAD Intake Workbench reference schema (D1, SQLite dialect).
-- NOTE: audit_logs already exists in production with the columns below (owned by
-- the logging module). Do NOT redefine it with different columns — INSERTs must use:
--   (id, timestamp, event_type, page, details, username, ip_address)
-- Code self-creates intake_* tables at runtime (CREATE TABLE IF NOT EXISTS), so this
-- file is documentation for D1 Studio / fresh environments, not an auto-run migration.

CREATE TABLE IF NOT EXISTS intake_sessions (
    id TEXT PRIMARY KEY,
    owner_email TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'DRAFT',
    mapping TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_intake_sessions_owner ON intake_sessions(owner_email);

CREATE TABLE IF NOT EXISTS intake_assets (
    session_id TEXT NOT NULL,
    row_no INTEGER NOT NULL,
    data TEXT NOT NULL,
    PRIMARY KEY (session_id, row_no)
);

-- Server-verified login sessions (minted by OTP verify / users login)
CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    email TEXT NOT NULL,
    role TEXT NOT NULL,
    expires_at DATETIME NOT NULL
);
