#!/usr/bin/env bash
# Apply pending migrations to the remote D1 database.
#
#   ./scripts/migrate.sh [database-name]
#
# Migrations are recorded in the `migrations` table, so running this twice is
# safe. One statement per wrangler call: wrangler silently ignores multiple
# semicolon-separated statements in --command.
set -euo pipefail

cd "$(dirname "$0")/.."
export ESBUILD_BINARY_PATH="$PWD/node_modules/esbuild/bin/esbuild"
W=./node_modules/.bin/wrangler
DB="${1:-skip7figures}"

if [ ! -x "$W" ]; then
  echo "wrangler not found - run: npm install --ignore-scripts" >&2
  exit 1
fi

applied_count=0
for f in migrations/*.sql; do
  name=$(basename "$f" .sql)
  already=$($W d1 execute "$DB" --remote --command "SELECT COUNT(*) AS c FROM migrations WHERE name='$name'" 2>/dev/null \
    | grep -oE '"c":[[:space:]]*[0-9]+' | grep -oE '[0-9]+' | head -1 || true)
  if [ "${already:-0}" != "0" ]; then
    echo "  skip  $name (already applied)"
    continue
  fi
  echo "  apply $name"
  $W d1 execute "$DB" --remote --file="$f" >/dev/null
  $W d1 execute "$DB" --remote --command "INSERT OR REPLACE INTO migrations(name) VALUES ('$name')" >/dev/null
  applied_count=$((applied_count + 1))
done

echo "done - $applied_count migration(s) applied to $DB"
