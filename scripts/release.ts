import { access, cp, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import SimpleGit from "simple-git";
import { $, argv, chalk, fs } from "zx";

import {
  createPublishManifest,
  getNpmTag,
  publishFiles,
  registry,
  requireMatchingIntegrity,
  requireReleaseTag,
} from "./release-package";
import { logger, run } from "./run";

const packageJsonPath = path.join(process.cwd(), "package.json");
const git = SimpleGit();

const dryRun = Boolean(argv["dry-run"]);
const ci = Boolean(argv.ci);

if (ci && dryRun) {
  throw new Error("CI publishing and dry-run mode cannot be enabled together.");
}

async function assertCleanWorkingTree() {
  const gitStatus = await git.status();

  if (gitStatus.files.length > 0) {
    throw new Error(
      "Working directory is not clean. Commit all release metadata before publishing.",
    );
  }
}

async function prepareGit() {
  if (dryRun) {
    logger.info("Dry-run allows local release preparation changes");
    return;
  }
  if (!ci || process.env.GITHUB_ACTIONS !== "true") {
    throw new Error(
      "Publish by pushing a reviewed version tag to GitHub; use release:dry-run locally.",
    );
  }
  await assertCleanWorkingTree();
  const tag = process.env.RELEASE_TAG;
  requireReleaseTag(tag, String((await fs.readJson(packageJsonPath)).version));
  const head = (await git.revparse(["HEAD"])).trim();
  const tagged = (await git.revparse([`refs/tags/${tag}^{commit}`])).trim();
  if (head !== tagged) throw new Error("Checkout does not match the release tag.");
  await git.raw(["merge-base", "--is-ancestor", head, "refs/remotes/origin/main"]);
}

async function runQualityChecks() {
  await run($`pnpm install --frozen-lockfile`, {
    info: "Installing dependencies from the lockfile",
    success: "Locked dependencies have been installed",
    error: "Failed to install dependencies from the lockfile",
  });

  for (const [script, description] of [
    ["type-check", "Type-checking"],
    ["test", "Testing"],
    ["fmt:check", "Checking formatting"],
    ["lint", "Linting"],
    ["build", "Building"],
    ["test:package", "Testing the built package"],
  ] as const) {
    await run($`pnpm run ${script}`, {
      info: `${description} the package`,
      success: `The package passed ${script}`,
      error: `The package failed ${script}`,
    });
  }
}

async function assertReleaseMetadata(packageJson: Record<string, unknown>) {
  getNpmTag(String(packageJson.version));

  if (typeof packageJson.license !== "string" || packageJson.license.length === 0) {
    throw new Error(
      "Publishing requires a reviewed package.json license and matching LICENSE file.",
    );
  }
  await access(path.join(process.cwd(), "LICENSE"));
}

async function createStagingDirectory(packageJson: Record<string, unknown>) {
  const stagingDirectory = await mkdtemp(path.join(os.tmpdir(), "vrpc-release-"));
  const manifest = createPublishManifest(packageJson, String(packageJson.version));

  for (const artifact of publishFiles) {
    if (artifact === "package.json") {
      continue;
    }

    await cp(path.join(process.cwd(), artifact), path.join(stagingDirectory, artifact), {
      recursive: true,
    });
  }

  await writeFile(
    path.join(stagingDirectory, "package.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );

  return stagingDirectory;
}

async function publishedIntegrity(name: string, version: string): Promise<string | undefined> {
  const result = await $({
    quiet: true,
    nothrow: true,
  })`npm view ${`${name}@${version}`} dist.integrity --json --registry=${registry}`;
  if (result.exitCode === 0) {
    const integrity: unknown = JSON.parse(result.stdout);
    if (typeof integrity !== "string" || !integrity.startsWith("sha512-")) {
      throw new Error("Published package has no valid SHA-512 integrity.");
    }
    return integrity;
  }
  if (!result.stderr.includes("E404")) {
    throw new Error(`Unable to check npm package: ${result.stderr.trim()}`);
  }
  return undefined;
}

async function publish() {
  await prepareGit();

  const packageJson = (await fs.readJson(packageJsonPath)) as Record<string, unknown> & {
    name: string;
    version: string;
  };

  const version = packageJson.version;
  if (ci) requireReleaseTag(process.env.RELEASE_TAG, version);
  const npmTag = getNpmTag(version);
  await assertReleaseMetadata(packageJson);

  logger.info(
    `Preparing ${chalk.cyan(`${packageJson.name}@${version}`)} with npm tag ${chalk.cyan(npmTag)}.`,
  );

  await runQualityChecks();

  const stagingDirectory = await createStagingDirectory(packageJson);

  try {
    const packed = await $({
      quiet: true,
    })`npm pack ${stagingDirectory} --json --pack-destination=${stagingDirectory}`;
    const [{ filename, integrity }] = JSON.parse(packed.stdout) as {
      filename: string;
      integrity: string;
    }[];
    const tarball = path.join(stagingDirectory, filename);
    const existing = await publishedIntegrity(packageJson.name, version);
    if (existing !== undefined && !dryRun) {
      requireMatchingIntegrity(integrity, existing);
      logger.success(
        "The existing npm version matches this build; resuming GitHub Release publication",
      );
      return;
    }
    if (
      ci &&
      (!process.env.ACTIONS_ID_TOKEN_REQUEST_URL || !process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN)
    ) {
      throw new Error("GitHub Actions OIDC is unavailable; grant id-token: write.");
    }
    const publishArgs = [
      "publish",
      tarball,
      `--registry=${registry}`,
      `--tag=${npmTag}`,
      "--access=public",
      ...(ci ? ["--provenance"] : []),
      ...(dryRun ? ["--dry-run"] : []),
    ];
    await run($({ stdio: ci ? "pipe" : "inherit" })`npm ${publishArgs}`, {
      info: dryRun ? "Running npm publish dry-run" : "Publishing the package",
      success: "npm publish completed",
      error: "npm publish failed",
    });
    if (!dryRun) {
      let published: string | undefined;
      for (let attempt = 0; attempt < 5; attempt++) {
        published = await publishedIntegrity(packageJson.name, version);
        if (published !== undefined) break;
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
      requireMatchingIntegrity(integrity, published);
    }
  } finally {
    await rm(stagingDirectory, { recursive: true, force: true });
  }
}

publish().catch((error: unknown) => {
  logger.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
