#!/usr/bin/env bash
set -euo pipefail

registry_file() {
  printf '%s/.config/diagram-as-code/workspaces\n' "$HOME"
}

load_registered_workspaces() {
  local registry
  registry="$(registry_file)"

  if [[ ! -f "$registry" ]]; then
    return 0
  fi

  while IFS= read -r line; do
    [[ -n "$line" ]] || continue
    [[ -d "$line" ]] || continue
    [[ -f "$line/.diagram-as-code.env" ]] || continue
    printf '%s\n' "$line"
  done < "$registry"
}

index=0
found=0

while IFS= read -r workspace; do
  found=1
  index=$((index + 1))
  printf '%d) %s\n' "$index" "$workspace"
done < <(load_registered_workspaces)

if [[ "$found" -eq 0 ]]; then
  printf 'No initialized workspaces found.\n'
fi
