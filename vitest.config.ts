import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["lib/**/*.test.ts", "app/**/*.test.ts", "components/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "@": path.resolve(process.cwd()),
    },
  },
});
