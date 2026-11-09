#!/usr/bin/env bash
# Takes the Mac App Store screenshots (2880×1800) with fictional data (`-demo`):
#   scripts/mac-screenshots.sh        → screenshots/appstore-mac/ (English)
#   scripts/mac-screenshots.sh all    → every App Store language, in screenshots/appstore-mac/<folder>
# The app draws its own windows into PNGs (`-snapshot`, DEBUG builds only), and
# scripts/mac-frame.swift puts them on a background.
set -euo pipefail
cd "$(dirname "$0")/.."

LANGUAGES=(
  "en:en:en_US" "de:de:de_CH" "fr:fr:fr_FR" "it:it:it_IT" "es:es:es_ES" "nl:nl:nl_NL"
  "pt-PT:pt:pt_PT" "pt-BR:pt-BR:pt_BR" "sv:sv:sv_SE" "da:da:da_DK" "nb:nb:nb_NO"
  "fi:fi:fi_FI" "ja:ja:ja_JP" "pl:pl:pl_PL"
)
app="build/mac/Build/Products/Debug/Shopping List.app/Contents/MacOS/Shopping List"
if [[ -z "${SKIP_BUILD:-}" ]]; then
  npm run -s project:generate >/dev/null
  xcodebuild build -project ShoppingList.xcodeproj -scheme ShoppingList -configuration Debug \
    -destination 'platform=macOS' -derivedDataPath build/mac CODE_SIGNING_ALLOWED=NO -quiet
fi

raw="$(mktemp -d)"
trap 'rm -rf "$raw"' EXIT
size=1280x800 # points: 2560×1600 pixels, framed on 2880×1800

shoot() { # file, language, locale, extra arguments…
  local file="$1" language="$2" locale="$3"
  shift 3
  # Now and then a capture comes out blank; try again.
  for _ in 1 2 3 4; do
    rm -f "$raw/$file.png"
    "$app" -demo -AppleLanguages "($language)" -AppleLocale "$locale" -snapshot "$raw/$file.png" \
      -snapshot-size "$size" "$@" >/dev/null 2>&1 || true
    swift scripts/mac-frame.swift --check "$raw/$file.png" && return
  done
  echo "Couldn't capture $file ($language)" >&2
  exit 1
}

frame() { swift scripts/mac-frame.swift "$@" >/dev/null; }

run() { # folder, language, locale
  local folder="$1" language="$2" locale="$3"
  local out="screenshots/appstore-mac$([[ "$folder" == en ]] || echo "/$folder")"
  mkdir -p "$out"
  shoot list "$language" "$locale" -snapshot-inspector
  shoot dark "$language" "$locale" -snapshot-dark
  shoot welcome "$language" "$locale" -demo-screen welcome
  shoot settings "$language" "$locale" -snapshot-settings=2
  frame "$out/1-list.png" light "$raw/list.png"
  frame "$out/2-dark.png" dark "$raw/dark.png"
  frame "$out/3-welcome.png" light "$raw/welcome.png" "$raw/welcome-sheet.png@920,230"
  frame "$out/4-settings.png" light "$raw/list.png" "$raw/settings.png@1600,300"
  echo "$out"
}

if [[ "${1:-}" == "all" ]]; then
  for entry in "${LANGUAGES[@]}"; do
    IFS=: read -r folder language locale <<<"$entry"
    run "$folder" "$language" "$locale"
  done
else
  run en en en_US
fi
