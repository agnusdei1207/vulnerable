#!/bin/bash

# start-challenge.sh
# Isolates the vulnerable-app container to a SINGLE challenge flag and endpoint
# Usage: ./start-challenge.sh <CHALLENGE_ROUTE> [FLAG]
# Example: ./start-challenge.sh /cmdi/bronze "FLAG{CMDi_BRONZE_LOCAL_123}"

CHALLENGE_ROUTE=$1
FLAG_VALUE=$2

if [ -z "$CHALLENGE_ROUTE" ]; then
  echo "Error: Missing challenge route!"
  echo "Usage: $0 <CHALLENGE_ROUTE> [FLAG]"
  echo "Example: $0 /sqli/bronze FLAG{SQLI_BRONZE_TEST_123}"
  exit 1
fi

if [ -z "$FLAG_VALUE" ]; then
  # Auto-generate a dummy flag
  FLAG_VALUE="FLAG{$(echo $CHALLENGE_ROUTE | tr 'a-z/' 'A-Z_')_DUMMY_$(LC_ALL=C tr -dc A-Z0-9 </dev/urandom | head -c 6)}"
fi

echo "=========================================================="
echo " Starting Isolated Challenge Environment"
echo " Target Endpoint: $CHALLENGE_ROUTE"
echo " Injected Flag: $FLAG_VALUE"
echo "=========================================================="

cd $(dirname $0)/..

# Spin up a container overriding docker-compose's environment variables
docker compose run --rm \
  -e "CHALLENGE_MODE=$CHALLENGE_ROUTE" \
  -e "FLAG=$FLAG_VALUE" \
  -p 3000:3000 \
  web npm start
