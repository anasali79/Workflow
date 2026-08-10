#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DATABASE_URL="${DATABASE_URL:-}"

if [[ -z "$DATABASE_URL" ]]; then
  echo "ERROR: DATABASE_URL is required (Nhost Postgres connection string)." >&2
  exit 1
fi

if ! command -v psql >/dev/null 2>&1; then
  echo "ERROR: psql is required to apply migrations." >&2
  exit 1
fi

echo "Applying database/migrations in order..."
for file in \
  "$ROOT_DIR/database/migrations/001_initial_schema.sql" \
  "$ROOT_DIR/database/migrations/002_views_and_functions.sql"
do
  echo " -> $(basename "$file")"
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$file"
done

echo "Verifying schema..."
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$ROOT_DIR/database/scripts/verify_schema.sql"

echo "Done."
