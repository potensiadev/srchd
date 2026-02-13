import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Custom rule overrides
  {
    rules: {
      // React Compiler의 effect 내 setState 규칙을 warning으로 변경
      // 외부 상태 동기화 패턴에서 의도적으로 사용되는 경우가 있음
      "react-hooks/set-state-in-effect": "warn",
      // Date.now() 같은 시간 기반 계산은 실질적으로 필요한 패턴
      "react-hooks/purity": "warn",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Dependencies
    "node_modules/**",
    // Test files and utilities
    "tests/**",
    "workspace/**",
    // Python worker (not JS/TS)
    "apps/worker/**",
    // Scripts (one-off utilities)
    "scripts/**",
    // Skills templates (external code patterns)
    "skills/**",
    // External/generated files
    "public/**/*.mjs",
  ]),
]);

export default eslintConfig;
