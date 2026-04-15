#!/usr/bin/env bash
set -euo pipefail

fail() {
  printf 'render-diagram: %s\n' "$1" >&2
  exit 1
}

DIAGRAM_FILE="${DIAGRAM_FILE:-system-diagram.md}"
DIAGRAM_OUTPUT="${DIAGRAM_OUTPUT:-diagram.png}"

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
case "${output_ext,,}" in
  png|svg) ;;
  *)
    fail "unsupported output format: $DIAGRAM_OUTPUT"
    ;;
esac

mkdir -p "$(dirname -- "$DIAGRAM_OUTPUT")"

mmdc -i "$tmp_mermaid" -o "$DIAGRAM_OUTPUT" -s 3 -w 2000

printf 'rendered %s -> %s\n' "$DIAGRAM_FILE" "$DIAGRAM_OUTPUT"
