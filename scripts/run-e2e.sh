#!/usr/bin/env bash
set -euo pipefail
SIMULATOR_NAME="${IOS_SIMULATOR_NAME:-iPhone 17 Pro}"
MOCK_PORT="${MOCK_PORT:-8787}"
FLOW_PATH="${1:-maestro}"
if [[ -z "${JAVA_HOME:-}" && -d /opt/homebrew/opt/openjdk/libexec/openjdk.jdk/Contents/Home ]]; then
  export JAVA_HOME=/opt/homebrew/opt/openjdk/libexec/openjdk.jdk/Contents/Home
fi
command -v maestro >/dev/null 2>&1 || { echo "Maestro is required: https://maestro.mobile.dev" >&2; exit 1; }
node mocks/provider-server.mjs --port "$MOCK_PORT" &
MOCK_PID=$!
trap 'kill "$MOCK_PID" 2>/dev/null || true' EXIT
npm run project:generate
xcrun simctl boot "$SIMULATOR_NAME" 2>/dev/null || true
xcodebuild -project ShoppingList.xcodeproj -scheme ShoppingList -configuration Debug \
  -destination "platform=iOS Simulator,name=$SIMULATOR_NAME" \
  -derivedDataPath .build/DerivedData build
APP_PATH=".build/DerivedData/Build/Products/Debug-iphonesimulator/Shopping List.app"
xcrun simctl install booted "$APP_PATH"
maestro test "$FLOW_PATH"
