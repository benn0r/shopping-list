# Shopping List

> [!IMPORTANT]
> **This entire repository, including the application, design, tests, documentation, and deployment setup was made with AI.**

A local-first React Native shopping list for iOS and Android that scans EAN/UPC barcodes and
resolves product names. Bring synchronization can be enabled optionally in Settings.

## Screenshots

<table>
  <tr>
    <td align="center"><img src="docs/screenshot.svg" alt="Centered barcode scanner" width="260"><br><sub>Centered barcode scanner and recent history</sub></td>
    <td align="center"><img src="docs/screenshots/product-sheet.svg" alt="Product confirmation sheet" width="260"><br><sub>Edit the Bring label and quantity before adding</sub></td>
  </tr>
  <tr>
    <td align="center"><img src="docs/screenshots/settings.svg" alt="Apple-style settings" width="260"><br><sub>Language, account, and shopping-list settings</sub></td>
    <td align="center"><img src="docs/screenshots/custom-barcodes.svg" alt="Custom barcode modal" width="260"><br><sub>Add and manage custom barcode labels</sub></td>
  </tr>
</table>

## Features

- EAN-8, EAN-13, UPC-A, and UPC-E scanning with the device camera
- Free product lookup through Open Food Facts
- Household, beauty, and pet-product lookup through the Open Facts product family
- Automatic or selected product language with localized-name fallback
- Generic, exact, or ask-every-time item labels
- Custom barcode-to-label mappings that override online results
- Persistent local shopping list with tap-to-mark-purchased behavior
- Optional Bring synchronization with platform secure-storage-backed credentials
- Bring shopping-list selection and explicit logout when synchronization is enabled
- Confirmation before an item is added, with an optional quantity

## Run locally

Requirements: Node.js 22 and npm. Building for iOS also requires Xcode; building for Android
locally requires JDK 17 and Android SDK 36. A physical device is needed for camera scanning.

```sh
npm ci
npm run ios
```

Before running the app, create an ignored `.env` file:

```sh
cp .env.example .env
```

Set `EXPO_PUBLIC_BRING_API_KEY` in that file. Expo public environment variables are embedded in the
compiled app, so this keeps the value out of Git but does not make a mobile client key
cryptographically secret.

Useful device shortcuts:

```sh
npm run ios:device   # Debug build on a connected iPhone
npm run ios:release  # Standalone Release build on a connected iPhone
npm run android:device    # Debug build on a connected Android device
npm run build:android:apk # Standalone Android APK
npm run dev:tunnel        # Metro dev server reachable through an Expo tunnel
```

`ios:device` opens Expo's eligible-device picker. To target a device directly without the picker, pass its name locally:

```sh
npm run ios:device -- "Your iPhone Name"
```

Do not commit a personal device name or UDID to the repository.

## Android CI artifact

After the quality, build, unit, integration, browser, and coverage jobs pass on `main`, Gitea builds
a standalone Android APK and keeps it as a workflow artifact for 30 days. Configure the
`EXPO_PUBLIC_BRING_API_KEY` repository secret before running the job. The workflow generates the
native Android project with Expo Prebuild, so it does not use EAS or require an Expo account.

The artifact is named `shopping-list-android-preview-<commit>` and can be sideloaded on an Android
device. It is a preview build signed with Expo's generated debug identity, not a production signing
identity for an app store. A future store release needs a private, backed-up Android keystore.

Run verification with:

```sh
npm run format:check
npm run lint
npm run typecheck
npm test
npm run test:integration
npm run test:coverage
npm run build
npm run test:e2e:local
```

`npm test` runs isolated unit tests. `npm run test:integration` runs the rendered React Native and
service flows that previously lived under the misleading E2E name. `npm run test:e2e` runs genuine
Playwright browser tests against the already exported Expo web bundle. To build that bundle and run
the browser suite in one command, use:

```sh
npm run test:e2e:local
```

The browser suite uses Chromium, a synthetic camera, mocked external services, and enforced
`.example` account data. Its test API and credential adapter only run on a loopback host, so the
bundle cannot send credentials to Bring. It covers sign-in and logout, persisted settings, every
language and label option, custom barcodes, centered-barcode selection, product lookup failures, and
Bring add/retry behavior without contacting live services. The test-only web export is not uploaded
as a build artifact, is not a deployable version of the native app, and does not replace real-device
checks for camera APIs, platform secure storage, or native safe areas.

The coverage command runs the complete unit and integration suite and enforces minimum global
coverage thresholds.

Automatically format the codebase and apply safe ESLint fixes with:

```sh
npm run fix
```

## Privacy and service notes

See the [Privacy Policy](PRIVACY.md) for a complete description of on-device storage and network
communication.

In the native app, credentials are stored only in platform secure storage and are never written to
source files or regular app storage. The test-only browser build enables an isolated session-only
adapter for fantasy test credentials. Shopping-list selection and custom barcode mappings remain on
the device.

Product information comes from these community-contributed Open Facts databases:

- [Open Food Facts](https://world.openfoodfacts.org/) for food and drinks
- [Open Products Facts](https://world.openproductsfacts.org/) for household goods and other non-food products
- [Open Beauty Facts](https://world.openbeautyfacts.org/) for cosmetics, hygiene, and personal-care products
- [Open Pet Food Facts](https://world.openpetfoodfacts.org/) for pet food and treats

Their data is available under the Open Database License. Coverage and labels vary by country and contributor data.

## License

MIT — see [LICENSE](LICENSE).
