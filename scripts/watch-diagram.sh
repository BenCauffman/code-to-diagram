#!/usr/bin/env bash
set -euo pipefail

fail() {
  printf 'watch-diagram: %s\n' "$1" >&2
  exit 1
}

DIAGRAM_FILE="${DIAGRAM_FILE:-system-diagram.md}"
script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"

if ! command -v nodemon >/dev/null 2>&1; then
  fail "nodemon not found. Install nodemon and make sure it is on PATH."
fi

if command -v render-diagram >/dev/null 2>&1; then
  render_exec="render-diagram"
  render_now() {
    render-diagram
  }
elif [[ -x "${script_dir}/render-diagram.sh" ]]; then
  render_exec="bash ${script_dir}/render-diagram.sh"
  render_now() {
    bash "${script_dir}/render-diagram.sh"
  }
else
  fail "render-diagram not found. Install the scripts into ~/bin or run from the repo."
fi

render_now

exec nodemon \
  --watch "$DIAGRAM_FILE" \
  --ext md \
  --quiet \
  --exec "$render_exec"
