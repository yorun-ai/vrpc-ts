import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";

const packageRoot = process.cwd();
const packageJson = JSON.parse(await readFile(path.join(packageRoot, "package.json"), "utf8"));
const require = createRequire(import.meta.url);

assert.equal(
  packageJson.repository?.url,
  "git+https://github.com/yorun-ai/vrpc-ts.git",
  "package repository metadata must point to the canonical GitHub repository",
);
assert.equal(
  packageJson.homepage,
  "https://github.com/yorun-ai/vrpc-ts#readme",
  "package homepage metadata must point to the canonical GitHub repository",
);
assert.equal(
  packageJson.bugs?.url,
  "https://github.com/yorun-ai/vrpc-ts/issues",
  "package issue metadata must point to the canonical GitHub repository",
);
assert.equal(packageJson.sideEffects, false, "package modules must remain side-effect free");
assert.equal(
  packageJson.packageManager,
  "pnpm@11.15.0",
  "the repository package manager version must remain reproducible",
);

for (const entrypoint of [".", "./client", "./http"]) {
  const entry = packageJson.exports[entrypoint];

  await access(path.join(packageRoot, entry.import.types));
  await access(path.join(packageRoot, entry.import.default));
  await access(path.join(packageRoot, entry.require.types));
  await access(path.join(packageRoot, entry.require.default));

  const specifier =
    entrypoint === "." ? packageJson.name : `${packageJson.name}${entrypoint.slice(1)}`;
  const imported = await import(specifier);
  const required = require(specifier);

  assert.ok(Object.keys(imported).length > 0, `${specifier} must expose ESM exports`);
  assert.ok(Object.keys(required).length > 0, `${specifier} must expose CommonJS exports`);
}

await access(path.join(packageRoot, "LICENSE"));
await access(path.join(packageRoot, "README.zh-CN.md"));
await access(path.join(packageRoot, "CONTRIBUTING.md"));
await access(path.join(packageRoot, "docs", "guides", "usage.md"));
await access(path.join(packageRoot, "docs", "maintainers", "architecture.md"));
await access(path.join(packageRoot, "docs", "maintainers", "protocol.md"));
process.stdout.write(
  "Built package entrypoints, license, contribution guide, bilingual README, and English documentation are valid.\n",
);
