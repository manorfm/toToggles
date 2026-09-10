#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
# shellcheck source=../run-stress-tests.sh
source "$SCRIPT_DIR/run-stress-tests.sh"

assert_allows_loopback() {
  ALLOW_NON_LOOPBACK_STRESS_TARGETS="" stress_require_safe_target "http://127.0.0.1:3911" "Go SDK"
  ALLOW_NON_LOOPBACK_STRESS_TARGETS="" stress_require_safe_target "http://[::1]:3912" "Node SDK"
}

assert_rejects_remote_without_acknowledgement() {
  if ALLOW_NON_LOOPBACK_STRESS_TARGETS="" stress_require_safe_target "https://stress.example.test" "Java SDK"; then
    echo "expected a remote target without acknowledgement to be rejected" >&2
    return 1
  fi
}

assert_allows_remote_with_acknowledgement() {
  ALLOW_NON_LOOPBACK_STRESS_TARGETS="yes" stress_require_safe_target "https://stress.example.test" "Java SDK"
}

assert_requires_prepared_sdk_fixture() {
  local temporary_directory
  temporary_directory=$(mktemp -d)
  if (cd "$temporary_directory" && require_sdk_fixture); then
    rm -rf "$temporary_directory"
    echo "expected a missing SDK fixture to be rejected" >&2
    return 1
  fi
  touch "$temporary_directory/test-data.json"
  (cd "$temporary_directory" && require_sdk_fixture)
  rm -rf "$temporary_directory"
}

assert_allows_loopback
assert_rejects_remote_without_acknowledgement
assert_allows_remote_with_acknowledgement
assert_requires_prepared_sdk_fixture

echo "stress runner safety tests passed"
