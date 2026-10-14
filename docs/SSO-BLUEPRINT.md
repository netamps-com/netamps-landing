# SSO — Complete Blueprint (for review)

**Status:** design review. Nothing here is deployed. A partial implementation
exists in `stash@{0} ("On main: sso-wip")` — 9 new files under
`functions/api/auth/` plus a change to `functions/api/users/index.js`. It has
been read line by line for this document.

**This document is the deliverable you asked for.** Section 9 lists what the
existing implementation gets right and the specific defects that must be fixed
before it can be enabled, because a security review that only describes the
happy path is not a review.

---

## 1. What we are adding

Two staff identity providers — **Microsoft Entra ID** and **Google** — as an
alternative way to sign in to the dashboard. Password sign-in keeps working and
stays the default.

SSO is an *authentication* mechanism. It changes **how** someone proves who
they are. It must not change **what** they are allowed to do: the role still
comes from our own `users` table, never from a claim the provider sends. That
single rule is what stops an SSO rollout from quietly becoming an
authorization hole, and it is restated in every section below that could
otherwise erode it.

### Non-goals (explicitly out of scope)

- SSO for **buyers**. Buyers keep the email-OTP Track Order flow. Confusing the
  two is how staff-session tokens and buyer tokens become interchangeable, and
  that property is already load-bearing across Track, Negotiations and the
  audit ledger.
- SAML. Both providers do OIDC properly; SAML adds an XML surface and a second
  trust model for no benefit here.
- SCIM / directory provisioning, conditional-access policies, device claims.
- Social/personal Google accounts. Sign-in is restricted to Workspace accounts
  via the hosted-domain check (§7).

---

## 2. The standard, and why we follow it

| Piece | Standard | Why it is not optional here |
|---|---|---|
| Protocol | **OAuth 2.0** (RFC 6749) + **OpenID Connect Core 1.0** | OAuth alone authenticates *apps*, not people. OIDC is the identity layer on top; without it we would be inventing what "this is the user" means. |
| Flow | **Authorization Code** (§4.1) | The token is exchanged server-to-server. Nothing sensitive ever touches the browser. |
| Code interception defence | **PKCE, `S256`** (RFC 7636) | The `code` travels in a browser redirect and can leak via history, logs or a malicious app. PKCE binds the code to the client that started the flow, so a stolen code is useless without the verifier. Microsoft requires it. `plain` is forbidden — `S256` only, so the verifier never leaves our server. |
| CSRF / session fixation defence | **`state`** (RFC 6749 §10.12) | Random, per-attempt, compared in constant-ish time on return. Without it a login CSRF makes a victim sign into an attacker-chosen account. |
| Secrets | `client_secret` held server-side, never in a `NEXT_PUBLIC_` var | Both providers support confidential clients; using the secret is strictly stronger than public-client PKCE alone. |
| Transport | `https` only, `SameSite=Lax`, `HttpOnly`, `Secure` cookies | `Lax` is deliberate: the redirect back from the IdP is a cross-site top-level GET, which `Strict` would block. `HttpOnly` keeps the verifier out of JS; `Secure` keeps it off plaintext. |
| Identity source | Provider **userinfo endpoint over TLS** | Not a locally-decoded JWT. See §9.3 — decoding an ID token without verifying its signature is a known forgery vector, and the current code has exactly that helper sitting unused. |

**`S256` is the only acceptable challenge method.** If a code path ever sends
`code_challenge_method=plain`, the verifier is recoverable from the redirect
URL and PKCE provides no protection. The implementation must assert `S256`
rather than merely default to it.

---

## 3. Architecture

```
  Browser                      Cloudflare Pages Functions              IdP
  ───────                      ──────────────────────────              ───
  /login ──"Sign in with…"──▶  POST /api/auth/sso/start
                                 generate {verifier, challenge, state}
                                 Set-Cookie oauth_pkce (HttpOnly/Secure/Lax)
       ◀────── 302 ───────────  redirect → IdP /authorize
       ────────────────────────────────────────────────────────────▶  consent
       ◀────────────────────────────────────────────────────────────  302 + code
                               GET /api/auth/callback/[provider]
                                 verify state, exchange code+verifier
                                 fetch userinfo over TLS
                                 resolve identity → our user  (§7)
                                 create session, Set-Cookie session_token
       ◀────── 302 /dashboard ┘
```

### Component responsibilities

| File | Responsibility | Notes |
|---|---|---|
| `functions/api/auth/pkce.mjs` | Verifier/challenge/state generation, PKCE cookie encode/decode, auth-URL builder | Pure functions. No I/O. Unit-testable without a DB. |
| `functions/api/auth/discovery.mjs` *(new)* | Fetch + cache `/.well-known/openid-configuration` per provider | Hardcoded endpoint URLs drift when providers move. Discovery is what makes this portable and is the industry default. |
| `functions/api/auth/oauth.mjs` | Code→token exchange, userinfo fetch, error normalisation | Must not contain identity-mapping policy. |
| `functions/api/auth/identity.mjs` *(new)* | Map provider userinfo → our canonical `{subject, email, emailVerified, displayName}` | **The one place** provider quirks live (Microsoft's `mail` vs `userPrincipalName`, Google's `email_verified`). |
| `functions/api/auth/link-store.mjs` | `sso_accounts` reads/writes, token encryption at rest | D1 + Postgres, same as the rest of the codebase. |
| `functions/api/auth/callback/[provider].js` | Orchestrate the return leg; the only place that issues a session from SSO | |
| `functions/api/auth/sso/{link,unlink}.js` | Bind/unbind a provider to the *current* session's account | |
| `app/login/page.tsx` | Two buttons, rendered only when the provider is configured | |
| `app/dashboard/security/page.tsx` *(new)* | Linked accounts, link/unlink, with the §7 lockout rule enforced client-side too | |

---

## 4. Flows

### 4.1 Sign in

```
1. POST /api/auth/sso/start  { provider: "microsoft" | "google" }
2. Server: verifier  = 64 chars base64url  (≥32 bytes entropy, RFC 7636 min)
          challenge  = BASE64URL(SHA-256(verifier))
          state      = 32 chars base64url, random per attempt
3. Set-Cookie: oauth_pkce=<base64{verifier, state, provider, issuedAt}>;
               HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=600
4. 302 → {authorization_endpoint}
         ?client_id=…&response_type=code
         &redirect_uri=https://netamps.com/api/auth/callback/[provider]
         &scope=openid profile email
         &state=…&code_challenge=…&code_challenge_method=S256
5. GET /api/auth/callback/[provider]?code=…&state=…
6. Server: parse cookie → check state matches, check age ≤ 600s
7.        POST {token_endpoint}  (code, code_verifier, client_secret, redirect_uri)
8.        GET  {userinfo_endpoint}  Authorization: Bearer <access_token>
9.        identity.mjs → { subject, email, emailVerified, displayName }
10.       resolve (§7) → our user email + role
11.       INSERT session; Set-Cookie session_token (existing scheme)
12. 302 → /dashboard
```

**Single-use.** The PKCE cookie is deleted in the same response that consumes
the code (`Max-Age=0`). A replayed redirect hits step 6 and fails.

**On any error** the cookie is cleared and the user lands on `/login?sso_error=…`
with a *generic* reason. Provider error text goes to our logs, not to the URL —
error descriptions can carry account identifiers.

### 4.2 Link a provider to an existing account

Requires an authenticated session. The user is already signed in with a
password and wants to add "Sign in with Microsoft" for next time.

```
1. POST /api/auth/sso/link  { provider }      ← requires verifySession
2. Server generates a FRESH PKCE set + state; cookie carries {…, linkEmail}
3. Same redirect as §4.1
4. Callback: state/verifier checked identically
5. Identity resolved, then:
   a. If this (provider, subject) is already bound to a DIFFERENT account
      → refuse with already_linked_to_other. Never re-point the link.
   b. Else if the authenticated session's email ≠ resolved email
      → refuse with email_mismatch. See §7.
   c. Else INSERT INTO sso_accounts
6. Redirect → /dashboard/security?sso=linked
```

The link attempt is only started from a session that passed `verifySession`,
and the `linkEmail` in the cookie was written by the server at step 1 — the
client cannot substitute a target account.

### 4.3 Unlink

```
1. POST /api/auth/sso/unlink { provider }     ← requires verifySession
2. Refuse if this is the LAST authentication method:
     no password AND no other linked provider  → 400 LAST_AUTH_METHOD
3. If the account has a password, require it —
     verified with argon2Verify against the STORED HASH.
4. DELETE FROM sso_accounts WHERE email = ? AND provider = ?
```

**Step 3 must use argon2 verification.** See §9.6 — the current code compares
the stored hash to a value supplied by the client, which cannot work and would
be a bypass if it did.

### 4.4 Logout

Signing out clears `session_token` as it does today. SSO adds nothing here by
design: we do not hold a provider-side session, and calling a provider logout
endpoint would sign the user out of Outlook/Workspace globally, which nobody
asked for.

---

## 5. Data model

```sql
-- NEW. One row per (account, provider).
CREATE TABLE IF NOT EXISTS sso_accounts (
  email            TEXT    NOT NULL,   -- lowercase; references users(email)
  provider         TEXT    NOT NULL,   -- 'microsoft' | 'google'  (closed set)
  provider_user_id TEXT    NOT NULL,   -- the provider's immutable `sub`
  access_token     TEXT,               -- ENCRYPTED at rest (§6)
  refresh_token    TEXT,               -- ENCRYPTED at rest (§6)
  created_at       DATETIME NOT NULL,
  last_used_at     DATETIME NOT NULL,
  PRIMARY KEY (email, provider),
  UNIQUE (provider, provider_user_id)   -- see §7
);
```

`users` gains exactly one column:

```sql
ALTER TABLE users ADD COLUMN is_sso_managed INTEGER NOT NULL DEFAULT 0;
```

The uniqueness constraint on `(provider, provider_user_id)` is the schema-level
expression of "one provider identity belongs to exactly one account". The code
must rely on it, not merely check for it first, so that a race cannot create
two bindings.

`is_sso_managed = 1` means *this account was created by SSO and has no
password*. It governs the §7 lockout rule. It does **not** mean "this account
may only sign in with SSO" — a managed account that sets a password later
keeps both routes, which is what an admin who lost their IdP access needs.

---

## 6. Secrets at rest

`access_token` and `refresh_token` are bearer credentials for the provider's
API. Storing them in plaintext turns a read-only SQL exposure into a
provider-side impersonation.

Requirement: **AES-256-GCM via WebCrypto**, key derived from `SSO_ENCRYPTION_KEY`
with HKDF, separate nonce per row, version prefix so the key can be rotated
without a migration flag-day.

This means writing the implementation, because the `encryptToken`/`decryptToken`
pair in the stashed `sso-types.js` is **plaintext base64 with no key** (§9.5).
Until it is real, the simplest safe posture is to **not store tokens at all** —
we only need `sub` and `email`. That is a legitimate v1: drop the two token
columns, delete the helpers, and add them back when a feature actually needs a
token. I recommend this.

---

## 7. Identity and trust rules

The rules that decide *who is allowed to become which of our users*. This is
where SSO implementations actually go wrong, so they are stated as decisions,
not as code comments.

| # | Rule | Rationale |
|---|---|---|
| R1 | **Role always comes from our `users` table.** A provider claim (`roles`, `groups`, `jobTitle`) is never read into an authorization decision. | Otherwise an IdP admin we do not control can grant themselves `admin` on our dashboard. |
| R2 | **Account resolution is by `(provider, sub)` first, email second.** `sub` is immutable; email addresses get renamed, reused and spoofed at the domain level. | Resolving by email alone means anyone who can receive mail at an address can take over the account. |
| R3 | **`sub` must be non-empty and the userinfo call must have succeeded.** If a provider returns no `sub`, refuse. Never fall back to "derive from email". | A missing `sub` is a misconfiguration; guessing an identity from it is how account takeover happens. |
| R4 | **Auto-create is admin-only.** `is_sso_managed=1` accounts are created only for members of an allowlisted domain (`SSO_ALLOWED_DOMAINS`, e.g. `netamps.com`). Everyone else must be invited first. | Otherwise the first person to sign in with a personal Gmail becomes a staff user. |
| R5 | **`email_verified` is honoured.** Google exposes it; Microsoft's Graph userinfo does not, and Entra-issued mail is considered verified — but only when the tenant is ours. If `SSO_ALLOWED_DOMAINS` is set, an unverified address outside those domains is refused outright. | Closes the "verify an address you do not control" hole. |
| R6 | **A new provider identity may not silently re-bind to an existing account.** If `(provider, sub)` is unknown but the email matches an existing account, **linking requires an authenticated session** (§4.2). Sign-in without one is refused with `account_exists_sign_in_first`. | Otherwise an IdP admin who adds `you@netamps.com` to their tenant takes over your dashboard account. |
| R7 | **Last-method lockout rule** (§4.3 step 2). | An SSO-only account that unlinks itself becomes un-authenticatable — a self-inflicted lockout that looks like an outage. |
| R8 | **SSO never touches the buyer Track Order channel.** `buyer_tokens` and staff `sessions` stay separate trust domains. | Already the enforced invariant across Track / Negotiations / audit. |

R6 is the one to think hardest about. It is the difference between "SSO is a
convenient second door" and "whoever controls our Entra tenant controls our
dashboard".

---

## 8. Security requirements vs. threat

| Threat | Control | Required |
|---|---|---|
| Authorization-code interception | PKCE `S256`, server-side exchange | ✔ |
| Login CSRF | Random `state`, verified on return | ✔ |
| Session fixation | New `session_token` issued at the callback; never reuse a pre-auth token | ✔ |
| Replay of the callback | PKCE cookie cleared on consumption; `state` single-use; code exchanged once | ✔ |
| Token theft from DB | AES-GCM at rest, or store no tokens (§6) | ✔ |
| Account takeover via email | R2, R3, R6 | ✔ |
| Privilege escalation via IdP claims | R1 | ✔ |
| Lockout | R7 | ✔ |
| Brute force / auth-stuffing on `/start` | Per-IP rate limit on `start` and `callback` | ✔ |
| Secret leakage in logs or URLs | Never log tokens; provider error text to logs only | ✔ |
| Open redirect | `redirect_uri` is a fixed registered value — never built from a query parameter | ✔ |
| Clickjacking on the consent page | IdP-side; no action needed | — |

Two of these are **not** present in the current implementation and are listed
as blockers: token encryption (§6) and rate limiting.

---

## 9. Review of the existing implementation

This is the section that needs your attention. The WIP is a reasonable sketch
of the redirect mechanics and gets several important things right — but it
cannot be enabled as-is. Findings are ordered by severity.

### 9.1 BLOCKER — `action: "sso_login"` is an unauthenticated session oracle

`functions/api/users/index.js` (stashed change) adds:

```js
if (action === 'sso_login') {
  const { results } = await env.DB.prepare('SELECT role FROM users WHERE email = ?')
    .bind(email.toLowerCase()).all();
  if (results.length > 0) {
    const sessionId = await createSession(env, email.toLowerCase(), results[0].role);
    // …Set-Cookie session_token…
```

The `email` comes straight out of the request body with **no session, no
one-time token, no signature**. `POST /api/users {"action":"sso_login",
"email":"admin@netamps.com"}` returns a valid admin session to anyone.

The callback never calls it, so it is both dead and open. It must be deleted,
not fixed — if a two-step handoff is ever wanted, it needs a short-lived
single-use server-signed token minted at the callback, never a bare email.

### 9.2 BLOCKER — TypeScript syntax in `.js` files under `functions/`

`sso-types.js`, `pkce.js`, `oauth.js`, `sso-db.js` and all of `sso/*.js` use
`export interface`, `(env: any)`, `: string` annotations and
`import { SSOAccountLink }` of a *type* as a value. Cloudflare Pages Functions
bundles `functions/**/*.js` as JavaScript — this will not build.

Two of the files must also lose their type-only imports, which need
`import type` even once renamed to `.ts`.

**Decision needed:** the repo's `functions/` tree is plain JS throughout. I
recommend keeping these `.js` and deleting the `interface` blocks in favour of
a JSDoc typedef, matching the rest of the codebase — rather than introducing
the project's first TypeScript in the Functions bundle.

### 9.3 The `parseIDToken` helper must not be used as-is

```js
export function parseIDToken(idToken: string): any {
  const parts = idToken.split('.');
  const payload = JSON.parse(atob(parts[1]…));   // no signature verification
```

This decodes a JWT without verifying it. Anyone can mint one. It is currently
unreferenced — the callback correctly uses the userinfo endpoint instead — but
leaving an unverified-decode helper in the tree invites the next change to call
it. **Delete it.** If ID-token validation is ever wanted, it needs JWKS fetch +
`iss`/`aud`/`exp`/`nonce` checks, which is a real module, not a helper.

### 9.4 Microsoft userinfo is read with the wrong field names

```js
sub: data.id,                    // Graph /me shape
email: data.mail || data.userPrincipalName,
tid: data.id,                    // not a tenant id
```

The endpoint configured is `https://graph.microsoft.com/oidc/user-info`, whose
response uses `sub` — `data.id` is undefined there, so `sub` comes back empty
and R3 would refuse every Microsoft sign-in. `tid` is likewise wrong. This is
exactly why `identity.mjs` (§3) should exist as one reviewed mapping rather
than an inline object literal.

### 9.5 Token "encryption" is base64 with no key

`sso-types.js` defines `encryptToken(token: string): string { return btoa(token); }`
— reversible by anyone who can read the row. See §6. Recommended v1: do not
store tokens at all.

### 9.6 Unlink compares a hash to a client-supplied value

```js
if (dbUser.hash !== passwordHash) { … INVALID_PASSWORD … }
```

The client would have to possess the stored hash to pass. From the login form
that is impossible; from an API call it means the hash *is* the credential.
Must be `argon2Verify(password, storedHash)` over a plaintext password, matching
how the rest of the codebase verifies.

### 9.7 Broken and duplicated wiring

- `sso/start.js` imports `getProviderConfig` from `../pkce.js`; it lives in
  `sso-types.js`. Unresolved export.
- `callback/link.js` imports `../../pkce.js` and `../../oauth.js` from
  `functions/api/auth/callback/`, resolving to `functions/api/pkce.js` —
  one directory too high.
- `callback/link.js` is **unreachable**: `sso/link.js` builds its auth URL from
  `config.redirectUri`, which is `/auth/callback/[provider]`. The link flow
  therefore runs through `[provider].js`, and `link.js` duplicates it.
- `sso/link.js` puts the whole PKCE bundle **including `codeVerifier`** into
  `state`, which is transmitted to the IdP in the URL. That defeats PKCE: the
  verifier is no longer a secret. The cookie already carries it; `state` must
  carry only the random nonce.
- `sso-db.js` defines a second `createSession`. The app already has a session
  scheme with an `IDLE_LIMIT_MS` 30-minute mandate in `intake/auth.js`; a
  parallel implementation that does not write `last_seen` is how the idle
  mandate gets bypassed. Reuse the existing one.
- `deserializeUser` reads `row.sso_accounts`, which is not a column of any
  table in the schema.
- `[provider].js` derives `provider` from
  `url.pathname.replace(/^\/auth\/callback\//, '')`, then rebuilds the redirect
  from `authUrl.origin + '/auth/callback/' + provider`. It works only while
  `NEXT_PUBLIC_APP_URL` is the site root on the same origin as the request.
  The `provider` loop variable is already in scope and is the correct source.
- `err.message` is placed into redirect query strings, leaking internals.
- No rate limiting on `start` or `callback`.
- `refreshAccessToken` is written and never called; `isTokenExpired` likewise.
- `isSsoManaged` is written by `[provider].js` but not by `createSSOUser`, and
  not read anywhere.

### 9.8 What the WIP gets right

Credit where it is due — these should survive the rewrite:

- PKCE `S256` with a 64-char verifier, `HttpOnly; Secure; SameSite=Lax` cookie,
  10-minute expiry, and deletion on consumption.
- `state` is generated, round-tripped and compared on return.
- Identity comes from the **userinfo endpoint over TLS**, not a decoded JWT.
- `findUserBySSO` joins on `(provider, provider_user_id)` — correct per R2.
- `unlink` enforces the last-auth-method rule (R7).
- `callback/[provider].js` refuses to link an identity already bound to a
  different account.
- Provider is a closed `['microsoft','google']` allowlist, not free text.
- `start` returns 503 when the provider is unconfigured, so the UI can hide the
  button rather than send users into a dead flow.

---

## 10. Provider configuration

Both providers need a registered application with the **exact** redirect URI.
A mismatch here is the most common cause of "it works locally, fails in
production", and it fails with an opaque error at the provider.

**Microsoft Entra ID** — App registrations → New registration
- Supported account types: *Accounts in this organizational directory only*
  (single tenant) unless multi-tenant is genuinely required.
- Redirect URI: Web → `https://netamps.com/api/auth/callback/microsoft`
- Certificates & secrets → New client secret. **Copy the value, not the ID.**
- API permissions: `openid`, `profile`, `email` (delegated). `User.Read` is not
  needed for the userinfo endpoint.
- Endpoint: `https://login.microsoftonline.com/<TENANT_ID>/v2.0`

**Google Cloud** — APIs & Services → Credentials → OAuth client ID (Web)
- Authorized redirect URI: `https://netamps.com/api/auth/callback/google`
- Scopes: `openid`, `email`, `profile`
- OAuth consent screen: *Internal* if the workspace allows it — that alone
  enforces R4's domain rule at the provider. Otherwise *External* plus
  `SSO_ALLOWED_DOMAINS` on our side.
- Endpoint: `https://accounts.google.com`

**Staging:** add the preview/staging callback URIs as *additional* redirect
URIs on the same app registration. Providers allow several; this avoids a
second registration with a second secret.

---

## 11. Environment variables

All server-side. None may be prefixed `NEXT_PUBLIC_`.

| Variable | Example | Notes |
|---|---|---|
| `MICROSOFT_CLIENT_ID` | `<app id>` | From Entra app registration |
| `MICROSOFT_CLIENT_SECRET` | `<secret value>` | The **value**, not the secret ID |
| `MICROSOFT_TENANT_ID` | `<tenant guid>` or `common` | Single tenant recommended |
| `GOOGLE_CLIENT_ID` | `….apps.googleusercontent.com` | |
| `GOOGLE_CLIENT_SECRET` | `<secret>` | |
| `SSO_ALLOWED_DOMAINS` | `netamps.com` | Comma-separated. Enforces R4/R5 |
| `SSO_ENCRYPTION_KEY` | 32 random bytes, base64 | Only if tokens are stored (§6) |
| `NEXT_PUBLIC_APP_URL` | `https://netamps.com` | Already required elsewhere; used for post-callback redirects |

**Not optional, and the reason the feature cannot ship without you:** the four
provider credentials do not exist in this environment and cannot be invented.
Every route returns 503 until they are set, which is safe but useless.

---

## 12. Rollout plan

| Phase | What | Gate |
|---|---|---|
| **0** | This review. Decisions in §13. | Your sign-off |
| **1** | Rewrite against this blueprint: `.js` not `.ts`, fix §9.4/9.6/9.7, delete §9.1/9.3, single session path, `identity.mjs` mapping. Tests: PKCE S256, state rejection, replay, R2–R7, unlink lockout. | `npm test` green; no TS in `functions/` |
| **2** | Add `/dashboard/security`, login buttons rendered from a server-reported `providers: ["microsoft","google"]` capability. Disabled gracefully when unconfigured. | Build green |
| **3** | You create the two provider apps (§10), set the secrets (§11). We enable on a staging invite first. | A real sign-in from each provider |
| **4** | Production. SSO offered alongside password. Monitor `audit_logs` for `SSO_*` events. | One week, no lockouts |
| **5** | Optional: tokens-at-rest if a feature needs them (§6); rate limiting tuning. | |

Phase 1 is entirely doable without any credentials — the provider-specific
secrets are only needed from phase 3, and every route degrades to 503 before
that. So the code work is not blocked on you; only the go-live is.

---

## 13. Decisions I need from you

1. **Auto-creation scope (R4).** Should any member of `SSO_ALLOWED_DOMAINS` be
   able to create a staff account by signing in, or must every account be
   invited first via the existing `/admin/invites` flow? *(I recommend:
   invited-first, with auto-create as an explicit opt-in flag.)*
2. **Password removal.** Once an account has a linked provider, may the user
   delete their password? *(I recommend: yes, if they have two providers, or
   with a cooling-off period.)*
3. **Tokens at rest (§6).** Store encrypted provider tokens, or skip them
   entirely until something needs them? *(I recommend: skip.)*
4. **Single or multi-tenant Entra.** Single tenant means only your directory
   can sign in — the strongest default. Multi-tenant needs the domain
   allowlist to carry the whole load.
5. **Naming.** `functions/api/auth/*.js` will collide conceptually with the
   existing `intake/auth.js`. Keep the new files under `functions/api/auth/`
   (current layout) or move to `functions/api/sso/`? *(I recommend: `sso/` —
   "auth" already means something here.)*

---

## 14. What I still need to know

- Confirmation of the production domain to register as the redirect URI —
  `netamps.com` with `www` as a redirect, or apex only?
- Whether staging has its own Cloudflare Pages project (separate D1) or shares
  production's. It affects whether phase 3 can be isolated at all.
- Whether Microsoft is Entra ID or an on-prem ADFS — ADFS needs different
  endpoints and often breaks PKCE.
