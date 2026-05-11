#!/bin/zsh

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
RUN_DIR="$ROOT_DIR/.run"
LOG_DIR="$RUN_DIR/logs"

CHAT_PID_FILE="$RUN_DIR/chat-server.pid"
ZALO_PID_FILE="$RUN_DIR/zalo-service.pid"

CHAT_LOG_FILE="$LOG_DIR/chat-server.log"
ZALO_LOG_FILE="$LOG_DIR/zalo-service.log"

mkdir -p "$RUN_DIR" "$LOG_DIR"

is_running() {
  local pid_file="$1"
  if [[ ! -f "$pid_file" ]]; then
    return 1
  fi

  local pid
  pid="$(<"$pid_file")"
  if [[ -z "$pid" ]]; then
    return 1
  fi

  if kill -0 "$pid" 2>/dev/null; then
    return 0
  fi

  rm -f "$pid_file"
  return 1
}

start_service() {
  local name="$1"
  local command="$2"
  local pid_file="$3"
  local log_file="$4"

  if is_running "$pid_file"; then
    printf "%s da dang chay voi PID %s\n" "$name" "$(<"$pid_file")"
    return 0
  fi

  nohup zsh -lc "$command" >> "$log_file" 2>&1 &
  local pid=$!
  printf "%s" "$pid" > "$pid_file"
  printf "Da start %s voi PID %s\n" "$name" "$pid"
}

printf "Building project...\n"
npm run build

mkdir -p "$ROOT_DIR/dist/chat-server/client"
cp "$ROOT_DIR/src/chat-server/client/index.html" "$ROOT_DIR/dist/chat-server/client/index.html"
cp "$ROOT_DIR/src/chat-server/client/styles.css" "$ROOT_DIR/dist/chat-server/client/styles.css"
cp "$ROOT_DIR/src/chat-server/client/app.js" "$ROOT_DIR/dist/chat-server/client/app.js"

start_service "zalo-service" "node dist/zalo-service/index.js" "$ZALO_PID_FILE" "$ZALO_LOG_FILE"
start_service "chat-server" "node dist/chat-server/index.js" "$CHAT_PID_FILE" "$CHAT_LOG_FILE"

printf "\n"
printf "chat-server: http://localhost:3199\n"
printf "zalo-service: http://localhost:3299\n"
printf "Logs: %s\n" "$LOG_DIR"
