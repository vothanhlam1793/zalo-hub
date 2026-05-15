#!/bin/bash
export DATABASE_URL="postgresql://zalohub:zalohub@localhost:5433/zalohub"
export MINIO_ENDPOINT=localhost
export MINIO_PORT=9000
export MINIO_ACCESS_KEY=zalohub
export MINIO_SECRET_KEY=zalohub-minio-secret
export MINIO_BUCKET=zalohub-media
export JWT_SECRET=zalohub-prod-jwt-secret-2026
export PATH=/tmp/opencode/node-v22.15.0-linux-x64/bin:/tmp/opencode/node-v22.15.0-linux-x64/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:/usr/games:/usr/local/games:/snap/bin
exec node dist/server/index.js
