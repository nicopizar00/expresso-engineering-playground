#!/bin/sh
# Resolves SCENARIO (if set) to a baked-in script path, then execs k6.
# With no SCENARIO, forwards argv untouched -- identical to the direct
# `k6 "$@"` invocation this replaces.
#
# Repo-owned copy mirroring vendor/punch/scripts/k6-wrapper.sh's pattern --
# see docs/specs/punch-submodule-integration.md INT-005 for why this repo
# keeps its own k6 image/build files instead of parameterizing punch's.
set -e

SCRIPTS_DIR="${K6_SCRIPTS_DIR:-/scripts/scenarios}"

echo "👊 Punch k6-wrapper" >&2

resolve_script() {
  case "$1" in
    smoke) echo "${SCRIPTS_DIR}/smoke/smoke.js" ;;
    purchase-flow) echo "${SCRIPTS_DIR}/purchase-flow/purchase-flow.js" ;;
    *) return 1 ;;
  esac
}

if [ -n "${SCENARIO:-}" ]; then
  if ! script_path=$(resolve_script "$SCENARIO"); then
    echo "❌ k6-wrapper: unknown SCENARIO '${SCENARIO}' (expected: smoke, purchase-flow)" >&2
    exit 1
  fi

  if [ "$#" -ge 2 ]; then
    echo "⚠️  SCENARIO=${SCENARIO} overrides requested script '$2' -> ${script_path}" >&2
  else
    echo "ℹ️  SCENARIO=${SCENARIO} -> ${script_path}" >&2
  fi

  if [ "$#" -eq 0 ]; then
    set -- run "$script_path"
  elif [ "$#" -eq 1 ]; then
    set -- "$1" "$script_path"
  else
    subcommand="$1"
    shift 2
    set -- "$subcommand" "$script_path" "$@"
  fi
else
  echo "ℹ️  no SCENARIO set, using script from compose command" >&2
fi

echo "✅ launching: k6 $*" >&2
exec k6 "$@"
