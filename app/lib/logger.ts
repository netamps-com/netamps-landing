export interface AuditLog {
  id: string;
  timestamp: string;
  eventType: string;
  page: string;
  details: string;
  user?: string;
  ipAddress?: string;
}

export function logEvent(eventType: string, page: string, details: string, user: string = 'Anonymous', ipAddress: string = '127.0.0.1') {
  if (typeof window === 'undefined') return;

  const log: AuditLog = {
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    eventType,
    page,
    details,
    user,
    ipAddress,
  };

  try {
    const existing = JSON.parse(localStorage.getItem('netamps_audit_logs') || '[]');
    existing.unshift(log); // Add to beginning

    // Simulate standard PostgreSQL / R2 storage size limits (e.g., 500MB)
    // We use 5000 items as a proxy for the limit in localStorage to avoid quota errors.
    if (existing.length > 5000) {
      existing.length = 5000;
    }

    localStorage.setItem('netamps_audit_logs', JSON.stringify(existing));
    
    // Async push to backend
    const API_URL = process.env.NEXT_PUBLIC_API_URL || '';
    fetch(`${API_URL}/api/logs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(log)
    }).catch(() => {});
  } catch (err) {
    console.error('Failed to write to audit log', err);
  }
}

export function getLogs(): AuditLog[] {
  if (typeof window === 'undefined') return [];
  try {
    return JSON.parse(localStorage.getItem('netamps_audit_logs') || '[]');
  } catch (err) {
    return [];
  }
}
