#!/usr/bin/env bash
# Source this in Git Bash: the Cloud SDK cannot handle the non-ASCII user path, so gcloud is run
# through its Python entry point with 8.3 short paths (docs/DEPLOY.md, T-5-09).
export CLOUDSDK_PYTHON='C:/Users/JNPAN~1/AppData/Local/Programs/Python/PYTHON~1/python.exe'
export CLOUDSDK_SSH_PUTTY_FORCE_CONNECT=false
export CLOUDSDK_CORE_DISABLE_PROMPTS=1
gcloud() {
  local arg; local -a sdk_args=()
  for arg in "$@"; do
    if [[ "$arg" == /* && -e "$arg" ]]; then sdk_args+=("$(cygpath -w "$arg")"); else sdk_args+=("$arg"); fi
  done
  MSYS2_ARG_CONV_EXCL='*' "$CLOUDSDK_PYTHON" -S C:/Users/JNPAN~1/AppData/Local/Google/CLOUDS~1/GOOGLE~1/lib/gcloud.py "${sdk_args[@]}"
}
export -f gcloud
