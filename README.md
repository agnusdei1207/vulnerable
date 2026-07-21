# LUXORA - k3s Pentesting Benchmark

> WARNING: This repository intentionally contains exploitable services for CTF and benchmark use. Do not deploy it as a normal public application.

## Overview

LUXORA is a deliberately vulnerable benchmark made of **20 curated HTB-style Medium/Hard services** running on **k3s**. The supported deployment model is k3s, and the older compose/socket-router stack has been removed from the active path.

- 20 selected challenges
- 14 Medium, 6 Hard
- weighted total: 100 points
- 1 benchmark gateway host
- 20 path-routed challenge entries on the same host
- 5 internal-only hard relay services

Generated flags include the challenge, layer, core technique, HTB difficulty, and score:

- `FLAG{SSTI_INJECTION_TEMPLATE_RCE_HTB_MEDIUM_4PTS_<ID>}`
- `FLAG{CHAIN_ADVANCED_MULTISTAGE_INTERNAL_PIVOT_HTB_HARD_10PTS_<ID>}`

## Current Shape

The active deployment model is:

- `k3s` namespace: `luxora`
- one `web` Deployment/Service for the benchmark landing page and path-based routing
- 20 challenge Deployments/Services
- 5 internal relay Deployments/Services for `pivot`, `chain`, `webshell`, `persist`, `container`
- Traefik Ingress objects for:
  - `<base-domain>/`
  - `<base-domain>/<challenge>/silver` per challenge

The default base domain is `agnusdei.kr`, so the generated entrypoints are:

- `agnusdei.kr/`
- `agnusdei.kr/rbac/silver`
- `agnusdei.kr/reverse/silver`
- `agnusdei.kr/container/silver`

## Selected Challenges

| HTB difficulty | Challenge       | Core technique                  | Points |
| -------------- | --------------- | ------------------------------- | -----: |
| Medium         | `rbac`          | Role bypass                     |      3 |
| Medium         | `mfa`           | Rate-limit bypass               |      3 |
| Medium         | `oauth`         | Redirect URI bypass             |      3 |
| Medium         | `csrf`          | Token bypass                    |      3 |
| Medium         | `postmsg`       | Origin bypass                   |      3 |
| Medium         | `deser`         | Object injection                |      4 |
| Medium         | `upload`        | Upload-filter bypass            |      3 |
| Medium         | `xxe`           | External entity                 |      4 |
| Medium         | `ssti`          | Template RCE                    |      4 |
| Medium         | `payment`       | Payment-logic bypass            |      3 |
| Medium         | `proto_pollute` | Prototype pollution             |      4 |
| Medium         | `race`          | Race condition                  |      4 |
| Medium         | `jwt`           | JWT forgery                     |      4 |
| Medium         | `ssrf`          | Internal fetch                  |      4 |
| Hard           | `reverse`       | Reverse shell + local privesc   |      7 |
| Hard           | `pivot`         | Reverse shell + privesc + relay |      9 |
| Hard           | `chain`         | Multistage internal pivot       |     10 |
| Hard           | `webshell`      | Webshell + privesc + pivot      |      8 |
| Hard           | `persist`       | Persistence + privesc + pivot   |      8 |
| Hard           | `container`     | Container escape + pivot        |      9 |
| **Total**      | **20**          |                                 | **100** |

All six Hard scenarios require a real reverse shell and local privilege escalation. The five scenarios `pivot`, `chain`, `webshell`, `persist`, and `container` additionally require an internal-only relay pivot to read the final flag.

## Deployment

The supported deployment flow is:

```bash
npm run generate
npm run deploy
```

`npm run deploy` does the following:

- installs `k3s` if it is missing
- ensures the `k3s` server is running
- builds `luxora-challenge-base:latest` and `luxora-web:latest`
- imports those images into the local `k3s` containerd
- applies `k8s/luxora-benchmark.yaml`
- restarts Deployments so the imported images are used
- waits for all Deployments in namespace `luxora`

To change the ingress base domain, regenerate and deploy with:

```bash
LUXORA_BASE_DOMAIN=lab.example.com npm run generate
LUXORA_BASE_DOMAIN=lab.example.com npm run deploy
```

To stamp a Kubernetes `runtimeClassName` onto all challenge and relay Pods during generation, set `LUXORA_RUNTIME_CLASS`:

```bash
LUXORA_RUNTIME_CLASS=kata LUXORA_BASE_DOMAIN=lab.example.com npm run generate
LUXORA_RUNTIME_CLASS=kata LUXORA_BASE_DOMAIN=lab.example.com npm run deploy
```

The `web` landing page stays on the default runtime. Only the 20 challenge Pods and 5 relay Pods receive the configured `runtimeClassName`.

## k3s Quick Start for First-Time Users

If you have not used k3s before, use this flow:

1. Deploy once:

   ```bash
   npm run deploy
   ```

   This repository installs k3s automatically if it is missing.

2. Point `kubectl` at the k3s kubeconfig:

   ```bash
   export KUBECONFIG=/etc/rancher/k3s/k3s.yaml
   ```

3. Check the cluster itself:

   ```bash
   kubectl get nodes -o wide
   kubectl get pods -n kube-system
   ```

4. Check this benchmark:

   ```bash
   kubectl get all -n luxora
   kubectl get ingress -n luxora
   ```

5. Read logs from a challenge:

   ```bash
   kubectl logs -n luxora deploy/reverse-silver
   kubectl logs -n luxora deploy/pivot-silver
   ```

6. Restart one service after a code change:

   ```bash
   kubectl rollout restart deployment/reverse-silver -n luxora
   kubectl rollout status deployment/reverse-silver -n luxora
   ```

7. Remove the benchmark namespace only:

   ```bash
   kubectl delete namespace luxora
   ```

8. Check the k3s daemon if the cluster does not come up:

   ```bash
   systemctl status k3s
   journalctl -u k3s -n 100 --no-pager
   ```

Important:

- The default base domain is `agnusdei.kr`.
- If you want to access the lab from another machine, set `LUXORA_BASE_DOMAIN` to a real DNS name or an IP-backed sslip domain such as `<server-public-ip>.sslip.io`, then redeploy.
- The challenge ingress paths are generated from that base domain.

## Kata Runtime Readiness

If you want stronger VM-style isolation while still keeping Kubernetes, this repository can target a Kubernetes `RuntimeClass` such as `kata`.

Preflight the current node before you spend time installing Kata:

```bash
npm run check:kata-host
```

That check verifies:

- CPU virtualization flags (`vmx` or `svm`)
- `/dev/kvm`
- `/dev/vhost-vsock`
- whether a `kata` RuntimeClass already exists
- whether the k3s-managed containerd config already has a kata handler

If the node is itself a VM, you also need nested virtualization from the provider. Without that, Kata will not boot guest VMs for pods even if you install the userspace bits.

## Access Model

There is one public access pattern:

1. Single benchmark host with path-based challenge routing
   - `http://agnusdei.kr/`
   - `http://agnusdei.kr/reverse/silver`
   - `http://agnusdei.kr/rbac/silver`

The root page shows the full challenge list. Each selected service is exposed under its own path prefix. Browser-side cookies and storage are cleared when moving between challenge routes on the shared host to reduce state bleed between problems.

If host port `80` is not available locally, you can still reach Traefik with any free local port:

```bash
kubectl -n kube-system port-forward svc/traefik 19000:80
```

The regression scripts already choose a free fallback port automatically.

## Verification

Static manifest verification:

```bash
npm run verify
```

This checks:

- generated `k8s/luxora-benchmark.yaml` is in sync
- proxy assets are in sync
- 20 challenge Deployments and 20 weighted flags exist
- 26 total Deployments/Services exist (`web` + 20 challenges + 5 relays)
- ingress host rules exist for the shared benchmark host and challenge path routes
- weighted total remains 100

Exploit-chain regression verification:

```bash
npm run check
```

This performs:

- all 14 Medium challenges through the shared ingress host and challenge path routes
- flag string, HTB difficulty/points metadata, and `evidence.vector` validation per Medium scenario
- `reverse` hard chain validation on k3s
- real reverse shell callback
- local privilege escalation validation
- `pivot`, `chain`, `webshell`, `persist`, `container` relay-chain validation

## Local Single-Challenge Run

To run one challenge outside k3s:

```bash
./scripts/start-challenge.sh /ssti/silver
```

That builds the app image locally and runs only the selected challenge on `http://localhost:3000`.

## Repo Layout

- `k8s/luxora-benchmark.yaml`
  Generated Kubernetes manifest for the benchmark
- `scripts/benchmark-config.js`
  Source of truth for the selected 20 challenges, scores, hosts, and flags
- `scripts/generate-k8s-manifests.js`
  Generates Kubernetes and proxy assets
- `scripts/deploy-k3s.sh`
  Installs/deploys the benchmark to local k3s
- `scripts/check-reverse-k8s.js`
  Reverse-shell and privesc regression
- `scripts/check-medium-k8s.js`
  Medium challenge exploit regression across the shared host path routes
- `scripts/check-hard-pivots-k8s.js`
  Internal relay pivot regressions

## Notes

- The benchmark is maintained against the k3s manifest and ingress path only.
- Challenge services still expose only their own selected route family and flag material.
- Relay services are internal-only ClusterIP services and are not exposed through ingress.
