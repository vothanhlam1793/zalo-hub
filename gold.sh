#!/usr/bin/env bash
set -euo pipefail

NODE_DIR="/tmp/opencode/node-v22.11.0-linux-x64"
export PATH="$NODE_DIR/bin:$PATH"

exec "$NODE_DIR/bin/node" "$NODE_DIR/lib/node_modules/npm/bin/npm-cli.js" run gold:menu
