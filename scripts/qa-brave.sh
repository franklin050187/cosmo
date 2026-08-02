#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PROFILE="$ROOT/.qa/brave-profile"
URL="${1:-http://localhost:8000}"

mkdir -p "$PROFILE"

exec /usr/bin/brave \
  --user-data-dir="$PROFILE" \
  --no-first-run \
  --no-default-browser-check \
  "$URL"
