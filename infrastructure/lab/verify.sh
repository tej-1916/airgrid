#!/usr/bin/env bash
# Runs the isolated container lab and verifies its security posture. Safe to repeat; leaves nothing behind.
#   infrastructure/lab/verify.sh
# Starts ONLY lab-db and lab-tests (never the normal postgres/api/web services) under its own compose project name.
set -euo pipefail
cd "$(dirname "$0")/../.."
P=airgrid-lab
C="docker compose -p $P --profile lab"
made_env=0

# The normal `api` service requires .env; compose parses the whole file even for `up lab-tests`.
if [ ! -f .env ]; then cp .env.example .env; made_env=1; fi
cleanup() { $C down -v --remove-orphans >/dev/null 2>&1 || true; [ "$made_env" = 1 ] && rm -f .env; return 0; }
trap cleanup EXIT

live_before=$(docker inspect -f '{{.Id}} {{.State.StartedAt}}' airgrid-postgres 2>/dev/null || echo "none")

echo "== running lab tests =="
set +e
$C up --build --abort-on-container-exit --exit-code-from lab-tests lab-tests
rc=$?
set -e

echo "== verifying container configuration =="
fail=0
check() { if [ "$2" = "$3" ]; then echo "ok   $1 = $2"; else echo "FAIL $1: got '$2', want '$3'"; fail=1; fi; }
for c in airgrid-lab-db airgrid-lab-tests; do
  check "$c privileged"        "$(docker inspect -f '{{.HostConfig.Privileged}}' $c)" "false"
  check "$c readonly rootfs"   "$(docker inspect -f '{{.HostConfig.ReadonlyRootfs}}' $c)" "true"
  check "$c cap_drop"          "$(docker inspect -f '{{json .HostConfig.CapDrop}}' $c)" '["ALL"]'
  check "$c cap_add"           "$(docker inspect -f '{{json .HostConfig.CapAdd}}' $c)" "null"
  check "$c no-new-privileges" "$(docker inspect -f '{{json .HostConfig.SecurityOpt}}' $c)" '["no-new-privileges:true"]'
  check "$c published ports"   "$(docker inspect -f '{{json .HostConfig.PortBindings}}' $c)" "{}"
  check "$c bind/volume mounts" "$(docker inspect -f '{{range .Mounts}}{{.Type}} {{end}}' $c | tr -d ' ')" ""
  check "$c network mode"      "$(docker inspect -f '{{.HostConfig.NetworkMode}}' $c)" "${P}_airgrid-lab-net"
done
check "lab network internal"   "$(docker network inspect ${P}_airgrid-lab-net -f '{{.Internal}}')" "true"
check "lab-db health"          "$(docker inspect -f '{{.State.Health.Status}}' airgrid-lab-db)" "healthy"
check "lab tests exit code"    "$rc" "0"

cleanup; trap - EXIT
check "lab containers removed" "$(docker ps -a --filter name=airgrid-lab -q | wc -l | tr -d ' ')" "0"
check "live airgrid-postgres untouched" "$(docker inspect -f '{{.Id}} {{.State.StartedAt}}' airgrid-postgres 2>/dev/null || echo none)" "$live_before"
[ "$fail" = 0 ] && echo "LAB VERIFIED" || { echo "LAB VERIFICATION FAILED"; exit 1; }
