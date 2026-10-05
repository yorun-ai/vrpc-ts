# Releasing

The root `package.json#version` is the authoritative package version. Release scripts publish the build artifacts for that version to npm.

## Release policy

The package starts at `0.9.0` as a usable pre-1.0 release. Until `1.0.0`, the public API is not guaranteed to remain stable:

- A `0.x` minor release may contain breaking API changes.
- Patch releases contain backward-compatible fixes.
- Every breaking change requires release notes and migration guidance.
- `1.0.0` marks the start of the stable public API commitment.

## Preparing a version

Version commands only update the root `package.json#version`; they do not run `npm publish`:

```bash
pnpm version:alpha:patch
pnpm version:alpha:minor
pnpm version:alpha:major
pnpm version:patch
pnpm version:minor
pnpm version:major
```

Version examples use the initial `0.9.0` release as the starting point:

| Command               | Result           |
| --------------------- | ---------------- |
| `version:alpha:patch` | `0.9.1-alpha.0`  |
| `version:alpha:minor` | `0.10.0-alpha.0` |
| `version:alpha:major` | `1.0.0-alpha.0`  |
| `version:patch`       | `0.9.1`          |
| `version:minor`       | `0.10.0`         |
| `version:major`       | `1.0.0`          |

Running an alpha command again on its prerelease line increments the prerelease number, for example from `0.9.1-alpha.0` to `0.9.1-alpha.1`. Running the matching stable command on that prerelease removes the prerelease suffix.

Review and commit the version change before publishing. A prerelease automatically uses its SemVer identifier as the dist-tag, such as `alpha`; a stable version uses `latest`. After the version PR passes CI and is merged, sync main and push only its reviewed `v<version>` tag. The tag starts publication.

## Publishing

Run `pnpm release:dry-run` locally to check the package without publishing.
Actual publication runs only in GitHub Actions after pushing the version tag;
`pnpm release` does not publish from a developer machine. The workflow checks
that the checkout matches the tag, belongs to main history and has exactly the
same version in package.json. It never creates, moves or pushes tags.

Keep the `npm-publish` environment and npm trusted publisher configured for
this repository and `release.yml`. Environment deployment rules must allow
version tags, not only the main branch; existing required approvals still apply.
The workflow uses OIDC with `id-token: write` and the pinned npm CLI.

## Release gates

The release script runs:

```bash
pnpm install --frozen-lockfile
pnpm type-check
pnpm test
pnpm fmt:check
pnpm lint
pnpm build
pnpm test:package
```

The script assembles the package in a temporary directory, runs npm pack once,
and publishes that exact tarball with provenance. A stable version uses `latest`;
a prerelease uses its SemVer identifier. The registry SHA-512 integrity must match
the packed tarball before GitHub Release is created. Release notes are generated
from GitHub history; this repository does not maintain a CHANGELOG. Prerelease
tags create GitHub prereleases. Temporary package files are removed on exit.

## Recovery

Rerun the failed workflow or dispatch it with the same existing tag. If npm
already contains the version, compare its integrity with the rebuilt tarball:
only an exact match skips npm upload and resumes GitHub Release creation.
A mismatch, authentication failure or registry error stops publication. Recovery
does not rewrite npm dist-tags, which may already point to a newer release.
An existing published GitHub Release is left unchanged; an unpublished draft
can finish publication. Do not move tags or unpublish npm versions to retry.

For workflow changes, run `bash .github/scripts/release_test.sh`, ShellCheck,
actionlint and the normal package checks. Full OIDC and hosted publication still
require an actual version-tag run.

`package.json` must declare a reviewed license and the repository must contain
the matching LICENSE. Published contents include JavaScript, declarations, both
READMEs, guides, maintainer documentation, CONTRIBUTING, LICENSE and the manifest.
