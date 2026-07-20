import { spawnSync } from "node:child_process";
import { cp, mkdir, mkdtemp, rm, symlink } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const packageRoot = process.cwd();
const fixtureRoot = path.join(packageRoot, "test", "package-consumers");
const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "vrpc-package-types-"));

try {
  for (const consumer of ["esm", "cjs", "bundler"]) {
    await cp(path.join(fixtureRoot, consumer), path.join(temporaryRoot, consumer), {
      recursive: true,
    });
  }

  const packageLink = path.join(temporaryRoot, "node_modules", "@yorun-ai", "vrpc");
  await mkdir(path.dirname(packageLink), { recursive: true });
  await symlink(packageRoot, packageLink, process.platform === "win32" ? "junction" : "dir");

  const tsc = path.join(packageRoot, "node_modules", ".bin", "tsc");
  for (const consumer of ["esm", "cjs", "bundler"]) {
    const result = spawnSync(tsc, ["-p", path.join(temporaryRoot, consumer)], {
      stdio: "inherit",
    });

    if (result.error) {
      throw result.error;
    }
    if (result.status !== 0) {
      throw new Error(`${consumer} package consumer type-check failed.`);
    }
  }
} finally {
  await rm(temporaryRoot, { recursive: true, force: true });
}

process.stdout.write(
  "NodeNext ESM, NodeNext CommonJS, and bundler consumers resolve package types.\n",
);
