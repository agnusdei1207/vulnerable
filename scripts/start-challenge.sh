#!/bin/bash

set -euo pipefail

# start-challenge.sh
# Runs a SINGLE silver challenge locally using the current isolated app image
# Usage: ./start-challenge.sh <CHALLENGE_ROUTE> [FLAG]
# Example: ./start-challenge.sh /cmdi/silver "FLAG{CMDI_SILVER_LOCAL_123}"

CHALLENGE_ROUTE="${1:-}"
FLAG_VALUE="${2:-}"
HOST_PORT="${HOST_PORT:-3000}"
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

if [ -z "$CHALLENGE_ROUTE" ]; then
  echo "Error: Missing challenge route!"
  echo "Usage: $0 <CHALLENGE_ROUTE> [FLAG]"
  echo "Example: $0 /sqli/silver FLAG{SQLI_SILVER_TEST_123}"
  exit 1
fi

if [[ ! "$CHALLENGE_ROUTE" =~ ^/[a-z-]+/silver$ ]]; then
  echo "Error: challenge route must look like /cmdi/silver"
  exit 1
fi

SERVICE_NAME="$(node -e 'const { serviceName } = require(process.argv[1]); const route = process.argv[2]; const slug = route.replace(/^\//, "").split("/")[0]; process.stdout.write(serviceName(slug));' "$REPO_ROOT/scripts/generate-isolated-compose.js" "$CHALLENGE_ROUTE")"

if [ -z "$FLAG_VALUE" ]; then
  # Auto-generate a dummy flag
  FLAG_VALUE="FLAG{$(echo "$CHALLENGE_ROUTE" | tr 'a-z/-' 'A-Z__')_LOCAL_$(LC_ALL=C tr -dc A-Z0-9 </dev/urandom | head -c 6)}"
fi

echo "=========================================================="
echo " Starting Isolated Challenge Environment"
echo " Target Endpoint: $CHALLENGE_ROUTE"
echo " Target Service: $SERVICE_NAME"
echo " Injected Flag: $FLAG_VALUE"
echo " Local URL: http://localhost:$HOST_PORT$CHALLENGE_ROUTE"
echo "=========================================================="

cd "$REPO_ROOT"

# Ensure the shared database is available for DB-backed scenarios
docker compose up -d postgres >/dev/null

# Run the selected silver service with a local TCP port instead of the compose socket path
docker compose run --rm \
  --no-deps \
  -p "$HOST_PORT:3000" \
  -e "CHALLENGE_MODE=$CHALLENGE_ROUTE" \
  -e "FLAG=$FLAG_VALUE" \
  -e "PORT=3000" \
  -e "SOCKET_PATH=" \
  "$SERVICE_NAME"
