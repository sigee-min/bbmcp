#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ENV_FILE="${ROOT_DIR}/deploy/.env"

if [[ ! -f "${ENV_FILE}" ]]; then
  cp "${ROOT_DIR}/deploy/.env.example" "${ENV_FILE}"
  echo "[ashfox] created ${ENV_FILE} from .env.example"
fi

"${ROOT_DIR}/scripts/docker/build-workspace-deps.sh"

echo "[ashfox] starting compose (local source build override)"
docker compose \
  -f "${ROOT_DIR}/deploy/docker-compose.yml" \
  -f "${ROOT_DIR}/deploy/docker-compose.build.yml" \
  --env-file "${ENV_FILE}" \
  up -d --build
