#!/usr/bin/env bash
set -euo pipefail

REMOTE_USER="${REMOTE_USER:-root}"
REMOTE_HOST="${REMOTE_HOST:-39.96.21.212}"
REMOTE_ROOT="${REMOTE_ROOT:-/www/wwwroot/simplechat}"
REMOTE_API_DIR="${REMOTE_API_DIR:-/www/wwwroot/simplechat/api-server}"
API_PROCESS_NAME="${API_PROCESS_NAME:-simplechat-api}"

echo "==> 1) build frontend"
npm run build

echo "==> 2) upload frontend dist"
scp -r dist/* "${REMOTE_USER}@${REMOTE_HOST}:${REMOTE_ROOT}/"

echo "==> 3) upload api server files"
ssh "${REMOTE_USER}@${REMOTE_HOST}" "mkdir -p '${REMOTE_ROOT}' '${REMOTE_API_DIR}'"
scp -r server package.json package-lock.json .env "${REMOTE_USER}@${REMOTE_HOST}:${REMOTE_API_DIR}/"

echo "==> 4) install dependencies and restart api process"
ssh "${REMOTE_USER}@${REMOTE_HOST}" "
  set -e
  cd '${REMOTE_API_DIR}'
  npm install --omit=dev --legacy-peer-deps
  if pm2 describe '${API_PROCESS_NAME}' >/dev/null 2>&1; then
    pm2 restart '${API_PROCESS_NAME}'
  else
    pm2 start server/index.js --name '${API_PROCESS_NAME}'
  fi
  pm2 save
"

echo "==> done"
