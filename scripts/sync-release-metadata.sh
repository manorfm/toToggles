#!/usr/bin/env sh
set -eu

latest_tag() {
  git tag --merged HEAD --list "$1/v[0-9]*" --sort=-v:refname | head -n 1
}

version_from_tag() {
  tag="$1"
  if [ -n "$tag" ]; then
    printf '%s' "${tag##*/v}"
  else
    printf 'null'
  fi
}

server_version="$(version_from_tag "$(latest_tag server)")"
java_version="$(sed -nE 's/^version = "([^"]+)"/\1/p' totoggle_java/build.gradle.kts)"
node_version="$(node -p 'require("./totoggle_node/package.json").version')"
go_version="$(version_from_tag "$(latest_tag totoggle_go)")"

printf '{\n  "server": "%s",\n  "java": "%s",\n  "node": "%s",\n  "go": %s\n}\n' \
  "$server_version" "$java_version" "$node_version" "$go_version" > website/releases.json
