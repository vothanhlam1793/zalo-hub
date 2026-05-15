#!/bin/bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
BACKEND_DIR="$ROOT_DIR/backend"
FRONTEND_DIR="$ROOT_DIR/frontend"
STATE_FILE="$ROOT_DIR/.deploy-state"
FRONTEND_ARCHIVE="/tmp/zalohub-frontend-dist.tgz"
REMOTE_HOST="root@svr12.creta.vn"
REMOTE_FRONTEND_DIR="/var/www/zalohub-frontend"
LOCAL_STATUS_URL="http://127.0.0.1:3399/api/status"
UPSTREAM_STATUS_URL="http://10.7.0.21:3399/api/status"
PUBLIC_STATUS_URL="https://zalo.camerangochoang.com/api/status"

DEPLOY_BACKEND=0
DEPLOY_FRONTEND=0
VERIFY_AFTER=1
AUTO_MODE=1
AUTO_MODE_EXPLICIT=0
FORCED_MODE=0

red() { printf '\033[31m%s\033[0m\n' "$*"; }
green() { printf '\033[32m%s\033[0m\n' "$*"; }
yellow() { printf '\033[33m%s\033[0m\n' "$*"; }
blue() { printf '\033[34m%s\033[0m\n' "$*"; }

confirm() {
  local prompt="$1"
  local default="$2"
  local answer=""
  read -r -p "$prompt" answer || true
  answer="${answer:-$default}"
  case "$answer" in
    y|Y|yes|YES) return 0 ;;
    n|N|no|NO) return 1 ;;
    *)
      if [[ "$default" =~ ^[Yy]$ ]]; then
        return 0
      fi
      return 1
      ;;
  esac
}

usage() {
  cat <<'EOF'
Usage: ./deploy.sh [--backend] [--frontend] [--all] [--auto] [--manual] [--no-verify]

Without flags, the script asks:
1. Auto-detect deploy mode from git diff, or manual mode
2. In manual mode: backend [y/N], frontend [Y/n]
3. Verify after deploy [Y/n]
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --backend)
      DEPLOY_BACKEND=1
      FORCED_MODE=1
      ;;
    --frontend)
      DEPLOY_FRONTEND=1
      FORCED_MODE=1
      ;;
    --all)
      DEPLOY_BACKEND=1
      DEPLOY_FRONTEND=1
      FORCED_MODE=1
      ;;
    --auto)
      AUTO_MODE=1
      AUTO_MODE_EXPLICIT=1
      ;;
    --manual)
      AUTO_MODE=0
      AUTO_MODE_EXPLICIT=1
      ;;
    --no-verify)
      VERIFY_AFTER=0
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      red "Unknown argument: $1"
      usage
      exit 1
      ;;
  esac
  shift
done

cd "$ROOT_DIR"

if [[ $FORCED_MODE -eq 0 && $AUTO_MODE_EXPLICIT -eq 0 ]]; then
  blue "Deploy mode:"
  printf '  1. Tu dong (dua tren git diff)\n'
  printf '  2. Thu cong (tu chon)\n'
  read -r -p 'Chon [1]: ' mode_answer || true
  mode_answer="${mode_answer:-1}"
  case "$mode_answer" in
    1)
      AUTO_MODE=1
      ;;
    2)
      AUTO_MODE=0
      ;;
    *)
      yellow "Lua chon khong hop le, dung mac dinh: Tu dong"
      AUTO_MODE=1
      ;;
  esac
fi

if [[ $FORCED_MODE -eq 0 && $AUTO_MODE -eq 1 ]]; then
  if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    red "Current directory is not a git repository."
    exit 1
  fi

  HEAD_COMMIT="$(git rev-parse HEAD)"
  LAST_DEPLOY_COMMIT=""
  if [[ -f "$STATE_FILE" ]]; then
    LAST_DEPLOY_COMMIT="$(tr -d '[:space:]' < "$STATE_FILE")"
  fi

  if [[ -n "$LAST_DEPLOY_COMMIT" ]] && ! git rev-parse --verify "$LAST_DEPLOY_COMMIT^{commit}" >/dev/null 2>&1; then
    yellow "Ignoring invalid .deploy-state commit: $LAST_DEPLOY_COMMIT"
    LAST_DEPLOY_COMMIT=""
  fi

  if [[ -n "$LAST_DEPLOY_COMMIT" ]]; then
    mapfile -t CHANGED_FILES < <(git diff --name-only "$LAST_DEPLOY_COMMIT" HEAD)
  else
    mapfile -t CHANGED_FILES < <(git diff --name-only HEAD~1 HEAD 2>/dev/null || true)
  fi

  mapfile -t WORKTREE_CHANGED_FILES < <(git diff --name-only)
  mapfile -t UNTRACKED_FILES < <(git ls-files --others --exclude-standard)

  if [[ ${#WORKTREE_CHANGED_FILES[@]} -gt 0 || ${#UNTRACKED_FILES[@]} -gt 0 ]]; then
    mapfile -t CHANGED_FILES < <(
      printf '%s\n' "${CHANGED_FILES[@]}" "${WORKTREE_CHANGED_FILES[@]}" "${UNTRACKED_FILES[@]}" \
      | awk 'NF && !seen[$0]++'
    )
  fi

  if [[ ${#CHANGED_FILES[@]} -eq 0 ]]; then
    green "No changes since last deploy. Nothing to do."
    exit 0
  fi

  for changed_file in "${CHANGED_FILES[@]}"; do
    [[ -z "$changed_file" ]] && continue
    case "$changed_file" in
      backend/src/*|backend/package.json|backend/package-lock.json|backend/tsconfig.json|backend/knexfile.js|backend/knexfile.ts|backend/start-server.sh|backend/src/admin/*)
        DEPLOY_BACKEND=1
        ;;
      frontend/src/*|frontend/package.json|frontend/package-lock.json|frontend/tsconfig.json|frontend/vite.config.*|frontend/index.html|frontend/public/*)
        DEPLOY_FRONTEND=1
        ;;
    esac
  done

  blue "Detected changes:"
  printf '  %s\n' "${CHANGED_FILES[@]}"

  if [[ $DEPLOY_BACKEND -eq 1 && $DEPLOY_FRONTEND -eq 1 ]]; then
    yellow "Will deploy: BACKEND + FRONTEND"
  elif [[ $DEPLOY_BACKEND -eq 1 ]]; then
    yellow "Will deploy: BACKEND only"
  elif [[ $DEPLOY_FRONTEND -eq 1 ]]; then
    yellow "Will deploy: FRONTEND only"
  else
    yellow "Changes detected, but none match backend/frontend deploy rules."
    if confirm "Deploy FRONTEND anyway? [Y/n]: " "Y"; then
      DEPLOY_FRONTEND=1
    fi
    if confirm "Deploy BACKEND anyway? [y/N]: " "N"; then
      DEPLOY_BACKEND=1
    fi
  fi

  if [[ $DEPLOY_BACKEND -eq 0 && $DEPLOY_FRONTEND -eq 0 ]]; then
    green "Nothing selected for deploy."
    exit 0
  fi

  if ! confirm "Proceed? [Y/n]: " "Y"; then
    yellow "Cancelled."
    exit 0
  fi
fi

if [[ $FORCED_MODE -eq 0 && $AUTO_MODE -eq 0 ]]; then
  if confirm "Deploy BACKEND? (build + restart) [y/N]: " "N"; then
    DEPLOY_BACKEND=1
  fi
  if confirm "Deploy FRONTEND? (build + push len svr12) [Y/n]: " "Y"; then
    DEPLOY_FRONTEND=1
  fi
fi

if [[ $DEPLOY_BACKEND -eq 0 && $DEPLOY_FRONTEND -eq 0 ]]; then
  green "Nothing selected for deploy."
  exit 0
fi

if [[ $FORCED_MODE -eq 0 ]]; then
  if confirm "Verify after deploy? [Y/n]: " "Y"; then
    VERIFY_AFTER=1
  else
    VERIFY_AFTER=0
  fi
fi

deploy_frontend() {
  blue "[frontend] Building frontend"
  npm run build --prefix "$FRONTEND_DIR"

  blue "[frontend] Packaging dist"
  tar -C "$FRONTEND_DIR" -czf "$FRONTEND_ARCHIVE" dist

  blue "[frontend] Uploading archive to $REMOTE_HOST"
  scp -o StrictHostKeyChecking=accept-new "$FRONTEND_ARCHIVE" "$REMOTE_HOST:/tmp/zalohub-frontend-dist.tgz"

  blue "[frontend] Replacing remote dist"
  ssh "$REMOTE_HOST" "set -e; mkdir -p '$REMOTE_FRONTEND_DIR'; rm -rf '$REMOTE_FRONTEND_DIR/dist.bak'; if [ -d '$REMOTE_FRONTEND_DIR/dist' ]; then mv '$REMOTE_FRONTEND_DIR/dist' '$REMOTE_FRONTEND_DIR/dist.bak'; fi; if ! tar -xzf /tmp/zalohub-frontend-dist.tgz -C '$REMOTE_FRONTEND_DIR'; then rm -rf '$REMOTE_FRONTEND_DIR/dist'; if [ -d '$REMOTE_FRONTEND_DIR/dist.bak' ]; then mv '$REMOTE_FRONTEND_DIR/dist.bak' '$REMOTE_FRONTEND_DIR/dist'; fi; exit 1; fi; test -f '$REMOTE_FRONTEND_DIR/dist/index.html'"
}

deploy_backend() {
  blue "[backend] Building backend"
  npm run build --prefix "$BACKEND_DIR"

  blue "[backend] Restarting backend"
  local pid
  pid="$(ss -ltnp 2>/dev/null | awk '/:3399 / { if (match($0, /pid=([0-9]+)/, a)) { print a[1]; exit } }')"
  if [[ -n "$pid" ]]; then
    kill "$pid"
    sleep 2
  fi

  nohup ./start-server.sh > /tmp/zalohub-backend-prod.log 2>&1 & disown

  blue "[backend] Waiting for :3399"
  for _ in $(seq 1 20); do
    if curl -fsS "$LOCAL_STATUS_URL" >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
  done

  red "Backend did not become ready on :3399 within 20 seconds."
  red "Check log: /tmp/zalohub-backend-prod.log"
  exit 1
}

verify_all() {
  blue '[verify] Local backend status'
  curl -fsS "$LOCAL_STATUS_URL"
  printf '\n'

  blue '[verify] Upstream status from svr12'
  ssh "$REMOTE_HOST" "curl -fsS '$UPSTREAM_STATUS_URL'"
  printf '\n'

  blue '[verify] Public status from svr12'
  ssh "$REMOTE_HOST" "curl -fsS '$PUBLIC_STATUS_URL'"
  printf '\n'
}

if [[ $DEPLOY_FRONTEND -eq 1 ]]; then
  deploy_frontend
  green "[frontend] Deploy complete"
fi

if [[ $DEPLOY_BACKEND -eq 1 ]]; then
  (
    cd "$BACKEND_DIR"
    deploy_backend
  )
  green "[backend] Deploy complete"
fi

if [[ $VERIFY_AFTER -eq 1 ]]; then
  verify_all
  green "Verify passed"
fi

if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  git rev-parse HEAD > "$STATE_FILE"
fi

green "Deploy finished successfully."
