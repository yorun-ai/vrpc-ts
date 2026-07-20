import * as semver from "semver";

export const registry = "https://registry.npmjs.org/";
export const versionTypes = ["patch", "minor", "major"] as const;
export const publishFiles = [
  "dist",
  "README.md",
  "README.zh-CN.md",
  "CONTRIBUTING.md",
  "docs",
  "LICENSE",
  "package.json",
] as const;

export type VersionType = (typeof versionTypes)[number];

export function getNextVersion(
  currentVersion: string,
  options: { type: VersionType; stage?: "alpha" },
): string {
  if (!semver.valid(currentVersion)) {
    throw new Error(`Invalid version: ${currentVersion}`);
  }

  if (options.stage === "alpha") {
    const prerelease = semver.prerelease(currentVersion);
    const releaseType =
      prerelease?.[0] === "alpha"
        ? "prerelease"
        : options.type === "major"
          ? "premajor"
          : options.type === "minor"
            ? "preminor"
            : "prepatch";
    const nextVersion = semver.inc(currentVersion, releaseType, "alpha");
    if (nextVersion) {
      return nextVersion;
    }
  } else {
    const nextVersion = semver.inc(currentVersion, options.type);
    if (nextVersion) {
      return nextVersion;
    }
  }

  throw new Error(`Failed to compute the next version from ${currentVersion}.`);
}

export function getNpmTag(version: string): string {
  if (!semver.valid(version)) {
    throw new Error(`Invalid version: ${version}`);
  }

  const prerelease = semver.prerelease(version);
  return prerelease ? String(prerelease[0]) : "latest";
}

export function createPublishManifest(
  packageJson: Record<string, unknown>,
  version: string,
): Record<string, unknown> {
  const manifest = { ...packageJson };

  for (const key of ["devDependencies", "lint-staged", "scripts"]) {
    delete manifest[key];
  }

  manifest.version = version;
  manifest.files = [...publishFiles];
  manifest.publishConfig = { access: "public", registry };

  return manifest;
}
