#!/bin/zsh

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
RUN_DIR="$ROOT_DIR/.run"

CHAT_PID_FILE="$RUN_DIR/chat-server.pid"
ZALO_PID_FILE="$RUN_DIR/zalo-service.pid"

stop_service() {
  local name="$1"
  local pid_file="$2"

  if [[ ! -f "$pid_file" ]]; then
    printf "%s khong co PID file\n" "$name"
    return 0
  fi

  local pid
  pid="$(<"$pid_file")"

  if [[ -z "$pid" ]]; then
    rm -f "$pid_file"
    printf "%s co PID file rong, da xoa\n" "$name"
    return 0
  fi

  if kill -0 "$pid" 2>/dev/null; then
    kill "$pid"
    printf "Dang stop %s (PID %s)\n" "$name" "$pid"

    for _ in {1..20}; do
      if ! kill -0 "$pid" 2>/dev/null; then
        break
      fi
      sleep 0.25
    done

    if kill -0 "$pid" 2>/dev/null; then
      kill -9 "$pid" 2>/dev/null || true
      printf "%s khong tu thoat, da force kill\n" "$name"
    fi
  else
    printf "%s PID %s khong con chay\n" "$name" "$pid"
  fi

  rm -f "$pid_file"
}

stop_service "chat-server" "$CHAT_PID_FILE"
stop_service "zalo-service" "$ZALO_PID_FILE"
