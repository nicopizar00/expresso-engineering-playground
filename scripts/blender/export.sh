#!/usr/bin/env bash
# Headless Blender → GLB wrapper for the mini-commerce visualizer.
#
# Resolves the Blender binary (env override → PATH → macOS bundle),
# invokes scripts/blender/export_glb.py inside `blender --background`,
# and writes the GLB next to the visualizer static assets so nginx can
# serve it directly at /models/<name>.glb.
#
# Usage:
#   pnpm pg:blender:export                     # defaults below
#   pnpm pg:blender:export --input X --output Y
#   BLENDER_BIN=/path/to/blender pnpm pg:blender:export

set -euo pipefail

DEFAULT_INPUT="/tmp/espresso_cup_renders/classic_espreso_cup.blend"
DEFAULT_OUTPUT="apps/visualizer-3d/public/models/classic_espreso_cup.glb"

INPUT="$DEFAULT_INPUT"
OUTPUT="$DEFAULT_OUTPUT"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --input)
      INPUT="$2"
      shift 2
      ;;
    --output)
      OUTPUT="$2"
      shift 2
      ;;
    -h|--help)
      grep '^#' "$0" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *)
      echo "ERROR unknown argument: $1" >&2
      exit 2
      ;;
  esac
done

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SCRIPT="$REPO_ROOT/scripts/blender/export_glb.py"

# Resolve absolute paths so the script runs the same from any CWD.
if [[ "$INPUT" != /* ]]; then
  INPUT="$REPO_ROOT/$INPUT"
fi
if [[ "$OUTPUT" != /* ]]; then
  OUTPUT="$REPO_ROOT/$OUTPUT"
fi

# Resolve the Blender binary.
BLENDER=""
if [[ -n "${BLENDER_BIN:-}" ]]; then
  BLENDER="$BLENDER_BIN"
elif command -v blender >/dev/null 2>&1; then
  BLENDER="$(command -v blender)"
elif [[ -x "/Applications/Blender.app/Contents/MacOS/Blender" ]]; then
  BLENDER="/Applications/Blender.app/Contents/MacOS/Blender"
fi

if [[ -z "$BLENDER" || ! -x "$BLENDER" ]]; then
  cat >&2 <<EOF
ERROR Blender binary not found.

Options to fix:
  - Install Blender:        https://www.blender.org/download/
  - macOS via Homebrew:     brew install --cask blender
  - Or set BLENDER_BIN to the absolute path of the blender executable.
EOF
  exit 1
fi

if [[ ! -f "$INPUT" ]]; then
  echo "ERROR input .blend not found: $INPUT" >&2
  exit 2
fi

mkdir -p "$(dirname "$OUTPUT")"

echo "Blender:  $BLENDER"
echo "Script:   $SCRIPT"
echo "Input:    $INPUT"
echo "Output:   $OUTPUT"
echo

exec "$BLENDER" \
  --background \
  --python "$SCRIPT" \
  -- \
  --input "$INPUT" \
  --output "$OUTPUT"
