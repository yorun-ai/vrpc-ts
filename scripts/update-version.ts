import { fs } from "zx";

export async function updateVersionFile(versionFilePath: string, version: string) {
  const originalPackageJson = await fs.readJson(versionFilePath);

  const updatedPackageJson = { ...originalPackageJson };
  updatedPackageJson.version = version;

  await fs.writeJson(versionFilePath, updatedPackageJson, { spaces: 2 });

  return function revertVersion() {
    return fs.writeJson(versionFilePath, originalPackageJson, { spaces: 2 });
  };
}
