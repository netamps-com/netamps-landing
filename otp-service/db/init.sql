-- ==============================================================================
-- POSTGRESQL DDL FOR SOC 2 COMPLIANT AUDIT LOGGING
-- ==============================================================================

-- Create the immutable audit logs table
CREATE TABLE IF NOT EXISTS security_audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_type VARCHAR(50) NOT NULL,
    email_hash VARCHAR(64) NOT NULL,
    ip_address INET NOT NULL,
    details JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ==============================================================================
-- PERFORMANCE & COMPLIANCE INDEXING
-- ==============================================================================

-- Index for fast lookup of threat vectors originating from specific IPs
CREATE INDEX IF NOT EXISTS idx_audit_logs_ip ON security_audit_logs(ip_address);

-- Index for fast lookup of actions tied to an obfuscated identity
CREATE INDEX IF NOT EXISTS idx_audit_logs_email_hash ON security_audit_logs(email_hash);

-- Time-series index for retention pruning and auditor range queries
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON security_audit_logs(created_at DESC);

-- Note: Ensure this database user restricts UPDATE or DELETE privileges 
-- to maintain strict immutability standards required by SOC 2.
