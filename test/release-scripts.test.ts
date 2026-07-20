import { describe, expect, it } from "vitest";

import { createPublishManifest, getNextVersion, getNpmTag } from "../scripts/release-package";

describe("release script helpers", () => {
  it("prepares alpha, patch, minor, and major versions", () => {
    expect(getNextVersion("0.9.0", { type: "patch", stage: "alpha" })).toBe("0.9.1-alpha.0");
    expect(getNextVersion("0.9.0", { type: "minor", stage: "alpha" })).toBe("0.10.0-alpha.0");
    expect(getNextVersion("0.9.0", { type: "major", stage: "alpha" })).toBe("1.0.0-alpha.0");
    expect(getNextVersion("0.9.1-alpha.0", { type: "patch", stage: "alpha" })).toBe(
      "0.9.1-alpha.1",
    );
    expect(getNextVersion("0.9.1-alpha.1", { type: "patch" })).toBe("0.9.1");
    expect(getNextVersion("0.9.1", { type: "minor" })).toBe("0.10.0");
    expect(getNextVersion("0.10.0", { type: "major" })).toBe("1.0.0");
    expect(() => getNextVersion("invalid", { type: "patch" })).toThrow("Invalid version");
  });

  it("derives npm dist-tags from semver prerelease identifiers", () => {
    expect(getNpmTag("0.9.0")).toBe("latest");
    expect(getNpmTag("0.1.0-alpha.2")).toBe("alpha");
  });

  it("creates a publish manifest from the package version", () => {
    const manifest = createPublishManifest(
      {
        name: "@yorun-ai/vrpc",
        version: "0.9.0",
        license: "Apache-2.0",
        repository: {
          type: "git",
          url: "git+https://github.com/yorun-ai/vrpc-ts.git",
        },
        scripts: { build: "vite build" },
        devDependencies: { vite: "latest" },
      },
      "0.9.0",
    );

    expect(manifest).not.toHaveProperty("scripts");
    expect(manifest).not.toHaveProperty("devDependencies");
    expect(manifest.repository).toEqual({
      type: "git",
      url: "git+https://github.com/yorun-ai/vrpc-ts.git",
    });
    expect(manifest.version).toBe("0.9.0");
    expect(manifest.license).toBe("Apache-2.0");
    expect(manifest.files).toEqual([
      "dist",
      "README.md",
      "README.zh-CN.md",
      "CONTRIBUTING.md",
      "docs",
      "LICENSE",
      "package.json",
    ]);
    expect(manifest.publishConfig).toEqual({
      access: "public",
      registry: "https://registry.npmjs.org/",
    });
  });
});
