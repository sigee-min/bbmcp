#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
DEPS_IMAGE="${ASHFOX_WORKSPACE_DEPS_IMAGE:-ashfox/workspace-deps:local}"

echo "[ashfox] building workspace deps image: ${DEPS_IMAGE}"
docker build \
  -f "${ROOT_DIR}/docker/Dockerfile.workspace-deps" \
  -t "${DEPS_IMAGE}" \
  "${ROOT_DIR}"

echo "[ashfox] done: ${DEPS_IMAGE}"
