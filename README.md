# Shopping List

> [!IMPORTANT]
> **This entire repository, including the application, design, tests, documentation, and deployment setup was made with AI.**

An iPhone-only shopping list application written entirely in Swift 6 and SwiftUI. It stores lists,
items, stores, and shopping history locally and optionally synchronizes each list through a
provider-neutral adapter. Bring and Mealie adapters are included and may be enabled at the same
time; each local list maps to at most one remote list.

## Features

- Native SwiftUI navigation, tabs, forms, sheets, menus, list rows, and three-column tiles
- Multiple local shopping lists with optional per-list provider mapping
- Manual item entry and native AVFoundation EAN-8, EAN-13, and UPC-E scanning
- Pull-to-refresh provider synchronization
- Store CRUD, multi-list shopping sessions, reversible purchases, and history
- Product barcode, image, quantity, unit, source-list, store, and timestamp metadata
- Abstract `ShoppingProvider` contract with Bring and Mealie implementations
- Local JSON persistence with no React Native, Expo, JavaScript runtime, Pods, or Android target

## Requirements

- macOS with Xcode 26 or newer
- Node.js 22 and npm (command runner only; there are no npm dependencies)
- [XcodeGen](https://github.com/yonaskolb/XcodeGen): `brew install xcodegen`
- [Maestro](https://maestro.mobile.dev/) for E2E tests: `brew install maestro`

## Commands

Copy `.env.example` to the ignored `.env` file and set `IOS_DEVELOPMENT_TEAM` to your Apple
Developer Team ID. Project generation then applies automatic signing every time, so regenerating
`ShoppingList.xcodeproj` does not lose the selected team.
Set `BRING_API_KEY` in the same file when using Bring synchronization. The value is embedded into
the app at build time; the previous `EXPO_PUBLIC_BRING_API_KEY` name is accepted for migration.

```sh
npm run ios          # Generate and open the Xcode project
npm test             # Run XCTest on an iPhone simulator
npm run test:e2e     # Build, start mock providers, and run Maestro flows
npm run build        # Unsigned native Release build
npm run ios:release  # Signed Release build using local Xcode signing settings
npm run deploy       # Install Release app; requires IOS_DEVICE_ID
```

The generated `ShoppingList.xcodeproj` is derived from the tracked `project.yml`. Change project
settings in that file and regenerate instead of editing the project manually.

## Provider tests

`npm run mock:providers` starts a dependency-free local server on port 8787. It implements the
Bring authentication/list/item endpoints and Mealie shopping-list/item endpoints used by the app.
Maestro starts this server automatically so E2E tests never contact live provider accounts.

The mock data is fictional. Provider URLs and credentials are entered at runtime and must never be
committed. Shopping List is independent and is not affiliated with Bring! Labs AG or the Mealie
project.

## Architecture

- `ShoppingListApp/Models.swift`: provider-neutral persisted data
- `ShoppingListApp/AppStore.swift`: local storage and shopping workflows
- `ShoppingListApp/Providers.swift`: Bring/Mealie adapters
- `ShoppingListApp/*Screen.swift`: native SwiftUI interface
- `ShoppingListTests/`: XCTest unit tests
- `maestro/`: simulator E2E flows
- `mocks/`: deterministic local provider API

See [PRIVACY.md](PRIVACY.md) for privacy details.

## License

MIT — see [LICENSE](LICENSE).
