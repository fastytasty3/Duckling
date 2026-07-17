import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    testTimeout: 30000,
    hookTimeout: 30000,
    sequence: { concurrent: false }, // auth tests are stateful — run serially
    reporters: ["verbose"],
  },
  resolve: {
    alias: {
      "@workspace/db": path.resolve("../../lib/db/src"),
      "@workspace/api-zod": path.resolve("../../lib/api-zod/src"),
    },
  },
});
