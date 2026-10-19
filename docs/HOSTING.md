# Install on Android and use offline

The web app can be hosted on Vercel using the root `vercel.json`. It builds the Expo website, includes the offline cache and Android install icons, and serves the isolation headers required by SQLite. Only the exported website is served; `.env`, database credentials, and local database files are excluded from uploads.

## Install on your phone

1. Open the production HTTPS link in Chrome on Android, with internet connected.
2. Open Chrome’s menu → **Add to Home screen** → **Install**. The wording can vary by Chrome version.
3. Open Bruce’s Life from the new home-screen icon.
4. Choose the private dashboard and set your PIN, or try the sample data.
5. Open **More → Settings → Offline & sync**. Keep the app open until **“Offline app files are ready.”**
6. Enable airplane mode, close the app, and reopen it from its icon. Your records should still be available, and new entries save locally.

Use the same production address each time. Each browser profile and website origin has separate records. Install the app before entering important records, and verify that your records appear in the installed app.

## Data and updates

Hosting the website does not configure cloud backup, sign-in, or synchronization. Records stay in the phone’s browser storage. Clearing site data or browser storage eviction can remove them; export important records in Settings. The browser PIN locks the interface; it does not encrypt the SQLite database.

Updates download while connected and activate after all app windows close. Local SQLite records are separate from the cached app files. This installation is a website added to Android’s home screen; it does not need an APK or a Play Store listing.

## Redeploy

From the repository root, using Node 22.13 or newer:

```sh
npm ci
npm --prefix apps/mobile ci
npm run mobile:build
vercel --prod --scope manzibruce67-4846s-projects
```

Verify that the linked project is `bruces-life-tracker` before deploying. For a fresh checkout, link it explicitly with `vercel link --project bruces-life-tracker --scope manzibruce67-4846s-projects`. The build needs no cloud credentials for local offline use. Optional account sync needs a separately configured HTTPS API, database, and managed authentication as described in [mobile setup](MOBILE.md).
