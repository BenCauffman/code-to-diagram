#!/usr/bin/env bash
set -euo pipefail

fail() {
  printf 'watch-diagram: %s\n' "$1" >&2
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
script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
render_bin="${script_dir}/render-diagram"
render_script="${script_dir}/render-diagram.sh"

if ! command -v nodemon >/dev/null 2>&1; then
  fail "nodemon not found. Install nodemon and make sure it is on PATH."
fi

if [[ -x "$render_bin" ]]; then
  render_exec="$render_bin"
  render_now() {
    "$render_bin"
  }
elif [[ -f "$render_script" ]]; then
  render_exec="$render_script"
  render_now() {
    "$render_script"
  }
elif command -v render-diagram >/dev/null 2>&1; then
  render_exec="render-diagram"
  render_now() {
    render-diagram
  }
else
  fail "render-diagram not found. Install the scripts into ~/bin or run from the repo."
fi

printf 'watch-diagram: workspace=%s\n' "$workspace_dir"
printf 'watch-diagram: file=%s\n' "$DIAGRAM_FILE"
printf 'watch-diagram: output=%s\n' "$DIAGRAM_OUTPUT"
printf 'watch-diagram: renderer=%s\n' "$render_exec"
render_now

exec nodemon \
  --legacy-watch \
  --watch "$DIAGRAM_FILE" \
  --ext md \
  --exec "$render_exec"
