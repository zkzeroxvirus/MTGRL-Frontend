#!/usr/bin/env bash
set -euo pipefail

root_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
compose_file="$root_dir/docker-compose.yml"

config="$(
  API_BACKEND_URL=https://example.test \
  LEADERBOARD_SHEET_ID=example-sheet \
  docker compose -f "$compose_file" config
)"

echo "$config" | grep -q "^services:"
echo "$config" | grep -q "^  frontend:"
echo "$config" | grep -q "API_BACKEND_URL: https://example.test"
echo "$config" | grep -q "LEADERBOARD_SHEET_ID: example-sheet"
echo "$config" | grep -q "target: 80"
echo "$config" | grep -q "published: \"8080\""
