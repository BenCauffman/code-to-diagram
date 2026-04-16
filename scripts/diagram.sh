#!/usr/bin/env bash
set -euo pipefail
script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
cd "${HOME}"
exec node "${script_dir}/diagram.mjs" "$@"
