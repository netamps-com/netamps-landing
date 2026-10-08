-- Create Intake Sessions table for the Third-Party ITAD Workbench
CREATE TABLE IF NOT EXISTS intake_sessions (
    id TEXT PRIMARY KEY,
    owner_email TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'DRAFT',
    data TEXT NOT NULL, -- JSON string containing the mapped schema payload
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Index for efficient owner-scoped fetching (OWASP API5:2023)
CREATE INDEX IF NOT EXISTS idx_intake_sessions_owner ON intake_sessions(owner_email);

-- Audit Logs Table (SIEM Compliance)
CREATE TABLE IF NOT EXISTS audit_logs (
    id TEXT PRIMARY KEY,
    actor_ip TEXT NOT NULL,
    actor_email TEXT,
    action TEXT NOT NULL,
    resource_id TEXT,
    details TEXT, -- JSON string
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
