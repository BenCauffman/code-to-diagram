#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"

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

resolve_source_file() {
  local workspace_dir="$1"
  local candidate="$2"
  local source_file

  source_file="$(resolve_path "$workspace_dir" "$(workspace_item_name "$candidate")")"
  if [[ -f "$source_file" ]]; then
    printf '%s\n' "$source_file"
    return 0
  fi

  if [[ "$source_file" == *workspace.node.json ]] && [[ -f "${workspace_dir}/system-diagram.md" ]]; then
    printf '%s\n' "${workspace_dir}/system-diagram.md"
    return 0
  fi

  printf '%s\n' "$source_file"
}

workspace_dir="$(find_workspace_config_dir)"
DIAGRAM_FILE_RAW="${DIAGRAM_FILE:-workspace.node.json}"
DIAGRAM_OUTPUT_RAW="${DIAGRAM_OUTPUT:-diagram.png}"

DIAGRAM_FILE="$(resolve_source_file "$workspace_dir" "$DIAGRAM_FILE_RAW")"
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

node "${script_dir}/source-to-mermaid.mjs" "$DIAGRAM_FILE" > "$tmp_mermaid"

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

node "${script_dir}/workspace-studio.mjs" "$DIAGRAM_FILE" "$DIAGRAM_OUTPUT" "$workspace_dir" >/dev/null

printf 'rendered %s -> %s\n' "$DIAGRAM_FILE" "$DIAGRAM_OUTPUT"
