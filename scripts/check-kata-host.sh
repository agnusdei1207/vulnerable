#!/usr/bin/env bash
set -euo pipefail

status=0

pass() {
  printf '[ok] %s\n' "$1"
}

warn() {
  printf '[warn] %s\n' "$1"
}

fail() {
  printf '[fail] %s\n' "$1"
  status=1
}

check_cmd() {
  command -v "$1" >/dev/null 2>&1
}

virt_type="$(systemd-detect-virt 2>/dev/null || true)"
if [[ -n "${virt_type}" && "${virt_type}" != "none" ]]; then
  warn "Host is itself virtualized (${virt_type}). Kata inside a guest requires nested virtualization from the provider."
else
  pass "Host is not reporting a nested virtualization layer."
fi

if grep -Eq '(vmx|svm)' /proc/cpuinfo; then
  pass "CPU virtualization flags are exposed to the OS."
else
  fail "CPU virtualization flags (vmx/svm) are not exposed. Nested KVM is unavailable."
fi

if [[ -e /dev/kvm ]]; then
  pass "/dev/kvm exists."
else
  fail "/dev/kvm is missing."
fi

if [[ -e /dev/vhost-vsock ]]; then
  pass "/dev/vhost-vsock exists."
else
  warn "/dev/vhost-vsock is missing. Some Kata transports may be unavailable."
fi

if sudo k3s kubectl get runtimeclass >/dev/null 2>&1; then
  if sudo k3s kubectl get runtimeclass 2>/dev/null | awk 'NR>1 {print $1}' | grep -Eq '^kata($|-)' ; then
    pass "A kata RuntimeClass already exists in the cluster."
  else
    warn "No kata RuntimeClass found in the cluster yet."
  fi
else
  warn "k3s kubectl is unavailable; skipped RuntimeClass check."
fi

containerd_config="/var/lib/rancher/k3s/agent/etc/containerd/config.toml"
if [[ -f "${containerd_config}" ]]; then
  if sudo grep -Eq 'io\.containerd\.kata\.v2|runtimes\.(kata|kata-[a-z0-9-]+)' "${containerd_config}"; then
    pass "containerd appears to have a kata runtime handler configured."
  else
    warn "containerd does not have a kata runtime handler configured yet."
  fi
else
  warn "containerd config not found at ${containerd_config}."
fi

if [[ "${status}" -eq 0 ]]; then
  printf '\nKata preflight: host looks capable. Next step is installing Kata and applying runtimeClassName.\n'
else
  printf '\nKata preflight: host is not ready. Fix nested virtualization or move to a node with /dev/kvm before installing Kata.\n'
fi

exit "${status}"
