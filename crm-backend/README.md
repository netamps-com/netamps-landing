# CRM Backend

Express API exported as a **Firebase Cloud Function (v2)** and backed by **PostgreSQL via Prisma**.

- `src/index.ts` — exports the Express app as the `api` Cloud Function (`firebase-functions/v2/https`, region `us-central1`).
- `src/server.ts` — Express app, security middleware (helmet, CORS, rate limiting), Prisma + Redis clients.
- `prisma/schema.prisma` — database schema.
- `prisma/migrations/` — **version-controlled** migration history (applied by CI).

Deployed by `.github/workflows/deploy.yml` → job **"Deploy Backend API to Firebase"**.

## Required GitHub Actions secrets

Set these in **Settings → Secrets and variables → Actions**. Without them the deploy job cannot pass:

| Secret | Used by | Notes |
| --- | --- | --- |
| `DATABASE_URL` | `prisma migrate deploy` | PostgreSQL connection string, e.g. `postgresql://user:pass@host:5432/db?schema=public&sslmode=require`. The DB must be reachable from GitHub-hosted runners. |
| `FIREBASE_TOKEN` | `firebase deploy` | Create with `firebase login:ci`. Requires access to the `netamps-production` Firebase project. |

> The deploy job order is: `npm ci` → `prisma generate` → **`prisma migrate deploy`** → `tsc build` → `firebase deploy --only functions`. If a secret is missing, the job fails at the first step that needs it.

## Database migrations

Migrations are the source of truth and **must be committed**. The workflow runs `npx prisma migrate deploy`, which applies any migration not yet recorded in `_prisma_migrations`.

- `20261014000000_init` is the **baseline migration** (the full schema). It was generated without a live database:
  ```bash
  npx prisma migrate diff \
    --from-empty \
    --to-schema-datamodel prisma/schema.prisma \
    --script --output prisma/migrations/20261014000000_init/migration.sql
  ```
- To add a migration after changing `schema.prisma` (needs `DATABASE_URL`):
  ```bash
  npx prisma migrate dev --name <change>
  ```

### Baselining an existing database

If the target database **already contains these tables** but has no migration history, `migrate deploy` fails with **`P3005: The database schema is not empty`**. The workflow detects this specific error and performs a one-time baseline automatically:

```bash
npx prisma migrate resolve --applied 20261014000000_init
npx prisma migrate deploy
```

To do it manually instead, run the two commands above with `DATABASE_URL` set. The auto-baseline only triggers on `P3005`; any other failure (bad URL, unreachable DB, a real SQL error) fails the step as normal.

## Local development

```bash
cd crm-backend
npm ci
npx prisma generate
npm run build        # tsc
npm start            # node dist/server.js
```

Environment: `DATABASE_URL` (required for Prisma), `REDIS_URL` (optional, defaults to `redis://localhost:6379`). Runtime is Node.js 20 (`firebase.json`).
