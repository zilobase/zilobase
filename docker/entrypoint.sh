#!/usr/bin/env sh
set -eu

require_env() {
  key="$1"
  value="$(printenv "$key" || true)"

  if [ -z "$value" ]; then
    echo "Missing required environment variable: $key" >&2
    exit 1
  fi
}

require_env DATABASE_URL
require_env BETTER_AUTH_SECRET
require_env ZILOBASE_BOOTSTRAP_TOKEN
require_env BETTER_AUTH_URL
require_env CLIENT_URL
require_env IMAGE_STORAGE_MODE
require_env S3_ENDPOINT
require_env S3_PUBLIC_ENDPOINT
require_env S3_BUCKET_NAME
require_env S3_ACCESS_KEY_ID
require_env S3_SECRET_ACCESS_KEY

echo "Starting Zilobase self-host runtime"
node dist/server/migrate.js

exec "$@"
