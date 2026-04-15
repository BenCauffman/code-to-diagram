#!/usr/bin/env bash
set -euo pipefail

fail() {
  printf 'install: %s\n' "$1" >&2
  exit 1
}

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
bin_dir="${HOME}/bin"

mkdir -p "$bin_dir"

install_script() {
  local source_file="$1"
  local target_name="$2"
  local target_file="${bin_dir}/${target_name}"

  if [[ ! -f "$source_file" ]]; then
    fail "missing source script: $source_file"
  fi

  install -m 755 "$source_file" "$target_file"
  printf 'installed %s\n' "$target_file"
}

install_script "${script_dir}/scripts/render-diagram.sh" "render-diagram"
install_script "${script_dir}/scripts/archive-diagram.sh" "archive-diagram"
install_script "${script_dir}/scripts/watch-diagram.sh" "watch-diagram"

path_line='export PATH="$HOME/bin:$PATH"'

case "${SHELL##*/}" in
  zsh) rc_file="${HOME}/.zshrc" ;;
  bash) rc_file="${HOME}/.bashrc" ;;
  *)
    rc_file="${HOME}/.profile"
    ;;
esac

if ! grep -Fqx "$path_line" "$rc_file" 2>/dev/null; then
  printf '%s\n' "$path_line" >> "$rc_file"
  printf 'updated %s\n' "$rc_file"
fi

printf '\nUsage:\n'
printf '  source %s\n' "$rc_file"
printf '  render-diagram\n'
printf '  watch-diagram\n'
printf '  archive-diagram\n'
