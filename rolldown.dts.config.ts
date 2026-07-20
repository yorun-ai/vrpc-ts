import { defineConfig, type RolldownOptions } from "rolldown";
import { dts } from "rolldown-plugin-dts";

const entrypoints = {
  client: "./src/entrypoints/client.ts",
  http: "./src/entrypoints/http.ts",
};

export default defineConfig(
  Object.entries(entrypoints).map(
    ([name, input]): RolldownOptions => ({
      input,
      plugins: dts({
        emitDtsOnly: true,
        generator: "tsgo",
        tsconfig: "./tsconfig.build.json",
      }),
      output: {
        dir: "./dist",
        format: "es",
        codeSplitting: false,
        entryFileNames: (chunk) =>
          chunk.facadeModuleId?.endsWith(".d.ts") ? `${name}.d.ts` : `${name}.runtime.d.ts`,
      },
    }),
  ),
);
