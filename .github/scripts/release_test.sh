#!/usr/bin/env bash
set -euo pipefail
script="$(cd "$(dirname "$0")" && pwd)/release.sh"
directory=$(mktemp -d)
trap 'rm -rf "$directory"' EXIT
export RUNNER_TEMP="$directory" GITHUB_REPOSITORY=example/vrpc RELEASE_TAG=v1.2.3
export RELEASE_FIXTURE="$directory"
cd "$directory"
printf '{"version":"1.2.3"}\n' > package.json
printf '## [1.2.3] - 2026-10-05\n\n- Fixture notes.\n' > CHANGELOG.md
git init -q -b main
git config user.name 'Release fixture'
git config user.email 'ci@example.invalid'
git add package.json CHANGELOG.md
git commit -qm fixture
git tag "$RELEASE_TAG"
git update-ref refs/remotes/origin/main HEAD
expect_failure() {
  if bash "$script" "$1" >/dev/null 2>&1; then echo "Expected $1 failure" >&2; exit 1; fi
}
bash "$script" prepare
RELEASE_TAG=invalid expect_failure prepare
git commit --allow-empty -qm unmerged
git tag v1.2.4
RELEASE_TAG=v1.2.4 expect_failure prepare
expect_failure prepare
git checkout -q "$RELEASE_TAG"
# shellcheck disable=SC2317,SC2329
gh() {
  case "$1 $2" in
    'api --paginate')
      test "${API_FAIL:-false}" = false || return 1
      cat "$RELEASE_FIXTURE/state" ;;
    'release create')
      echo create >> "$RELEASE_FIXTURE/events"
      echo '[[{"tag_name":"v1.2.3","draft":true}]]' > "$RELEASE_FIXTURE/state" ;;
    'release edit')
      test "${PUBLISH_FAIL:-false}" = false || return 1
      echo publish >> "$RELEASE_FIXTURE/events"
      echo '[[{"tag_name":"v1.2.3","draft":false}]]' > "$RELEASE_FIXTURE/state" ;;
    *) return 1 ;;
  esac
}
export -f gh
echo '[[]]' > "$directory/state"
API_FAIL=true expect_failure publish
PUBLISH_FAIL=true expect_failure publish
jq -e '.[0][0].draft == true' "$directory/state" >/dev/null
bash "$script" publish
test "$(cat "$directory/events")" = $'create\npublish'
bash "$script" publish
test "$(cat "$directory/events")" = $'create\npublish'
echo 'Release lifecycle checks passed'
