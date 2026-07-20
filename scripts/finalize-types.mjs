import { copyFile, rm } from "node:fs/promises";
import path from "node:path";

const outputDirectory = path.join(process.cwd(), "dist");

for (const entrypoint of ["client", "http"]) {
  await copyFile(
    path.join(outputDirectory, `${entrypoint}.d.ts`),
    path.join(outputDirectory, `${entrypoint}.d.cts`),
  );
  await rm(path.join(outputDirectory, `${entrypoint}.runtime.d.ts`), { force: true });
}
