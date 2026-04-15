#!/usr/bin/env bash
set -euo pipefail

fail() {
  printf 'archive-diagram: %s\n' "$1" >&2
  exit 1
}

starter_template() {
  cat <<'EOF'
# System Diagram

```mermaid
flowchart TD
  A[Start here] --> B[Edit this diagram]
```
EOF
}

sanitize_title() {
  printf '%s' "$1" \
    | tr '[:upper:]' '[:lower:]' \
    | tr -cs '[:alnum:]' '-' \
    | sed 's/^-//' \
    | sed 's/-$//'
}

DIAGRAM_FILE="${DIAGRAM_FILE:-system-diagram.md}"
DIAGRAM_OUTPUT="${DIAGRAM_OUTPUT:-diagram.png}"
DIAGRAM_ARCHIVE_DIR="${DIAGRAM_ARCHIVE_DIR:-past-diagrams}"

if [[ ! -f "$DIAGRAM_FILE" ]]; then
  fail "missing diagram file: $DIAGRAM_FILE"
fi

if [[ ! -f "$DIAGRAM_OUTPUT" ]]; then
  fail "missing diagram output: $DIAGRAM_OUTPUT"
fi

default_title="$(basename "$PWD")"
title="$default_title"

if [[ -t 0 ]]; then
  printf 'Title [%s]: ' "$default_title"
  read -r user_title || true
  if [[ -n "${user_title:-}" ]]; then
    title="$user_title"
  fi
fi

slug="$(sanitize_title "$title")"
if [[ -z "$slug" ]]; then
  slug="diagram"
fi

timestamp="$(date +%Y%m%d-%H%M%S)"
archive_basename="${timestamp}-${slug}"
archive_ext="${DIAGRAM_OUTPUT##*.}"
archive_dir="${DIAGRAM_ARCHIVE_DIR}"
archive_diagram="${archive_dir}/${archive_basename}-diagram.${archive_ext}"
archive_markdown="${archive_dir}/${archive_basename}-system-diagram.md"

mkdir -p "$archive_dir"

cp "$DIAGRAM_FILE" "$archive_markdown"
cp "$DIAGRAM_OUTPUT" "$archive_diagram"
starter_template > "$DIAGRAM_FILE"

printf 'archived %s and %s to %s\n' "$DIAGRAM_FILE" "$DIAGRAM_OUTPUT" "$archive_dir"
printf 'reset %s to the starter template\n' "$DIAGRAM_FILE"
