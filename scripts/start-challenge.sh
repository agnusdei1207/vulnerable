#!/bin/bash

set -euo pipefail

# start-challenge.sh
# Runs a single challenge locally from the app image without k3s.
# Usage: ./start-challenge.sh <CHALLENGE_ROUTE> [FLAG]
# Example: ./start-challenge.sh /ssti/silver "FLAG{SSTI_SILVER_LOCAL_123}"

CHALLENGE_ROUTE="${1:-}"
FLAG_VALUE="${2:-}"
HOST_PORT="${HOST_PORT:-3000}"
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

if [ -z "$CHALLENGE_ROUTE" ]; then
  echo "Error: Missing challenge route!"
  echo "Usage: $0 <CHALLENGE_ROUTE> [FLAG]"
  echo "Example: $0 /ssti/silver FLAG{SSTI_SILVER_TEST_123}"
  exit 1
fi

if [[ ! "$CHALLENGE_ROUTE" =~ ^/[a-z-]+/silver$ ]]; then
  echo "Error: challenge route must look like /ssti/silver"
  exit 1
fi

if [ -z "$FLAG_VALUE" ]; then
  # Auto-generate a dummy flag
  FLAG_VALUE="FLAG{$(echo "$CHALLENGE_ROUTE" | tr 'a-z/-' 'A-Z__')_LOCAL_$(LC_ALL=C tr -dc A-Z0-9 </dev/urandom | head -c 6)}"
fi

echo "=========================================================="
echo " Starting Isolated Challenge Environment"
echo " Target Endpoint: $CHALLENGE_ROUTE"
echo " Image: luxora-challenge-base:latest"
echo " Injected Flag: $FLAG_VALUE"
echo " Local URL: http://localhost:$HOST_PORT$CHALLENGE_ROUTE"
echo "=========================================================="

cd "$REPO_ROOT"

# Build a fresh local app image, then run only the selected challenge.
docker build -t luxora-challenge-base:latest ./app >/dev/null

docker run --rm \
  -p "$HOST_PORT:3000" \
  -e "CHALLENGE_MODE=$CHALLENGE_ROUTE" \
  -e "FLAG=$FLAG_VALUE" \
  -e "PORT=3000" \
  -e "PUBLIC_ROOT_ALIAS=0" \
  luxora-challenge-base:latest
