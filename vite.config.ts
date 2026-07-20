/// <reference types="vitest/config" />
import { fileURLToPath, URL } from "node:url";

import { defineConfig } from "vite";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    include: ["test/**/*.test.ts"],
  },
  resolve: {
    alias: {
      src: fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  build: {
    lib: {
      entry: {
        client: fileURLToPath(new URL("./src/entrypoints/client.ts", import.meta.url)),
        http: fileURLToPath(new URL("./src/entrypoints/http.ts", import.meta.url)),
      },
      name: "Vrpc",
      formats: ["es", "cjs"],
      fileName: (format, entry) => (format === "cjs" ? `${entry}.cjs` : `${entry}.${format}.js`),
    },
    emptyOutDir: true,
    sourcemap: false,
    minify: false,
  },
});
