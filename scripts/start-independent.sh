#!/bin/bash
# start-independent.sh
# Start a specific challenge service using the 151 independent configurations

TARGET=$1

if [ -z "$TARGET" ]; then
  echo "Usage: ./start-independent.sh <service_name>"
  echo "Available services can be seen in docker-compose-151.yml"
  echo "Example: ./start-independent.sh sqli-bronze"
  exit 1
fi

echo "Spinning up independent service: $TARGET..."
docker compose -f docker-compose-151.yml up -d "$TARGET"
echo "Service is running in isolated mode!"
