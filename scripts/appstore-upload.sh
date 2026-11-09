#!/usr/bin/env bash
# Fills the editable App Store version: listing texts, screenshots (6.1" and 6.9"), and the
# header and search-results images, in all 14 languages. Nothing is submitted for review.
# Needs ASC_KEY_ID and ASC_ISSUER_ID (see scripts/appstore.py) and a Python with pyjwt.
set -euo pipefail
cd "$(dirname "$0")/.."
# ASC_KEY_ID and ASC_ISSUER_ID from .env (not committed); the key itself stays in
# ~/.appstoreconnect/private_keys.
if [[ -f .env ]]; then
  export $(grep -E '^ASC_(KEY_ID|ISSUER_ID)=' .env | xargs)
fi
# A Python with pyjwt and cryptography: .build/appstore-venv, created on first use.
if [[ -z "${PYTHON:-}" ]]; then
  if [[ ! -x .build/appstore-venv/bin/python ]]; then
    python3 -m venv .build/appstore-venv
    .build/appstore-venv/bin/pip install -q pyjwt cryptography
  fi
  PYTHON=.build/appstore-venv/bin/python
fi
PY="$PYTHON"
# `appstore-upload.sh attach-build [build]`: attach an uploaded build (default: the one in
# project.yml) to the editable version, after it has been processed.
if [[ "${1:-}" == "attach-build" ]]; then
  build="${2:-$(sed -n 's/.*CURRENT_PROJECT_VERSION: *//p' project.yml | head -1)}"
  exec "$PY" scripts/appstore.py attach-build "$build"
fi
ALL=(en de fr it es nl pt-PT pt-BR sv da nb fi ja pl)
# `appstore-upload.sh version [x.y]`: create the next App Store version (default: MARKETING_VERSION
# in project.yml without a trailing .0); App Store Connect copies the previous listing.
if [[ "${1:-}" == "version" ]]; then
  version="${2:-$(sed -n 's/.*MARKETING_VERSION: *//p' project.yml | head -1 | sed 's/\.0$//')}"
  exec "$PY" scripts/appstore.py version "$version"
fi
# `appstore-upload.sh submit`: submit the editable version (with its attached build) for review.
if [[ "${1:-}" == "submit" ]]; then
  exec "$PY" scripts/appstore.py submit
fi
# `appstore-upload.sh listing`: only the texts (name, subtitle, description, keywords, …).
if [[ "${1:-}" == "listing" ]]; then
  exec "$PY" scripts/appstore.py listing "${ALL[@]}"
fi
"$PY" scripts/appstore.py listing "${ALL[@]}"
"$PY" scripts/appstore.py screenshots "${ALL[@]}" --replace
"$PY" scripts/appstore.py screenshots "${ALL[@]}" --replace --size=6.9
"$PY" scripts/appstore.py remove-screenshots APP_IPHONE_65
"$PY" scripts/appstore.py assets "${ALL[@]}" --replace
"$PY" scripts/appstore.py status
