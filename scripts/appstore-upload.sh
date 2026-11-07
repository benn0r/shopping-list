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
ALL=(en de fr it es nl pt-PT pt-BR sv da nb fi ja pl)
"$PY" scripts/appstore.py listing "${ALL[@]}"
"$PY" scripts/appstore.py screenshots "${ALL[@]}" --replace
"$PY" scripts/appstore.py screenshots "${ALL[@]}" --replace --size=6.9
"$PY" scripts/appstore.py remove-screenshots APP_IPHONE_65
"$PY" scripts/appstore.py assets "${ALL[@]}" --replace
"$PY" scripts/appstore.py status
