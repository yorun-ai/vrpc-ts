import { access, cp, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import SimpleGit from "simple-git";
import { $, argv, chalk, fs } from "zx";

import { createPublishManifest, getNpmTag, publishFiles, registry } from "./release-package";
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
    logger.info("Dry-run mode allows local uncommitted release preparation changes");
    return;
  }

  await run(assertCleanWorkingTree(), {
    info: "Checking the working directory",
    success: "The working directory is clean",
    error: "The working directory must be clean before pulling or publishing",
  });

  if (ci) {
    if (process.env.GITHUB_ACTIONS !== "true") {
      throw new Error("CI publishing is only supported from GitHub Actions.");
    }
    if (process.env.GITHUB_REF !== "refs/heads/main") {
      throw new Error(
        `CI publishing requires the main branch, received ${process.env.GITHUB_REF}.`,
      );
    }

    const head = (await git.revparse(["HEAD"])).trim();
    const originMain = (await git.revparse(["refs/remotes/origin/main"])).trim();
    if (head !== originMain) {
      throw new Error("The release commit must be the current origin/main commit.");
    }

    logger.success("The GitHub Actions checkout matches origin/main");
    return;
  }

  await run(git.raw(["pull", "--ff-only"]), {
    info: "Pulling the latest changes from the remote repository",
    success: "The latest changes have been pulled from the remote repository",
    error: "Failed to pull the latest changes from the remote repository",
  });

  await run(assertCleanWorkingTree(), {
    info: "Checking the working directory after pulling",
    success: "The working directory is still clean",
    error: "Pulling introduced uncommitted changes",
  });

  await run(git.push(), {
    info: "Pushing the release commit to the remote repository",
    success: "The release commit is available in the remote repository",
    error: "Failed to push the release commit to the remote repository",
  });
}

async function assertTagIsAvailable(tag: string) {
  const localTags = await git.tags();
  if (localTags.all.includes(tag)) {
    throw new Error(`Git tag ${tag} already exists locally.`);
  }

  const tagRef = `refs/tags/${tag}`;
  const remoteTag = await git.listRemote(["--tags", "origin", tagRef]);
  if (remoteTag.trim().length > 0) {
    throw new Error(`Git tag ${tag} already exists on origin.`);
  }
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

async function assertAuthenticated(registry: string) {
  if (ci) {
    if (!process.env.ACTIONS_ID_TOKEN_REQUEST_URL || !process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN) {
      throw new Error(
        "GitHub Actions OIDC is unavailable. Grant the workflow id-token: write permission.",
      );
    }

    logger.success(
      process.env.NODE_AUTH_TOKEN
        ? "GitHub Actions OIDC and the bootstrap npm token are available"
        : "GitHub Actions OIDC is available for npm trusted publishing",
    );
    return;
  }

  if (!process.env.NPM_CONFIG_USERCONFIG) {
    throw new Error("Set NPM_CONFIG_USERCONFIG to the npm userconfig used for publishing.");
  }

  await run($`npm whoami --registry=${registry}`, {
    info: `Verifying npm authentication for ${registry}`,
    success: (response) => `Authenticated as ${chalk.cyan(String(response).trim())}`,
    error: `Not authenticated with ${registry}`,
  });
}

async function assertVersionIsAvailable(name: string, version: string, registry: string) {
  const result = await $({
    quiet: true,
    nothrow: true,
  })`npm view ${`${name}@${version}`} version --registry=${registry}`;

  if (result.exitCode === 0) {
    throw new Error(`${name}@${version} already exists on ${registry}.`);
  }

  if (!result.stderr.includes("E404")) {
    throw new Error(`Unable to check ${name}@${version} on ${registry}: ${result.stderr.trim()}`);
  }
}

async function publish() {
  await prepareGit();

  const packageJson = (await fs.readJson(packageJsonPath)) as Record<string, unknown> & {
    name: string;
    version: string;
  };

  const version = packageJson.version;
  if (ci && process.env.RELEASE_VERSION !== version) {
    throw new Error(
      `Requested release ${String(process.env.RELEASE_VERSION)} does not match package.json version ${version}.`,
    );
  }
  const npmTag = getNpmTag(version);
  const tag = `v${version}`;

  await assertReleaseMetadata(packageJson);
  await assertTagIsAvailable(tag);

  logger.info(
    `Preparing ${chalk.cyan(`${packageJson.name}@${version}`)} with npm tag ${chalk.cyan(npmTag)}.`,
  );

  await runQualityChecks();
  await assertAuthenticated(registry);
  await assertVersionIsAvailable(packageJson.name, version, registry);

  const stagingDirectory = await createStagingDirectory(packageJson);

  try {
    const publishArgs = [
      "publish",
      stagingDirectory,
      `--registry=${registry}`,
      `--tag=${npmTag}`,
      "--access=public",
      ...(ci ? ["--provenance"] : []),
      ...(dryRun ? ["--dry-run"] : []),
    ];

    await run($`npm ${publishArgs}`, {
      info: dryRun ? "Running npm publish dry-run" : "Publishing the package",
      success: dryRun
        ? "The npm publish dry-run completed successfully"
        : `${packageJson.name}@${version} was published to ${registry}`,
      error: dryRun ? "The npm publish dry-run failed" : "Failed to publish the package",
    });
  } finally {
    await rm(stagingDirectory, { recursive: true, force: true });
  }

  if (dryRun) {
    return;
  }

  try {
    await git.addTag(tag);
  } catch (error) {
    throw new Error(
      `${packageJson.name}@${version} was published, but local Git tag ${tag} could not be created. Inspect the repository state, create the tag at the release commit, and push refs/tags/${tag}. ${String(error)}`,
    );
  }

  try {
    await git.push("origin", `refs/tags/${tag}`);
  } catch (error) {
    throw new Error(
      `${packageJson.name}@${version} was published and local Git tag ${tag} was created, but the tag could not be pushed. Resolve remote access and run: git push origin refs/tags/${tag}. ${String(error)}`,
    );
  }

  logger.success(`Created and pushed Git tag ${chalk.cyan(tag)}`);
}

publish().catch((error: unknown) => {
  logger.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
