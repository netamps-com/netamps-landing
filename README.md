# Netamps CRM Backend — B2B Procurement, Invoicing & Stock Inventory

Node.js 20 + TypeScript (strict) + Express + Prisma ORM + PostgreSQL. SOC 2 Type II /
NIST SP 800-53 / GDPR / HIPAA / OWASP Top-10 aligned. Separate service from the
Cloudflare Pages landing frontend (which keeps its D1/Resend stack).

## Quick start (local)

```powershell
cd crm-backend
npm install
npm run genkeys            # prints JWT_PRIVATE_KEY_B64 / JWT_PUBLIC_KEY_B64 / DATA_ENCRYPTION_KEY_B64
# copy .env.example -> .env and fill values (local Postgres URL is fine for dev)
npx prisma migrate dev --name init   # creates tables incl. CHECK constraints below
npm run dev                # http://localhost:8080, /health public
npm test                   # node:test unit suite (money, masking, scanning, CSV, scrubber)
```

## Production bring-up

1. Provision PostgreSQL 15+ and Redis 7+. Apply `prisma migrate deploy`.
2. Enforce DB-level CHECKs Prisma can't express (run once as DBA):
```sql
ALTER TABLE inventory_stock_registry
  ADD CONSTRAINT chk_stock_nonneg CHECK (current_on_hand_balance >= 0 AND reserved_pending_allocation >= 0);
ALTER TABLE document_line_items
  ADD CONSTRAINT chk_line_math CHECK (extended_total = selected_quantity * unit_cost);
```
3. Put secrets in Secret Manager (`DATABASE_URL`, `REDIS_URL`, `JWT_*_B64`,
   `DATA_ENCRYPTION_KEY_B64`, `RESEND_API_KEY`), verify the sending domain in Resend
   (DKIM/SPF), then `bash deploy.sh` (Cloud Run, authenticated, health-gated).

## Security model (read before operating)

- **Transport**: Helmet stack (HSTS 63072000+preload, CSP `default-src 'self'`, DENY
  framing). Direct TLS terminates at 1.3+ when certs provided; behind a LB set
  `TRUST_PROXY=1` and enforce TLS ≥ 1.3 on the LB listener instead.
- **Auth**: RS256 JWT access (15 min) + opaque single-use rotating refresh tokens
  (sha256-stored, reuse → investigate). Roles `ADMIN/STAFF/USER`; every RBAC check is
  server-side; 401/403 envelopes carry `tracking_id`, never reasons useful to attackers.
- **PII**: `Client.taxId/payment` are AES-256-GCM ciphertext (`v1:iv:ct:tag`); emails stay
  plaintext (lookup keys). IPs masked at write time (IPv4 /24, IPv6 /64).
- **Money**: integer minor-unit math end to end; server recomputes every
  `extended_total = qty × unit` and rejects mismatches (400).
- **Finalize** (`POST /api/v1/documents/finalize`) runs `SERIALIZABLE` +
  `SELECT … FOR UPDATE` (ordered locking): PO reserves, INVOICE/CASH_MEMO decrements
  and releases linked reserves, QUOTE/PROFORMA totals only. Audit ledger rows
  (actor/ip/before/after) are written in the same transaction — immutable by design
  (no update/delete endpoints exist for it).
- **Uploads**: 300 MB cap, extension+MIME allowlist, magic-byte + EICAR/exe scan,
  strict UTF-8, 10k-row cap, per-IP rate limit. XLSX via `xlsx`, CSV via RFC-4180 parser.
- **Email**: approval sends go through BullMQ (Redis) with 5× backoff and idempotency
  keys; without `REDIS_URL` they send inline (logged). PDF invoices attach as base64.
- **Errors**: global boundary returns `{status, error, tracking_id}`; raw Prisma/PG
  stacks are stderr-only and scrubbed (passwords, tokens, PANs redacted).
- **CI**: PRs run typecheck → build → tests → `npm audit`; Snyk/SonarQube stages run
  only when their secrets exist (never red otherwise). The 80% Sonar coverage gate is
  enforced server-side — grow `src/lib/*.test.ts` toward it.

## API map

| Method & path | Auth | Purpose |
|---|---|---|
| `GET /health` | none | liveness/readiness probe (200 UP / 503 DOWN) |
| `POST /api/v1/auth/{register,login,refresh,logout}` | rate-limited | RS256 session lifecycle |
| `POST /api/v1/documents/finalize` | JWT | atomic PR→PO→invoice transition + audit + approval email |
| `GET /api/v1/documents[/:id]` | JWT (owner-scoped; ADMIN all) | list / detail |
| `PUT /api/v1/inventory/:sku` | STAFF+ | upsert stock (non-negative enforced) |
| `GET /api/v1/inventory` | JWT | stock registry |
| `POST /api/v1/import` | JWT | CSV/XLSX/JSON ingest → columns/rows preview + sha256 |
| `GET /api/v1/export/:id.(csv\|xlsx\|json\|pdf)` | JWT (owner-scoped) | isolated-format download |
| `GET /api/v1/print/:id` | JWT (owner-scoped) | print-optimized invoice HTML |
| `POST /api/v1/clients` | STAFF+ | create client (PII encrypted) |
| `GET /api/v1/clients/:id` | JWT | PII decrypted only for STAFF+ or owning email |

## Ops notes

- Worker: `npm run worker` (separate process/container) requires `REDIS_URL`.
- Migrations: never edit applied migrations; `prisma migrate dev` locally, `deploy` in prod.
- The frontend (`netamps-landing`) points here via `NEXT_PUBLIC_API_URL`; its Pages
  `session_token` cookie does NOT transfer cross-origin — use bearer access tokens
  from `/api/v1/auth/login` for dashboard calls, and keep CORS origins tight.
