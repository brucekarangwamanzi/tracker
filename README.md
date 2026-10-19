# Bruce’s Life

A mobile-first Expo app for learning, everyday RWF money, and loan progress, backed by SQLite, Fastify, and PostgreSQL. The app includes a browser preview and native Android/iOS source. Cloud authentication and native signing require your own service configuration.

## Run the app

Use Node **22.12+**. Install the two lockfiles once:

```sh
npm ci
npm --prefix apps/mobile ci
npm start
```

Open **http://localhost:8080** and choose **Try with sample data**. No account or API is required for the local demo. For offline browser use, open Settings and wait for the offline-ready message. See [offline and online use](docs/OFFLINE.md). All interactions save to a real local SQLite database. `npm start` builds the Expo web app and serves it with the isolation headers required by SQLite’s web worker. Keep the terminal running. A current browser with OPFS and SharedArrayBuffer support is required.

For native development, run `npm run mobile`. Sample mode can be explored in Expo Go; private native records require a custom SQLCipher-enabled build. See [mobile setup, behavior, and limitations](docs/MOBILE.md).

## How it fits together

```mermaid
flowchart LR
  Screen[Expo screen] --> Local[(SQLite)]
  Local --> Queue[Durable command outbox]
  Queue --> Push[POST /sync/push]
  Push --> Auth[Verify token and validate]
  Auth --> Service[Atomic services]
  Service --> PG[(PostgreSQL)]
  PG --> Pull[GET /sync/pull]
  Pull --> Local
  Cron[node-cron] --> PG
  Cron --> Expo[Expo Push Service]
```

Screens read SQLite, including the Home dashboard. The server dashboard endpoint is an authoritative diagnostic/sync-side summary; screens do not depend on it for rendering. Both use the same `homeSummary` function.

One Node process, one PostgreSQL database, managed Supabase Auth, and Expo Push are sufficient. No Redis, message broker, or microservices are required. The database already handles transactional locks, sync receipts, and notification work leases.

## Run the optional cloud API

Use **Node 22.12+** (`.nvmrc` selects Node 22) and PostgreSQL 16+. Exact dependency resolutions are recorded in `package-lock.json`.

```sh
npm ci
cp .env.example .env
# Fill in the database URLs, Supabase issuer, and your allowed user UUID.
npm run db:generate
npm run db:migrate
npm run api:start
```

`npm run db:migrate` needs a migration/owner connection. The running API needs a separate restricted role. See [database setup and security](docs/SECURITY.md). `.env` is ignored by Git. The API listens on loopback by default; a production TLS reverse proxy can forward to it.

For Supabase, configure an **asymmetric ES256 or RS256 signing key**. Legacy HS256 tokens are intentionally rejected. Sign-in and OTP happen through managed Supabase Auth; this API does not implement password storage or its own OTP sender.

## Project map

| Path | Purpose |
|---|---|
| [Expo app](apps/mobile/src/app/_layout.tsx) | Mobile navigation, onboarding, app lock, and screen shell |
| [Mobile repository](apps/mobile/src/repository.ts) | SQLite-backed forms, financial operations, and sync integration |
| [UI guide](docs/UI.md) | Screen connections, design tokens, and interaction notes |
| [Algorithm guide](docs/ALGORITHMS.md) | Plain-language ideas, edge cases, pseudocode, code and test links for all ten algorithms |
| [Security guide](docs/SECURITY.md) | Auth, TLS, ownership, RLS, offline device protection, notification semantics and deployment limits |
| [Schema catalog](src/shared/schema.ts) | Shared business-table fields and server table whitelist |
| [Prisma schema](prisma/schema.prisma) | Generated PostgreSQL ORM models |
| [PostgreSQL migration](prisma/migrations/202610180001_initial/migration.sql) | Constraints, ownership foreign keys and RLS |
| [SQLite schema](src/mobile/schema.sql) | Same business fields plus local-only sync bookkeeping |
| [Mobile SQLite adapter](src/mobile/local.ts) | Atomic local writes, durable queue, exact BIGINT reads, push/pull, shadow copies and single-flight sync |
| [Offline financial drafts](src/mobile/drafts.ts) | Linked transfer and loan-payment rows before server acknowledgment |
| [Local dashboard](src/mobile/dashboard.ts) | Home data computed exclusively from SQLite |
| [Fastify routes](src/server/app.ts) | Request pipeline and API endpoints |
| [Financial services](src/server/finance.ts) | Transfers, budget alerts and loan-payment recording |
| [Sync service](src/server/sync.ts) | Receipts, optimistic versions, financial conflicts and incremental pull |
| [Reminder worker](src/server/reminders.ts) | Durable job logs, leases, push tickets and receipts |

## Important decisions

- Money is signed/nonnegative `bigint` as appropriate in TypeScript, **BIGINT in PostgreSQL** and **64-bit INTEGER in SQLite**. JSON money is a canonical decimal **string**, e.g. `"25000"`. RWF display is `RWF 25,000`. There are no floating-point money calculations.
- SQLite cannot safely return arbitrary 64-bit integers as JavaScript numbers. Use `readRows`/`selectExact`, which cast money columns to text before the bridge. Writes validate strings, then `CAST(? AS INTEGER)`. Do not use `SELECT *` or `SUM(amount)` through a number-returning mobile API for money; aggregate exact strings with `bigint`.
- Wallet balances are derived from ledger entries. Opening balances are recorded as clearly categorized opening transactions, not editable balance fields. Transfers are two linked rows and are excluded from income/expense reports.
- The current backend accepts **RWF only**. The wallet schema keeps a currency column for later expansion. Adding USD requires minor-unit rules and currency-separated reports; it is intentionally not silently accepted by the RWF-only API.
- User-authored IDs are client UUIDs. **As you approved, system records** such as change logs, snapshots, reminder logs, and budget alert events use server UUIDs. Every business/system table retains `id`, `user_id`, `updated_at`, `version`, and `deleted_at`.
- Multi-row changes use a transaction. A per-user PostgreSQL advisory lock keeps this single-user system simple and makes change-sequence publication commit ordered; explicit row locks protect reads that precede mutation. Failed operations roll back their receipts and change-log entries too.
- Notes/settings use **server-arrival last-write-wins**, not untrusted phone clocks. All other stale edits produce conflicts. Financial conflicts preserve both versions and require a user choice. Transfers and loan payments use dedicated commands, not independently synced ledger legs.
- Loans use **simple declining-principal ACT/365 Fixed**, integer annual basis points, and fractional-interest carry. This is an explicit supported convention, not a guess about a bank/SACCO/mobile lender’s contract. Flat fees, compounding, penalties, floating rates and ACT/360 need explicit future models. The old visual board’s monthly-1% example is not the backend’s interest convention.

## API

All routes except `GET /health` require `Authorization: Bearer <Supabase access token>`. Only `OWNER_USER_ID` is admitted in this personal installation. No `user_id` is accepted in command data.

| Route | Purpose |
|---|---|
| `POST /sync/push` | Up to 100 validated commands; accepted/conflicts/rejected lists |
| `GET /sync/pull?cursor=0&limit=250` | Commit-ordered, owner-scoped changes and tombstones |
| `GET /dashboard` | Study minutes, category budget left, next scheduled loan obligation, streak |
| `GET /weekly-review?day=2026-10-18` | Current and previous Monday-based week |
| `GET /loans/:id/planner?extra=25000` | Actual-date extra-payment simulation |
| `POST /loans/compare` | Snowball/avalanche with the same explicit `extra_per_event` amount and event calendar |
| `GET /skills/:id/roi` | Attributed income minus linked actual expenses, plus study minutes |

Example ordinary expense command; generate all UUIDs on the phone:

```json
{
  "changes": [{
    "op_id": "10000000-0000-4000-8000-000000000001",
    "kind": "mutate",
    "table": "entry",
    "id": "10000000-0000-4000-8000-000000000002",
    "base_version": 0,
    "deleted_at": null,
    "data": {
      "wallet_id": "10000000-0000-4000-8000-000000000003",
      "category_id": "10000000-0000-4000-8000-000000000004",
      "kind": "expense",
      "amount": "25000",
      "occurred_on": "2026-10-18",
      "transfer_id": null,
      "payment_id": null,
      "skill_id": null,
      "note": "Groceries"
    }
  }]
}
```

The referenced wallet/category must already exist or appear earlier in the queue. Retry the exact same `op_id` and payload after a timeout. A changed payload requires a new `op_id`. The body schemas in [validation.ts](src/server/validation.ts) are the command contract.

## Expo integration

The implemented screens live in `apps/mobile/src/screens`; Expo Router routes live in `apps/mobile/src/app`. The repository uses the shared SQLite schema, financial algorithms, atomic drafts, and sync coordinator. Local writes and their commands commit together. Exact queued revisions are cleared only after acceptance; financial conflicts have an explicit review screen.

Demo, unsigned private, and signed-in account databases are separate. Signing in does not upload sample records or automatically merge the unsigned private database. Native private databases require SQLCipher and store their keys in SecureStore. The browser preview uses browser storage and an interface PIN, not encrypted device storage.

## Verification

The schema catalog generates matching bootstrap schemas. The generator refuses to overwrite an initial PostgreSQL migration with changed content. Once deployed, evolve the database with new additive PostgreSQL migrations and explicit versioned SQLite migrations; never rewrite applied history or reinitialize the phone database.

```sh
npm run check
npm run mobile:check
npm run mobile:test
npm run mobile:build
# Enable the additional real PostgreSQL tests using a migrated disposable database
# and a role without SUPERUSER, BYPASSRLS, DELETE, TRUNCATE, or DDL privileges:
TEST_DATABASE_URL='postgresql://restricted_user:password@localhost/test_db?schema=life' npm test
```

Without `TEST_DATABASE_URL`, PostgreSQL integration tests are explicitly skipped; unit, API and real SQLite tests still run. Tests cover integer boundaries, transfers, alerts, loan rounding and schedules, payment races, streak timezones/DST, cursor pagination, conflicts, dirty acknowledgments, reminder leases/retries, dashboard, weekly review, snapshots, ROI and JWT verification.

Before production, configure managed Auth, a restricted database role, TLS and backups; build and test the native app on both platforms. No cloud project, credentials, push messages, or live deployment were created by this implementation.

See [the verification record](docs/VERIFICATION.md) for what was actually run.
