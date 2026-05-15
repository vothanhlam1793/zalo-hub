#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

PID_FILE="$SCRIPT_DIR/.server.pid"

if [ -f "$PID_FILE" ] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
  echo "Backend da dang chay (PID $(cat "$PID_FILE"))"
  exit 0
fi

echo "Khoi dong PostgreSQL + MinIO..."
docker compose up -d postgres minio 2>/dev/null || true

echo "Khoi dong backend..."
nohup npx tsx src/server/index.ts > /tmp/zalohub-backend.log 2>&1 &
echo $! > "$PID_FILE"
echo "Backend started (PID $!) → http://localhost:3399"
