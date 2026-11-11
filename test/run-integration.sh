#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
PASSWORD="${LAVALINK_PASS:-youshallnotpass}"

echo "=== Starting Lavalink container ==="
cd "$SCRIPT_DIR"
docker compose up -d

echo "=== Waiting for Lavalink to be ready ==="
for i in $(seq 1 30); do
  if curl -sf -H "Authorization: $PASSWORD" http://localhost:2333/v4/info > /dev/null 2>&1; then
    echo "Lavalink is ready!"
    break
  fi
  if [ "$i" -eq 30 ]; then
    echo "Timed out waiting for Lavalink"
    docker compose down
    exit 1
  fi
  sleep 2
done

echo "=== Running integration tests ==="
cd "$PROJECT_DIR"
LAVALINK_PASS="$PASSWORD" bun vitest run --config vitest.integration.config.ts --reporter=verbose

echo "=== Cleaning up ==="
cd "$SCRIPT_DIR"
docker compose down
