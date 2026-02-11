import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src-electron/__tests__/**/*.test.ts"],
    environment: "node",
  },
});
