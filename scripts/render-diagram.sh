#!/usr/bin/env bash
set -euo pipefail

fail() {
  printf 'render-diagram: %s\n' "$1" >&2
  exit 1
}

find_workspace_config_dir() {
  local dir="$PWD"
  while true; do
    if [[ -f "$dir/.diagram-as-code.env" ]]; then
      printf '%s\n' "$dir"
      return 0
    fi
    [[ "$dir" == "/" ]] && break
    dir="$(dirname -- "$dir")"
  done
  printf '%s\n' "$PWD"
}

resolve_path() {
  local base_dir="$1"
  local candidate="$2"

  case "$candidate" in
    /*) printf '%s\n' "$candidate" ;;
    *) printf '%s/%s\n' "$base_dir" "$candidate" ;;
  esac
}

workspace_item_name() {
  basename -- "$1"
}

workspace_dir="$(find_workspace_config_dir)"
DIAGRAM_FILE_RAW="${DIAGRAM_FILE:-system-diagram.md}"
DIAGRAM_OUTPUT_RAW="${DIAGRAM_OUTPUT:-diagram.png}"

DIAGRAM_FILE="$(resolve_path "$workspace_dir" "$(workspace_item_name "$DIAGRAM_FILE_RAW")")"
DIAGRAM_OUTPUT="$(resolve_path "$workspace_dir" "$(workspace_item_name "$DIAGRAM_OUTPUT_RAW")")"

if [[ ! -f "$DIAGRAM_FILE" ]]; then
  fail "missing diagram file: $DIAGRAM_FILE"
fi

if ! command -v mmdc >/dev/null 2>&1; then
  fail "mmdc not found. Install @mermaid-js/mermaid-cli and make sure it is on PATH."
fi

tmp_mermaid="$(mktemp "${TMPDIR:-/tmp}/diagram.XXXXXX.mmd")"
cleanup() {
  rm -f "$tmp_mermaid"
}
trap cleanup EXIT

awk '
  /^```mermaid[[:space:]]*$/ { in_block = 1; next }
  in_block && /^```[[:space:]]*$/ { exit }
  in_block { print }
' "$DIAGRAM_FILE" > "$tmp_mermaid"

if [[ ! -s "$tmp_mermaid" ]]; then
  fail "no Mermaid block found in: $DIAGRAM_FILE"
fi

output_ext="${DIAGRAM_OUTPUT##*.}"
output_ext_lower="$(printf '%s' "$output_ext" | tr '[:upper:]' '[:lower:]')"
case "$output_ext_lower" in
  png|svg) ;;
  *)
    fail "unsupported output format: $DIAGRAM_OUTPUT"
    ;;
esac

mkdir -p "$(dirname -- "$DIAGRAM_OUTPUT")"

mmdc -i "$tmp_mermaid" -o "$DIAGRAM_OUTPUT" -s 3 -w 2000

printf 'rendered %s -> %s\n' "$DIAGRAM_FILE" "$DIAGRAM_OUTPUT"
