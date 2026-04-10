#!/usr/bin/env bash
set -Eeuo pipefail
IFS=$'\n\t'
shopt -s inherit_errexit 2>/dev/null || true

readonly SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
readonly PACKAGE_DIR="$(cd -- "${SCRIPT_DIR}/.." && pwd -P)"
readonly REPO_ROOT="$(cd -- "${PACKAGE_DIR}/../.." && pwd -P)"
readonly EXTENSION_PATH="${PACKAGE_DIR}/extensions/index.ts"
readonly SESSION_NAME="termdraw-pi-smoke-${RANDOM}-$$"
readonly PANE_TARGET="${SESSION_NAME}:0.0"
readonly WINDOW_WIDTH=140
readonly WINDOW_HEIGHT=45
readonly CAPTURE_LINES=160
readonly SMOKE_TEXT="pi smoke save"
readonly KEEP_SESSION="${PI_TERMDRAW_SMOKE_KEEP_SESSION:-0}"

capture_pane() {
  tmux capture-pane -pt "${PANE_TARGET}" -S "-$CAPTURE_LINES"
}

cleanup() {
  local status=$?

  if tmux has-session -t "${SESSION_NAME}" 2>/dev/null; then
    if [[ "${KEEP_SESSION}" == "1" ]]; then
      printf -- 'Keeping tmux session %s for inspection.\n' "${SESSION_NAME}" >&2
    else
      tmux kill-session -t "${SESSION_NAME}" >/dev/null 2>&1 || true
    fi
  fi

  return "$status"
}
trap cleanup EXIT

require_command() {
  local command_name=$1
  command -v -- "${command_name}" >/dev/null 2>&1 || {
    printf -- 'Required command not found: %s\n' "${command_name}" >&2
    exit 1
  }
}

fail() {
  local message=$1
  printf -- 'ERROR: %s\n' "${message}" >&2
  if tmux has-session -t "${SESSION_NAME}" 2>/dev/null; then
    printf -- '--- pane capture (%s) ---\n' "${PANE_TARGET}" >&2
    capture_pane >&2 || true
  fi
  exit 1
}

wait_for_text() {
  local needle=$1
  local timeout_seconds=${2:-30}
  local start_time=$SECONDS

  while (( SECONDS - start_time < timeout_seconds )); do
    if capture_pane | grep -Fq -- "${needle}"; then
      return 0
    fi
    sleep 0.2
  done

  fail "Timed out waiting for text: ${needle}"
}

assert_contains() {
  local needle=$1
  capture_pane | grep -Fq -- "${needle}" || fail "Expected pane to contain: ${needle}"
}

main() {
  require_command tmux
  require_command pi

  printf -- 'Starting tmux smoke session %s...\n' "${SESSION_NAME}"
  tmux new-session \
    -d \
    -s "${SESSION_NAME}" \
    -x "${WINDOW_WIDTH}" \
    -y "${WINDOW_HEIGHT}" \
    -c "${REPO_ROOT}" \
    "PI_TERMDRAW_SMOKE_TEXT=${SMOKE_TEXT@Q} pi --offline --no-session -e ${EXTENSION_PATH@Q}"

  wait_for_text 'Kernel:' 30

  printf -- 'Opening /termdraw...\n'
  tmux send-keys -t "${PANE_TARGET}" '/termdraw' Enter
  wait_for_text 'termDRAW!' 30
  wait_for_text 'termDRAW ready.' 30

  printf -- 'Waiting for automated save back into Pi...\n'
  wait_for_text 'Inserted drawing into the Pi editor.' 30

  assert_contains '```text'
  assert_contains "${SMOKE_TEXT}"
  assert_contains '```'

  printf -- 'Smoke test passed. Drawing returned to the Pi editor successfully.\n'
}

main "$@"
