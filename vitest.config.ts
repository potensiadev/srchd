import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./tests/setup.ts"],
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html", "lcov"],
      include: ["lib/**/*.ts", "app/api/**/*.ts"],
      exclude: ["node_modules", "tests", "**/*.d.ts", "**/*.test.ts"],
      // CI에서 실패하도록 최소 커버리지 임계값 설정
      thresholds: {
        // P0 단계: 현재 수준에서 시작, 점진적으로 상향 예정
        // 현재: ~10% → 목표: P1 20% → P2 40%
        lines: 10,
        functions: 15,
        branches: 5,
        statements: 10,
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./"),
    },
  },
});
