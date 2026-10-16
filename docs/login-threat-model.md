# Login Threat Model — Guards, Gates & Operations

**Status:** IMPLEMENTED. Enforcement lives server-side (`authz/login-guard.mjs`
+ hooks in `users/index.js`, `intake/auth.js`); the login page only renders
server verdicts. 47-assertion harness: `tests/login-guard.test.mjs`.

## 1. Owner-verified unknown-context logins (the headline control)

Valid credentials from a never-seen (mailbox, IP) pair do **not** mint a
session. The server opens a challenge and mails `ashok@netamps.com` the
attempted mailbox, IP, geo, device, time and a single-use 6-digit OTP
(10-minute TTL, 3 attempts, SHA-256 stored). Until the owner approves with
that OTP, the IP is blocked (403), the user is held (202 + polling), and the
page is inert. Approval marks the device known — the user then retries and
succeeds; **no session is ever minted out-of-band**.

Anti-abuse properties (each tested):
- Unknown mailboxes never create challenges — otherwise anyone could flood
  the owner's mailbox at will. They count toward IP blocks with a
  cooldown-guarded alert instead.
- One open challenge per (mailbox, IP) per 30 minutes (cooldown reuse).
- 3 wrong OTP codes lock the challenge and block the source IP for 1 hour.
- Deny burns the attempt and blocks the source IP for 24 hours (harmless if
  invoked by the attacker — it only hurts their own IP).
- Challenge IDs are status-read capabilities only; approval requires the OTP.
- Status polling reveals a masked mailbox (`a***@domain`), never the full one.
- If Resend is unconfigured, the hold reports `OWNER_NOTIFY_FAILED` honestly
  instead of pretending the owner was told. Operational note: configure
  `RESEND_API_KEY` or unknown-context logins (including first-ever logins)
  cannot complete — known devices keep working.

## 2. Threat-by-threat controls

| Threat | Control | Where | Proof |
|---|---|---|---|
| Autonomous credential harvesting / stuffing | D1 sliding-window failure counts (IP ≥10/15m → 60m block + owner mail; mailbox ≥5/15m → targeted alert); every attempt journaled with IP+geo+UA | `login-guard.mjs`, `users/index.js` login | harness §1 |
| Owner-bypass / unknown device | challenge gate above; cooldown, lockout, deny-block | same + `/api/login-guard` + login page states | harness §2 |
| Session token hijacking (pass-the-cookie) | HttpOnly+Secure+SameSite=Lax cookies (existing); network-prefix + device-hash binding at mint; revoke on DOUBLE mismatch only (lone IP hop or UA change passes — no legit lockouts); legacy rows pass; password change revokes all sessions | `intake/auth.js`, `users/index.js` | harness §3 |
| OAuth consent-grant phishing | **No OAuth surface exists** — no providers, consent screens, grants table or SSO strings in the login + API tree; prohibition tripwired in CI | — (absence) | harness §6 scans the tree |
| Indirect prompt injection | untrusted spans fenced (`llm/fence.mjs`); escapes die in the shipped structural validators (quote grounding, index pools, fabricated-identity flags) | validators (unchanged) | harness §5 adversarial vectors |
| In-memory WASM evasion | `\0asm` magic searched anywhere in the scan window → `WASM_MODULE` (catches renamed + polyglot modules); allowlist + magic validation unchanged | `upload/scan.mjs` | harness §4 vectors |

Pre-existing controls this builds on (unchanged): isolate-local rate limits,
Turnstile bot gate with oracle-free failures, bcrypt cost-11 over
client-hashed secrets, 30-minute idle mandate, oracle-free auth messages.

## 3. Operations

- **Owner mailbox**: `ashok@netamps.com` (constant `OWNER_EMAIL`). Approval
  link shape: `/login?challenge=<id>`.
- **Unblock an IP**: `DELETE FROM ip_blocks WHERE ip = '<ip>'` in D1 (blocks
  otherwise expire automatically; history rows remain).
- **Approve out-of-band**: decisions only happen through the OTP form — there
  is intentionally no backdoor approval path.
- **Resend**: `RESEND_API_KEY` must be set (same secret as OTP mail).
- **Monitoring**: `login_attempts` (every attempt + geo), `audit_logs`
  (`AUTH_IP_BLOCKED`, `AUTH_SESSION_HIJACK_REVOKED`), `owner_challenges`
  (full lifecycle), `owner_alert_cooldown` (spam guard).
- **PG fallback**: the guard is D1-only (the PG login path persists no
  server-side sessions today). If Postgres becomes primary, the guard hooks
  must be ported — tracked as a roadmap item, not silently assumed.
- **What intentionally still pages the owner**: first-ever logins, new
  networks/devices, bursts, denies. Day-to-day known-device logins are silent.
