#!/usr/bin/env bash
set -euo pipefail

PORT=8123
python3 -m http.server "$PORT" --bind 127.0.0.1 >/tmp/nubo-sense-http.log 2>&1 &
SERVER_PID=$!
cleanup() {
  kill "$SERVER_PID" >/dev/null 2>&1 || true
}
trap cleanup EXIT
sleep 1

CHROME=""
for candidate in google-chrome-stable google-chrome chromium chromium-browser; do
  if command -v "$candidate" >/dev/null 2>&1; then
    CHROME="$(command -v "$candidate")"
    break
  fi
done

if [[ -z "$CHROME" ]]; then
  echo "No Chrome/Chromium binary available for Web Sense runtime smoke" >&2
  exit 1
fi

set +e
OUTPUT="$($CHROME \
  --headless=new \
  --no-sandbox \
  --disable-gpu \
  --disable-dev-shm-usage \
  --virtual-time-budget=22000 \
  --dump-dom \
  "http://127.0.0.1:${PORT}/scripts/web-sense-smoke.html" 2>&1)"
STATUS=$?
set -e

echo "$OUTPUT"
if [[ $STATUS -ne 0 ]]; then
  echo "Chrome exited with status $STATUS" >&2
  exit $STATUS
fi

if ! grep -q 'data-sense-status="ready"' <<<"$OUTPUT"; then
  echo "Web Sense worker did not reach READY in headless Chrome" >&2
  exit 1
fi

echo "Web Sense worker runtime smoke: READY"
