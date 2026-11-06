#!/usr/bin/env bash
set -euo pipefail
if [[ -f .env ]]; then
  set -a
  source .env
  set +a
fi
export IOS_DEVELOPMENT_TEAM="${IOS_DEVELOPMENT_TEAM:-}"
export CLOUD_SERVER_URL="${CLOUD_SERVER_URL:-https://shopping-list.tueftli.com}"
export BRING_API_KEY="${BRING_API_KEY:-${EXPO_PUBLIC_BRING_API_KEY:-}}"
if ! command -v xcodegen >/dev/null 2>&1; then
  echo "XcodeGen is required. Install it with: brew install xcodegen" >&2
  exit 1
fi
xcodegen generate --spec project.yml
