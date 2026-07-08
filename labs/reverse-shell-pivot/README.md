# Reverse Shell Pivot Lab

Minimal standalone lab for exercising:

- reverse engineering of a client-side verifier
- real command execution to reverse shell
- shell-listener/session-control driven PTY upgrade
- internal-only pivot to a second host
- multi-session tracking and privilege escalation on both hosts

Entry point: `http://127.0.0.1:4706/`

Quick check:

```bash
node check.js
```
