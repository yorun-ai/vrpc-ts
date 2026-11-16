import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
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
  "pnpm@12.5.1",
  "the repository package manager version must remain reproducible",
);

for (const entrypoint of [".", "./client", "./http", "./protocol"]) {
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

const isolated = spawnSync(
  process.execPath,
  [
    "--input-type=module",
    "-e",
    `
  import assert from 'node:assert/strict';
  import { createRequire } from 'node:module';
  void globalThis.Headers; void globalThis.Response;
  for (const key of ['fetch','Headers','Response','Request','XMLHttpRequest','TextEncoder','TextDecoder','Blob','FormData']) globalThis[key] = undefined;
  const require = createRequire(import.meta.url);
  for (const protocol of [await import('@yorun-ai/vrpc/protocol'), require('@yorun-ai/vrpc/protocol')]) {
    const headers = protocol.buildVrpcHeaderRecord({clientInfo:{clientName:'miniapp',clientVersion:'1.0.0',clientInstanceId:'11111111-1111-4111-8111-111111111111'},trace:{id:protocol.generateVrpcId()}});
    headers['vrpc-status']='OK'; headers['vrpc-server']=headers['vrpc-client'];
    assert.equal(await protocol.decodeVrpcResponse({status:200,headers,text:()=>JSON.stringify({result:'中文🙂',error:null}),arrayBuffer:()=>new ArrayBuffer(0)}),'中文🙂');
    assert.equal(globalThis.fetch,undefined); assert.equal(globalThis.Headers,undefined); assert.equal(globalThis.Response,undefined);
  }
`,
  ],
  { cwd: packageRoot, encoding: "utf8" },
);
assert.equal(isolated.status, 0, isolated.stderr || isolated.stdout);
process.stdout.write("Built ESM/CommonJS protocol entries work without browser globals.\n");
