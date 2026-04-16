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

  [[ -f "$source_file" ]] || fail "missing source script: $source_file"

  install -m 755 "$source_file" "$target_file"
  printf 'installed %s\n' "$target_file"
}

install_internal_script() {
  local source_file="$1"
  local target_name="$2"
  local target_file="${bin_dir}/${target_name}"

  [[ -f "$source_file" ]] || fail "missing source script: $source_file"

  install -m 755 "$source_file" "$target_file" >/dev/null
}

install_internal_script "${script_dir}/scripts/render-diagram.sh" "render-diagram"
install_internal_script "${script_dir}/scripts/archive-diagram.sh" "archive-diagram"
install_internal_script "${script_dir}/scripts/watch-diagram.sh" "watch-diagram"
install_internal_script "${script_dir}/scripts/workspace-server.mjs" "workspace-server.mjs"
install_script "${script_dir}/scripts/list-workspaces.sh" "list-workspaces"
install_script "${script_dir}/scripts/node-workspace.mjs" "node-workspace.mjs"
install_script "${script_dir}/scripts/source-to-mermaid.mjs" "source-to-mermaid.mjs"
install_script "${script_dir}/scripts/workspace-studio.mjs" "workspace-studio.mjs"

diagram_target="${bin_dir}/diagram"
cat > "$diagram_target" <<EOF
#!/usr/bin/env bash
set -euo pipefail
cd "\${HOME}"
exec node "${script_dir}/scripts/diagram.mjs" "\$@"
EOF
chmod 755 "$diagram_target"
printf 'installed %s\n' "$diagram_target"

diagram_workspace_target="${bin_dir}/diagram-workspace"
cat > "$diagram_workspace_target" <<EOF
#!/usr/bin/env bash
set -euo pipefail
cd "\${HOME}"
exec node "${script_dir}/scripts/diagram-workspace.mjs" "\$@"
EOF
chmod 755 "$diagram_workspace_target"
printf 'installed %s\n' "$diagram_workspace_target"

path_line='export PATH="$HOME/bin:$PATH"'

case "${SHELL##*/}" in
  zsh) rc_file="${HOME}/.zshrc" ;;
  bash) rc_file="${HOME}/.bashrc" ;;
  *) rc_file="${HOME}/.profile" ;;
esac

if ! grep -Fqx "$path_line" "$rc_file" 2>/dev/null; then
  printf '%s\n' "$path_line" >> "$rc_file"
  printf 'updated %s\n' "$rc_file"
fi

printf '\nUsage:\n'
printf '  source %s\n' "$rc_file"
printf '  diagram\n'
printf '  diagram --help\n'
printf '  diagram-workspace open\n'
printf '  diagram-workspace new\n'
printf '  diagram-workspace clear\n'
printf '  diagram-workspace delete\n'
printf '  diagram-workspace --help\n'
