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

Review and commit the version change before publishing. A prerelease automatically uses its SemVer identifier as the dist-tag, such as `alpha`; a stable version uses `latest`. A successful release creates and pushes only the Git tag `v<version>` for that release.

## Publishing

Before publishing, point `NPM_CONFIG_USERCONFIG` to the npm configuration used for publishing:

```bash
export NPM_CONFIG_USERCONFIG=/path/to/npmrc
```

Run the full checks and an npm dry-run first:

```bash
pnpm release:dry-run
```

After confirming the package name, version, file list, and dist-tag, publish:

```bash
pnpm release
```

The release script publishes the committed version from the root `package.json` and never changes the version during publishing. Before contacting npm, it verifies that the target tag does not exist locally or on `origin`, pulls with fast-forward only, and pushes the release commit. It never pushes unrelated local tags.

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

The script then assembles the package in a system temporary directory, verifies the npm identity, confirms that the target version does not already exist, and runs `npm publish`. The temporary directory is removed after either success or failure.

## Recovering a tag push

Publishing to npm and pushing a Git tag cannot be one atomic operation. If npm publishing succeeds but the final tag push fails, do not publish the version again.

If the local `v<version>` tag exists and points to the release commit, restore the remote tag with:

```bash
git push origin refs/tags/v<version>
```

If local tag creation failed, first verify the release commit, create `v<version>` at that exact commit, and then run the command above. Never use `git push --tags` as recovery because it may publish unrelated local tags.

`package.json` must declare a reviewed license and the repository must contain the matching `LICENSE` file. Both staging and the post-build smoke test validate it. The published package contains JavaScript, type declarations, the bilingual root README, English guides and maintainer documentation, the contribution guide, LICENSE, and the package manifest.
