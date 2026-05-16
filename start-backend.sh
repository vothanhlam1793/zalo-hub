#!/bin/bash
set -o pipefail

cd "$(dirname "$0")/backend" || exit 1

export NODE_ENV=production
export DATABASE_URL='postgresql://zalohub:zalohub@localhost:5433/zalohub'
export MINIO_ENDPOINT=localhost
export MINIO_PORT=9000
export MINIO_ACCESS_KEY=zalohub
export MINIO_SECRET_KEY='zalohub-minio-secret'
export MINIO_BUCKET=zalohub-media
export JWT_SECRET='zalohub-prod-jwt-secret-2026'

exec node dist/server/index.js
