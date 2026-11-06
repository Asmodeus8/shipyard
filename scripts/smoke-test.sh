#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${1:?usage: $0 <base_url> <expected_version>}"
EXPECTED="${2:?usage: $0 <base_url> <expected_version>}"
TIMEOUT="${SMOKE_TIMEOUT_SECONDS:-300}"
deadline=$(( $(date +%s) + TIMEOUT ))

echo "Waiting for ${BASE_URL} to serve ${EXPECTED} (timeout ${TIMEOUT}s)"
streak=0
until (( streak >= 5 )); do
  if (( $(date +%s) > deadline )); then
    echo "FAIL: ${EXPECTED} not consistently served within ${TIMEOUT}s" >&2
    exit 1
  fi
  version="$(curl -fsS --max-time 5 "${BASE_URL}/api/version" 2>/dev/null | sed -n 's/.*"version":"\([^"]*\)".*/\1/p' || true)"
  if [[ "$version" == "$EXPECTED" ]]; then
    streak=$(( streak + 1 ))
  else
    streak=0
    echo "  serving '${version:-unreachable}', retrying"
    sleep 5
  fi
done

check() {
  local path="$1" expect="$2" code
  code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 "${BASE_URL}${path}")"
  if [[ "$code" != "$expect" ]]; then
    echo "FAIL: GET ${path} returned ${code}, expected ${expect}" >&2
    exit 1
  fi
  echo "  ok  GET ${path} -> ${code}"
}

check /healthz 200
check /api/info 200
check / 200
check /does-not-exist 404
echo "Smoke test passed: ${BASE_URL} is serving ${EXPECTED}"
