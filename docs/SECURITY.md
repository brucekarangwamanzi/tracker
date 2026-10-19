# Security and operations

## Request pipeline

1. **TLS:** terminate HTTPS at a maintained reverse proxy/load balancer. Production Fastify rejects non-HTTPS requests. Trust only the configured proxy IP/CIDR; otherwise a client could spoof `X-Forwarded-Proto` or its source IP. Bind Fastify to a private interface/loopback behind that proxy.
2. **Rate limits and request size:** Fastify permits 120 requests/minute per source and 30 sync pushes/minute, with a 256 KiB body limit. This is suitable for one process and one user. Put a shared edge limit in front of multiple processes; an in-memory limiter does not coordinate across servers.
3. **Managed sign-in/OTP:** those endpoints belong to Supabase, not Fastify. Configure their rate limits, CAPTCHA and allowed redirect URLs at the auth provider. Use a stricter account/IP policy for OTP issuance and verification than normal data sync. Applying a Fastify limit cannot protect an auth endpoint called directly at Supabase. No login/OTP proxy or custom password/OTP implementation is included here.
4. **Token verification:** `jose` checks the asymmetric signature against the configured issuer’s fixed JWKS URL, allowed algorithm, issuer, audience, expiry and required subject. The key URL never comes from the token. JWKS handles signing-key rotation. Only the configured owner UUID, role `authenticated`, and non-anonymous sessions are accepted. No user-editable metadata is used for authorization.
5. **Schema validation:** strict Zod schemas reject unknown command fields, money numbers/decimals, invalid UUIDs/dates, unknown tables and system-table writes. IDs and money strings have explicit limits. Validation messages avoid database details.
6. **Service authorization:** `user_id` is taken from the verified token. Every repository query is owner-scoped, references must belong to the same owner, and clients cannot submit server-owned loan balances through generic mutations.
7. **Transactional persistence:** multi-step operations, their receipts and sync change logs commit together. User-level advisory locks serialize the personal account’s operations; `FOR UPDATE` protects entity reads preceding writes.
8. **Database defense:** RLS, same-owner composite foreign keys, unique constraints and checks defend against a missed filter. A runtime role without DELETE/DDL privileges prevents hard deletion. The API never builds SQL identifiers from unchecked request text.
9. **Response/logging:** money is serialized as strings. Auth/cookie headers are redacted, request bodies are not logged, and unexpected errors return a generic error. Keep device tokens, notes, journals, payment details and sync payloads out of operational logs.

## Database roles

Keep the application schema **`life` private**, outside Supabase’s exposed Data API schemas. The mobile app talks to Fastify, not directly to business tables. The default Supabase `postgres`/service role is too powerful for the runtime connection.

Use a separate migration role to apply migrations. Provision a restricted login role through your hosting provider or a DBA session, using a generated secret stored outside source control. Then grant only:

```sql
-- Run as the owner/migrator, after applying migrations.
-- Create/provision this login securely; never use a password from a README.
ALTER ROLE life_runtime NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
GRANT USAGE ON SCHEMA life TO life_runtime;
GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA life TO life_runtime;
REVOKE DELETE, TRUNCATE, REFERENCES, TRIGGER ON ALL TABLES IN SCHEMA life FROM life_runtime;
REVOKE CREATE ON SCHEMA life FROM life_runtime;
```

Review memberships too: a role must not inherit destructive/owner privileges through another role. Grant the same limited privileges to future tables deliberately after migrations. Do not grant the mobile `anon` or `authenticated` Data API roles business-table access.

Each API database transaction sets `app.user_id` locally to the verified UUID. The RLS policy checks that value for both reads and writes and handles an absent/empty setting by returning no rows. The RLS setting is defense against application mistakes, **not** protection from a stolen runtime database password: an attacker with direct SQL access could set a different value. Keep that password server-only and rotate it if exposed.

`MIGRATION_DATABASE_URL` is read by Prisma CLI if present; `DATABASE_URL` is used by the running API. Use TLS/verified certificates for remote database connections. Do not set certificate verification to false.

## Financial records and conflicts

- Financial records are soft-deleted with `deleted_at`; the runtime role has no DELETE permission. Old values remain in owner-scoped sync change history. There is no financial purge endpoint.
- A linked transfer/payment expense is immutable through ordinary entry mutations. Correcting those operations requires an explicit compensating/replay workflow; do not manually patch principal and expense separately.
- A conflicting amount is never inserted as a second real expense just to “keep both.” The incoming command and server snapshot go into `sync_conflict`, excluded from balances and reports.
- Clients cannot set a canonical `version`, `updated_at`, or `user_id`. A financial user decision still rechecks the latest server version. A replayed idempotency key must have an identical canonical payload hash.
- Tombstones/change logs are retained indefinitely for safe long-offline pull. If storage later needs retention, first design a full resnapshot protocol and expired-cursor handling; do not simply delete old tombstones.

## Device protection

The server code and SQLite adapter do not implement a complete native security UI. Integrate these controls in Expo before putting real personal data on a device:

- Store auth refresh material in **Expo SecureStore**, not SQLite, plain AsyncStorage, logs or app configuration. Keep only publishable auth configuration on the phone. Never ship database credentials or a Supabase secret/service-role key in the app.
- Use `expo-local-authentication` for biometrics/device-passcode authentication and gate the app on cold launch and after the chosen inactivity period. The OS prompt’s passcode fallback is simpler than inventing a custom cryptographic PIN system. A custom in-app PIN screen remains a separate native integration task; do not mistake a six-digit UI check for database encryption.
- Hide sensitive recent-app previews and return to a locked screen before rendering financial records. Cancelled/failed biometric authentication stays locked. Clear in-memory auth state when locking if the chosen session model requires it.
- Use a user-specific database file. On sign-out, stop that user’s sync and jobs, drop in-memory references, and require unlock before reopening it; do not sync the previous user’s queue under a new account. Account switching must never reuse a pending queue.
- For encrypted local storage, build Expo SQLite with **SQLCipher** and provision a random database key through SecureStore. This requires a development/production native build, not an assumption that Expo Go encrypts ordinary SQLite. Never hard-code the encryption key or treat a short PIN as the raw database key. WAL files and device backups must follow the same protection policy.
- Decide how encrypted local data is recovered after device loss. SecureStore/keychain availability varies with uninstall, backup, biometric changes and device policy. Do not promise recovery of unsynced changes that existed only on a lost phone.
- Completed study sessions and pending financial records remain local while offline. Locking the app must not delete the outbox. If secure token access requires an unlocked device, defer background sync rather than bypass the lock.

These requirements need physical iOS/Android validation; the provided SQLite SQL is verified independently of the native bridge.

## Token lifecycle

Short-lived access tokens keep signature-only verification simple. The managed SDK refreshes them; a 401 stops the current sync until refresh/re-authentication, without deleting local changes. Do not decode an unverified token to choose a user.

Local JWT verification does not guarantee instant revocation after logout, a stolen access token, or an account deletion. Configure a short access-token lifetime. If immediate revocation is required, add a server session-status/revocation check for sensitive operations and test the provider’s actual revocation behavior. Do not claim logout invalidates an already issued JWT instantly.

## Reminders and operations

Enable Expo push access-token protection for the project and set `EXPO_ACCESS_TOKEN` server-side. Device token registration is authenticated and tied to this user. Ask for OS notification permission after the user opts in; the current API does not send any notifications during tests.

Notification bodies are generic and contain no balance or lender name. Durable occurrence keys and database leases prevent normal duplicate work; an ambiguous timeout after provider acceptance can still produce an external duplicate. Receipt acceptance does not mean the user read the message. Quiet hours are checked again before send and retry.

Run one cron process initially. `noOverlap` is a process-local guard; database claims also protect reminder sends across processes. Keep the server clock synchronized, process time in UTC, and use IANA zones for user dates. Alert on repeated failed jobs rather than swallowing their existence. Pending rows survive server restarts; notifications expire rather than being delivered long after they mattered.

Use managed PostgreSQL automated backups with point-in-time recovery where available. Test restoration to a separate database and check transaction counts, ledger totals, receipts and RLS after restoring. Offline-first is not a backup strategy: unsynced local data is not yet protected by server backups.

Keep lockfiles, run `npm audit` and review upgrades rather than jumping to a release candidate. The implementation uses stable Prisma 7; a newer major release candidate is not required. Deploy dependency updates through the same unit, SQLite and restricted-role PostgreSQL tests.

## Official references checked for this implementation

- [Supabase JWTs and JWKS verification](https://supabase.com/docs/guides/auth/jwts)
- [Supabase auth rate limits](https://supabase.com/docs/guides/auth/rate-limits)
- [Supabase breaking changes](https://supabase.com/changelog?types=breaking-change)
- [Fastify validation and serialization](https://fastify.dev/docs/latest/Reference/Validation-and-Serialization/)
- [Prisma transactions](https://www.prisma.io/docs/orm/fundamentals/transactions)
- [Prisma 7 client generators](https://www.prisma.io/docs/orm/v7/prisma-schema/overview/generators)
- [PostgreSQL row-level security](https://www.postgresql.org/docs/current/ddl-rowsecurity.html)
- [Expo SQLite, exclusive transactions and SQLCipher](https://docs.expo.dev/versions/latest/sdk/sqlite/)
- [Expo SecureStore](https://docs.expo.dev/versions/latest/sdk/securestore/)
- [Expo LocalAuthentication](https://docs.expo.dev/versions/latest/sdk/local-authentication/)
- [Expo push tickets, receipts and retry semantics](https://docs.expo.dev/push-notifications/sending-notifications/)
- [node-cron scheduling options](https://www.nodecron.com/scheduling-options.html)
