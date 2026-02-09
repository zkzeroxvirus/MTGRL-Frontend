#!/usr/bin/env bash
set -euo pipefail

root_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

for test_file in "$root_dir/tests/"*.test.sh; do
  echo "Running ${test_file##*/}"
  "$test_file"
done
