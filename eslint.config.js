import js from "@eslint/js";

export default [
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: {
        // Browser globals
        window: "readonly",
        document: "readonly",
        console: "readonly",
        fetch: "readonly",
        EventSource: "readonly",
        URLSearchParams: "readonly",
        URL: "readonly",
        requestAnimationFrame: "readonly",
        cancelAnimationFrame: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
        FileReader: "readonly",
        navigator: "readonly",
        history: "readonly",
        btoa: "readonly",
        atob: "readonly",
        TextEncoder: "readonly",
        TextDecoder: "readonly",
        CompressionStream: "readonly",
        DecompressionStream: "readonly",
        Uint8Array: "readonly",
      },
    },
    rules: {
      "no-unused-vars": ["warn", {
        argsIgnorePattern: "^_",
        caughtErrorsIgnorePattern: "^_",
      }],
    },
  },
  {
    files: ["server.js", "vite-plugin-graph-api.js"],
    languageOptions: {
      globals: {
        // Node globals for the Vite plugin
        process: "readonly",
        Buffer: "readonly",
      },
    },
  },
  {
    files: ["test/**/*.js"],
    languageOptions: {
      globals: {
        // Node globals for tests
        process: "readonly",
      },
    },
  },
  {
    ignores: ["dist/**", "node_modules/**"],
  },
];
