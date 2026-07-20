import path from "node:path";

import { argv, chalk, fs } from "zx";

import { getNextVersion, type VersionType, versionTypes } from "./release-package";
import { logger } from "./run";
import { updateVersionFile } from "./update-version";

const packageJsonPath = path.join(process.cwd(), "package.json");

function parseVersionType(type: unknown): VersionType {
  if (typeof type !== "string" || !versionTypes.includes(type as VersionType)) {
    throw new Error(
      `Invalid or missing version type: ${String(type)}. Expected ${versionTypes.join(", ")}.`,
    );
  }

  return type as VersionType;
}

async function versionPackage() {
  const type = parseVersionType(argv.type);
  const stage = argv.stage;

  if (stage !== undefined && stage !== "alpha") {
    throw new Error(`Invalid version stage: ${String(stage)}. Expected alpha.`);
  }

  const packageJson = (await fs.readJson(packageJsonPath)) as { version: string };
  const nextVersion = getNextVersion(packageJson.version, { type, stage });

  await updateVersionFile(packageJsonPath, nextVersion);
  logger.success(
    `Updated the version from ${chalk.cyan(packageJson.version)} to ${chalk.cyan(nextVersion)}. Commit package.json before publishing.`,
  );
}

versionPackage().catch((error: unknown) => {
  logger.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
