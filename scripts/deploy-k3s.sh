#!/bin/bash

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BASE_DOMAIN="${LUXORA_BASE_DOMAIN:-agnusdei.kr}"
NAMESPACE="luxora"

callback_host_hint() {
  ip -4 -o addr show cni0 2>/dev/null | awk '{print $4}' | cut -d/ -f1
}

cleanup_legacy_docker_runtime() {
  if ! command -v docker >/dev/null 2>&1; then
    return 0
  fi

  mapfile -t legacy_containers < <(docker ps -aq --filter name='^/vulnerable-')
  if [ "${#legacy_containers[@]}" -gt 0 ]; then
    echo "[deploy-k3s] removing legacy compose-era containers"
    docker rm -f "${legacy_containers[@]}" >/dev/null
  fi

  if docker network inspect vulnerable_default >/dev/null 2>&1; then
    docker network rm vulnerable_default >/dev/null 2>&1 || true
  fi
}

install_k3s_if_missing() {
  if command -v k3s >/dev/null 2>&1; then
    return 0
  fi

  echo "[deploy-k3s] installing k3s"
  curl -sfL https://get.k3s.io | INSTALL_K3S_EXEC="server --write-kubeconfig-mode 0644" sh -
}

ensure_k3s_running() {
  if command -v systemctl >/dev/null 2>&1; then
    systemctl enable --now k3s >/dev/null 2>&1 || true
    systemctl is-active --quiet k3s || systemctl start k3s
  fi

  export KUBECONFIG=/etc/rancher/k3s/k3s.yaml
  kubectl wait --for=condition=Ready node --all --timeout=180s >/dev/null
}

build_and_import_images() {
  echo "[deploy-k3s] building app image"
  docker build -t luxora-challenge-base:latest "$REPO_ROOT/app" >/dev/null
  echo "[deploy-k3s] building web image"
  docker build -t luxora-web:latest "$REPO_ROOT/proxy" >/dev/null
  echo "[deploy-k3s] importing images into k3s containerd"
  docker save luxora-challenge-base:latest luxora-web:latest | k3s ctr images import -
}

apply_manifests() {
  local callback_hint
  callback_hint="$(callback_host_hint)"

  echo "[deploy-k3s] generating manifests for ${BASE_DOMAIN}"
  (
    cd "$REPO_ROOT"
    LUXORA_BASE_DOMAIN="$BASE_DOMAIN" \
    LUXORA_CALLBACK_HOST_HINT="$callback_hint" \
    node scripts/generate-k8s-manifests.js >/dev/null
  )

  echo "[deploy-k3s] applying Kubernetes resources"
  kubectl apply -f "$REPO_ROOT/k8s/luxora-benchmark.yaml" >/dev/null

  echo "[deploy-k3s] forcing rollout to pick up locally imported images"
  kubectl get deployment -n "$NAMESPACE" -o name | xargs -r kubectl -n "$NAMESPACE" rollout restart >/dev/null

  echo "[deploy-k3s] waiting for deployments"
  while IFS= read -r deployment_name; do
    [ -n "$deployment_name" ] || continue
    kubectl rollout status -n "$NAMESPACE" "$deployment_name" --timeout=300s >/dev/null
  done < <(kubectl get deployment -n "$NAMESPACE" -o name)
}

print_summary() {
  echo "[deploy-k3s] gateway host: http://${BASE_DOMAIN}/"
  echo "[deploy-k3s] example challenge route: http://${BASE_DOMAIN}/rbac/silver"
  kubectl get ingress,svc,deploy -n "$NAMESPACE"
}

install_k3s_if_missing
ensure_k3s_running
cleanup_legacy_docker_runtime
build_and_import_images
apply_manifests
print_summary
