import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  // Same automatic JSX runtime as Next.js, so components can be rendered in tests.
  esbuild: { jsx: "automatic" },
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
