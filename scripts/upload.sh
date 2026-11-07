#!/usr/bin/env bash
# Archives a Release build and uploads it to App Store Connect (automatic signing).
# Bump CURRENT_PROJECT_VERSION in project.yml before uploading another build of the same version.
set -euo pipefail
cd "$(dirname "$0")/.."
if [[ -f .env ]]; then
  set -a
  source .env
  set +a
fi
# Signs in with the App Store Connect API key (ASC_KEY_ID, ASC_ISSUER_ID in .env; the .p8 in
# ~/.appstoreconnect/private_keys), so no Apple account has to be signed in to Xcode.
auth=()
if [[ -n "${ASC_KEY_ID:-}" && -n "${ASC_ISSUER_ID:-}" ]]; then
  auth=(-authenticationKeyPath "$HOME/.appstoreconnect/private_keys/AuthKey_${ASC_KEY_ID}.p8"
    -authenticationKeyID "$ASC_KEY_ID" -authenticationKeyIssuerID "$ASC_ISSUER_ID")
fi
npm run -s project:generate >/dev/null
rm -rf .build/ShoppingList.xcarchive .build/export
xcodebuild archive -project ShoppingList.xcodeproj -scheme ShoppingList -configuration Release \
  -destination 'generic/platform=iOS' -archivePath .build/ShoppingList.xcarchive \
  -derivedDataPath .build/DerivedData -allowProvisioningUpdates "${auth[@]}" -quiet
xcodebuild -exportArchive -archivePath .build/ShoppingList.xcarchive \
  -exportOptionsPlist scripts/ExportOptions.plist -exportPath .build/export -allowProvisioningUpdates \
  "${auth[@]}"
