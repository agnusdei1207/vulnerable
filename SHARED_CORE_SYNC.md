# Shared Core Sync

This repository and the sibling `../vulnerable` repository must keep the same core challenge runtime.

Source of truth:

- Use `vulnerable-app/` in `RnDSecurity` as the edit point for core runtime work.
- After verifying the change locally, distribute the same files to `../vulnerable`.

Core files that must stay in sync:

- `app/boot.js`
- `app/isolated-server.js`
- `app/isolated/`
- `app/server.js`
- `app/routes/`
- `app/lib/target-*`
- `app/public/target-console.*`
- `app/Dockerfile`
- `app/package.json`
- `docker-compose.yml`
- `docker-compose-40.yml`
- `proxy/`
- `scripts/generate-isolated-compose.js`

Verification sequence:

```bash
node --check app/boot.js
node --check app/isolated-server.js
node --check app/isolated/challenges.js
docker compose -f docker-compose.yml config
```

Distribution example:

```bash
rsync -a --exclude node_modules --exclude package-lock.json --exclude .git vulnerable-app/ ../vulnerable/
```

Rule:

- Do not implement core challenge behavior in only one repository.
- If one side changes, sync the other side in the same work session.
- Blue live deployment ownership stays in `RnDSecurity/infra/deploy`; this sibling sync rule covers challenge core code, not host-specific deployment scripts.
