# Use Bruce’s Life offline and online

Every form saves to SQLite first. Internet access is not required to add income, expenses, transfers, study sessions, milestones, notes, or loan payments. Wallet balances, budgets, payoff planning, weekly review, and skill ROI are calculated from local records. Reconnection does not switch the screen’s data source to the server.

## Browser

Open http://localhost:8080 while the server is running. Go to **More → Settings → Offline & sync** and wait for **“Offline app files are ready.”** The first visit downloads the complete exported app, including route bundles, fonts, and the SQLite worker/WASM files. After that, this same browser profile can reopen the app at the same address without the server or internet, subject to browser storage support and retention.

You can add the app to your home screen where your browser supports it. An installed native app remains the preferred phone experience. Private/incognito browsers may clear data when closed. Clearing site data removes both the offline app and local records. Browsers can also evict storage; keep exports and configure cloud backup for important records.

The service worker caches **static app files only**. It never caches sync requests, authentication responses, exports, or financial API results. Financial records remain in SQLite, and credentials remain in their existing storage. Cached HTML retains the isolation headers required for SQLite. Offline readiness means a complete app download has activated, not a promise that a browser can never evict it.

Updates install into a separate cache. They wait until all existing app windows close, avoiding a mix of old screens and new bundles. Settings shows an update notice. Close every Bruce’s Life window, then reopen to activate the update. This removes old app-file caches without deleting SQLite or account records. A failed app download does not replace the active version.

Browser caching follows the [Expo PWA guidance](https://docs.expo.dev/guides/progressive-web-apps/) and the [service-worker lifecycle](https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API/Using_Service_Workers). Production hosting must serve the app over HTTPS with the same COOP/COEP headers and root-scoped `sw.js`; localhost is suitable for local development.

## Installed phone app

Once installed, the native app already contains its screens and saves data in SQLite. It works in airplane mode. Private native records require the configured SQLCipher-enabled build; sample mode works in Expo Go, whose initial project loading is separate from an installed standalone app. Biometric/PIN unlock remains local.

Connection events come from the SDK-compatible [Expo Network module](https://docs.expo.dev/versions/v58.0.0/sdk/network/). A network connection does not prove the cloud server is reachable, so failed server requests have a separate status.

## Online sync

With an authenticated account and HTTPS API configured, sync runs after local changes, on reconnection, and when the app returns to the foreground. Successful idle sync checks repeat every 30 seconds while the app is active. Failed requests back off from 5 seconds to at most 5 minutes. The app does not claim background delivery after the OS suspends or closes it; reopening it resumes sync.

Sync retries reuse the stored command UUIDs. Unaccepted writes stay in the durable SQLite queue, including after an app restart. Financial conflicts keep both versions for review. Network work does not block transaction forms or study entry. Multiple manual/automatic triggers share the active sync operation.

Previously cached account records remain locally available through the device PIN if credentials expire or cannot refresh offline. This is local access only: every server request still needs a fresh, valid token. Explicit sign-out clears the remembered account identity and hides that account’s database; it does not delete its records or merge them into another account.

The existing authentication provider has **not** been replaced. Cloud sync is inactive in the current local demo until account/server configuration is connected. Your requested Clerk migration remains pending the confirmation required by your pasted Clerk instructions. No account or deployment was created by this change.

## Status messages

| Status | Meaning |
|---|---|
| Offline · saved here | You can keep working. Changes stay in SQLite. |
| Online · on device | The device is connected; cloud account/server setup is incomplete. |
| Online · demo | Sample data remains local even with internet access. |
| Sign in to sync | Local data is available; fresh account credentials are needed online. |
| Waiting to sync | Saved local changes are waiting for server acceptance. |
| Syncing… | Network work is running; local forms remain usable. |
| Sync needs retry | The attempt failed; writes are retained. |
| Needs review | Conflicting versions need your choice. |
| Synced | A sync succeeded, no dirty commands remain, and no known conflicts need review. |

## Verification

Automated tests exercise the service-worker cache lifecycle in a Node harness, including offline deep links, SQLite worker/WASM access, isolation headers, cache revisions, failed installation, and exclusion of authenticated/API requests. A real SQLite test closes and reopens the saved database after a failed push, then retries the same operation successfully without duplication. Status tests prevent a connected device or empty queue from being mislabeled as cloud-synced.

No browser automation was run, following your earlier instruction. Offline reopening, airplane-mode behavior, authentication refresh, and OS storage retention still require real browser/device checks before release. A native bundle export does not substitute for a signed native build or physical-device test.
