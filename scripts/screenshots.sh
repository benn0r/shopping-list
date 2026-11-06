#!/usr/bin/env bash
# Takes the App Store screenshots with fictional data (`-demo`) on a dedicated simulator.
#   scripts/screenshots.sh                    → screenshots/appstore/      (iPhone 17 Pro, 1206×2622:
#                                               App Store Connect's "iPhone with Dynamic Island" size)
#   LANGUAGE=de LOCALE=de_CH scripts/screenshots.sh → screenshots/appstore/de/
#   scripts/screenshots.sh all                → every App Store language
set -euo pipefail
cd "$(dirname "$0")/.."

# App Store language folder → app localization and locale.
LANGUAGES=(
  "en:en:en_US" "de:de:de_CH" "fr:fr:fr_FR" "it:it:it_IT" "es:es:es_ES" "nl:nl:nl_NL"
  "pt-PT:pt:pt_PT" "pt-BR:pt-BR:pt_BR" "sv:sv:sv_SE" "da:da:da_DK" "nb:nb:nb_NO"
  "fi:fi:fi_FI" "ja:ja:ja_JP" "pl:pl:pl_PL"
)
if [[ "${1:-}" == "all" ]]; then
  for entry in "${LANGUAGES[@]}"; do
    IFS=: read -r folder language locale <<<"$entry"
    LANGUAGE="$language" LOCALE="$locale" FOLDER="$folder" SKIP_BUILD="${SKIP_BUILD:-}" bash "$0"
    SKIP_BUILD=1
  done
  exit 0
fi

language="${LANGUAGE:-en}"
locale="${LOCALE:-en_US}"
folder="${FOLDER:-$language}"
out="${OUT:-screenshots/appstore$([[ "$folder" == en ]] || echo "/$folder")}"
bundle_id=ch.benn0r.shoppinglist
udid="$(bash scripts/simulator.sh "Shopping List Screenshots" "${SIMULATOR:-iPhone 17 Pro}")"

if [[ -z "${SKIP_BUILD:-}" ]]; then
  npm run -s project:generate >/dev/null
  xcodebuild build -project ShoppingList.xcodeproj -scheme ShoppingList -configuration Debug \
    -destination "id=$udid" -derivedDataPath .build/DerivedData -quiet
  xcrun simctl install "$udid" ".build/DerivedData/Build/Products/Debug-iphonesimulator/Shopping List.app"
fi
xcrun simctl privacy "$udid" grant camera "$bundle_id" 2>/dev/null || true
xcrun simctl ui "$udid" appearance light
xcrun simctl status_bar "$udid" override --time "9:41" --batteryState charged \
  --batteryLevel 100 --wifiBars 3 --cellularMode active --cellularBars 4
trap 'xcrun simctl status_bar "$udid" clear' EXIT

mkdir -p "$out"
shoot() { # file, demo screen
  xcrun simctl launch --terminate-running-process "$udid" "$bundle_id" -demo -demo-screen "$2" \
    -AppleLanguages "($language)" -AppleLocale "$locale" >/dev/null
  sleep "${DELAY:-6}"
  xcrun simctl io "$udid" screenshot "$out/$1.png" >/dev/null 2>&1
  echo "$out/$1.png"
}

shoot 1-list list
shoot 2-online welcome
shoot 3-scanner scanner
shoot 4-product product
shoot 5-shopping shopping
