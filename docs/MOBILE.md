# Mobile app

`apps/mobile` is Expo SDK 58 with React Native, Expo Router, and SQLite. It shares the existing TypeScript financial algorithms and SQLite schema with the backend. The browser preview uses React Native Web and Expo SQLite’s actual WASM worker. It now includes a service worker for offline reopening after its first complete download.

## Run and build

From the repository root, with Node 22.12+:

```sh
npm ci
npm --prefix apps/mobile ci
npm start
```

Open http://localhost:8080. The startup command regenerates the shared mobile schema, exports the web bundle, and starts a loopback-only static server. HTML, JavaScript, and WASM receive the COOP/COEP headers needed for SQLite. Missing assets return 404; deep links return the app shell. Stop with Ctrl+C. `WEB_PORT=8090 npm start` selects another port; update API CORS origins if connecting cloud sync.

`npm run mobile:serve` serves an already exported bundle. `npm run mobile` starts Metro for native development. Prefer the root `npm start` for the browser: Metro’s HTML middleware does not reliably apply custom isolation headers. Native app storage works offline. The browser export now includes a versioned offline app cache: open Settings and wait for the offline-ready message before disconnecting. See [offline and online behavior](OFFLINE.md).

To create an internally distributed Android build after configuring your Expo account, run `npx eas-cli@latest build --platform android --profile preview` inside `apps/mobile`. Native packages and SQLCipher are configured through Expo plugins. No signing credentials, EAS project, APK, or App Store deployment has been created. JavaScript/Hermes export success does not replace native compilation or device testing.

## Try it

Choose **Try with sample data**. The four wallets start with Cash RWF 25,000, Bank RWF 300,000, MTN MoMo RWF 185,000, and Airtel Money RWF 27,500. Income totals RWF 850,000; expenses RWF 312,500. Linked wallet transfers do not inflate these reports. Examples use dates relative to first launch; existing demo records remain saved on later launches.

Add an expense from the floating + button. Choose a wallet, category, and whole-franc amount. The next transaction remembers that wallet. Open the entry and choose **Undo this entry** to soft-delete an ordinary transaction. Linked transfers and loan-payment entries cannot be deleted independently.

Open Skills to check milestones, save notes, run a 25-minute timer, or log a study session. A focus timer measures wall-clock elapsed time while that screen is mounted; log/save before navigating away. The current version does not restore a running timer after process termination.

Loans support bank, SACCO, mobile lending, and friends/family; weekly, monthly, and custom dated payments; zero interest; partial and extra payments. Recordings split interest before principal and create an expense in the same SQLite transaction. Rapid payments serialize against the latest local state. Overpayment is rejected without changing balances. Payoff simulations use the documented ACT/365 simple-interest convention; lender fees and penalties need explicit future models.

Money includes wallet balances, category/month budgets, three-month income/spending comparisons, category spending, and transaction filters. Settings include light/dark mode, timezone, PIN, CSV transaction export, and a printable PDF summary. Weekly review and skill ROI are reachable from More. Future savings goals, mood journal, and net-worth chart screens remain phase 2; the backend net-worth algorithm already exists.

## Personal records and privacy

Onboarding offers an empty private dashboard protected by a six-digit PIN. In sample mode, enable a PIN in Settings, then choose **Start my private dashboard**. Sample and private records have different database files. Signed-in users have their own files; signing in does not silently migrate the unsigned private dataset.

PIN verification uses a salted PBKDF2 hash and persistent retry delays. Native secrets and database keys use SecureStore. Native private mode fails closed if SQLCipher is unavailable, so use a custom native build; Expo Go is suitable for sample mode. Biometrics use the OS prompt. Locking hides screens and backgrounding locks a PIN-enabled dashboard; it does not close an open SQLite connection. Device/OS security still matters.

The browser preview has an interface lock and unencrypted, origin-local SQLite/browser storage. It is for previewing the app, not the same security boundary as SQLCipher and SecureStore. Browsers may evict local data; export valuable records and configure cloud backup before relying on it for personal finances. The preview requires browser support for OPFS, WASM, and cross-origin isolation.

RWF is the enabled currency, stored and calculated as integers and displayed with thousands separators. Currency is retained per wallet for later expansion. USD is not accepted yet; separate minor-unit rules and reports are required before enabling it. Wallets are manually tracked; there is no connection to MTN, Airtel, or a bank.

## Optional cloud sync

Copy `apps/mobile/.env.example` to `apps/mobile/.env` and configure your Supabase public URL/publishable key and public HTTPS Fastify API URL. These public build-time values are compiled into the app; never add a service-role key or database password. Rebuild after changing them. Configure the server’s `.env` separately, including the allowed owner UUID and matching issuer. Production CORS uses the explicit `WEB_ORIGINS` list. Never disable verified-token authentication to make a demo work.

The app supports signing into an existing managed account in Settings. Account creation/recovery is managed outside this version’s UI. Sync runs after local changes, on foreground, on reconnect across native/web, periodically while active, and manually, with bounded retry backoff. SQLite remains the screen data source. Queue errors and financial conflicts are retained; More → Settings → Review sync conflicts shows both versions. Loan-payment conflicts require keeping the server version and reviewing a fresh payment, preventing an accidental double payment.

The demo is never synced into a real account. Cloud sync is not currently configured in this workspace, so the running app uses local data. The API’s placeholder issuer preserves authentication enforcement.

## Reminders and verification limits

Reminder forms save study, loan, and bill reminders, with 22:00–07:00 quiet hours. On native, permission is requested only when enabling a reminder; notifications are scheduled locally and store their IDs. Web saves settings without claiming notification delivery. The existing server worker provides durable logs, retries, and Expo push ticket/receipt handling. This app has not registered a real push token or sent notifications; native local scheduling is the available client path. Local and server push delivery should not both be enabled for the same reminder without choosing one authority.

Run `npm run mobile:check` for strict TypeScript and Expo lint, `npm run mobile:test` for real SQLite repository tests, and `npm run mobile:build` for the browser export. Native exports are checked with `expo export --platform all`. Browser testing was explicitly declined for this handoff; no screenshots or visual interaction passes are claimed. Physical device checks for biometrics, encryption, native notifications, and sharing remain necessary before release.

The mobile dependency tree currently has upstream npm advisories in Expo/Metro tooling, including `braces` and `node-forge`. Compatible audit fixes were applied; npm’s remaining force-fix proposal downgrades to an incompatible Expo generation and was not applied. Review these advisories before release. The backend dependency tree is separate.
