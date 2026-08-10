#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR/hasura"

if ! command -v hasura >/dev/null 2>&1; then
  echo "ERROR: Hasura CLI required. Install: https://hasura.io/docs/latest/hasura-cli/install-hasura-cli/" >&2
  exit 1
fi

ENDPOINT="${HASURA_GRAPHQL_ENDPOINT:-http://localhost:8080}"
ADMIN_SECRET="${HASURA_GRAPHQL_ADMIN_SECRET:-}"

ARGS=(--endpoint "$ENDPOINT")
if [[ -n "$ADMIN_SECRET" ]]; then
  ARGS+=(--admin-secret "$ADMIN_SECRET")
fi

echo "Applying Hasura migrations..."
hasura migrate apply --database-name default "${ARGS[@]}"

echo "Applying Hasura metadata..."
hasura metadata apply "${ARGS[@]}"

echo "Reloading metadata..."
hasura metadata reload "${ARGS[@]}"

echo "Done."
