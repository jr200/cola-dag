import { readFileSync } from "node:fs";
import { defineConfig } from "vite";
import graphApiPlugin from "./vite-plugin-graph-api.js";

var pkg = JSON.parse(readFileSync("./package.json", "utf-8"));

export default defineConfig({
  root: ".",
  base: "./",
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    minify: "esbuild",
    rollupOptions: {
      output: {
        manualChunks: {
          three: ["three"],
          d3: ["d3"],
          webcola: ["webcola"],
        },
      },
    },
  },
  plugins: [graphApiPlugin()],
  test: {
    environment: "node",
  },
});
