/// <reference types="vitest" />

import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    include: ["tests/unit/**/*.test.ts", "tests/integration/**/*.test.ts"],
    exclude: [
      "node_modules/**",
      "tests/e2e/**",
      "tests/e2e/**/*.spec.ts",
    ],
    globals: true,
    environment: "node",
  },
});
