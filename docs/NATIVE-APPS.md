# Android and iPhone apps

The native Expo app in `apps/mobile` shares the website's screens and financial algorithms. Native builds include their screens, fonts, and assets and save records in local SQLite. Private native databases require the configured SQLCipher plugin; PIN secrets and database keys use SecureStore. The website and each native installation have separate local data. Optional cloud sync needs its own configured API and account.

## Build setup

Install both lockfiles using Node 22.13 or newer:

```sh
npm ci
npm --prefix apps/mobile ci
cd apps/mobile
npx eas-cli@latest login
npx eas-cli@latest init
```

Sign in directly through Expo's CLI; do not put passwords or access tokens in source control. `eas init` links this app to the intended Expo account and writes its project ID to the Expo config. App identifiers are `com.bruce.life` on both platforms. Signing credentials are managed by EAS. Confirm that the account can use these identifiers before the first build.

The `eas-build-pre-install` hook installs the repository's shared dependencies and regenerates the shared SQLite schema on the build worker. Root `.easignore` excludes environment files, signing files, databases, and generated native projects. Build profiles select Node 22 and remote build numbering.

## Downloadable Android APK

Run from `apps/mobile`:

```sh
npx eas-cli@latest build --platform android --profile preview
```

On the first build, let EAS create and securely store an Android signing keystore. When the build finishes, open the EAS installation link on your Android phone and download the APK. Allow installation from that browser when Android asks. Open the installed app and create your private dashboard; normal local use works in airplane mode.

For a Google Play bundle instead of a directly installable APK, use `--profile production`. A Play developer account and store submission are separate from creating the APK.

## iPhone through TestFlight

A paid Apple Developer membership and access to the app in App Store Connect are required. Run from `apps/mobile`:

```sh
npx eas-cli@latest build --platform ios --profile production
# After the intended build completes, submit its specific build ID:
npx eas-cli@latest submit --platform ios --id BUILD_ID
```

Sign in to Apple directly when requested so EAS can configure signing. Configure the app in App Store Connect and add testers in TestFlight. Install Apple's TestFlight app on the iPhone, accept the invitation, and install Bruce's Life. Uploading a build to TestFlight does not publish it publicly on the App Store; Apple's processing and any required beta review still apply.

For direct testing on a registered iPhone instead, register that device with `npx eas-cli@latest device:create`, then use `npx eas-cli@latest build --platform ios --profile preview`. The internal iOS build installs only on devices included in its provisioning profile. An iOS simulator build cannot be installed on an iPhone.

## Check before distribution

```sh
# From the repository root:
npm run mobile:check
npm run mobile:test
```

Test the signed apps on actual devices: create and unlock a private dashboard, save a record in airplane mode, close and reopen, and confirm the record remains. Check biometrics, local reminders, and CSV/PDF sharing on each platform. A successful JavaScript export does not establish native compilation or physical-device behavior.

Build configuration and source code are not installable binaries. Download links become available only after signed cloud builds finish successfully.

References: [EAS build setup](https://docs.expo.dev/build/setup/), [Android APKs](https://docs.expo.dev/build-reference/apk/), [internal distribution and iOS signing](https://docs.expo.dev/build/internal-distribution/).
