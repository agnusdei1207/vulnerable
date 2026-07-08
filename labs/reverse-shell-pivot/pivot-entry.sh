#!/bin/sh
set -eu

mkdir -p "$(dirname "$PIVOT_FLAG_PATH")"
printf '%s\n' "$PIVOT_FLAG" > "$PIVOT_FLAG_PATH"
chown root:root "$PIVOT_FLAG_PATH"
chmod 400 "$PIVOT_FLAG_PATH"

exec su ctfuser -s /bin/sh -c 'node /lab/pivot-relay.js'
