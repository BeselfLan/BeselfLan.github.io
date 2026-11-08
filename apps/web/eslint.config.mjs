import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import prettier from "eslint-config-prettier/flat";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "playwright-report/**",
    "test-results/**",
    "coverage/**",
  ]),
  {
    // Plan 3.4: only src/os may import the store. An app reaches the OS through
    // AppApi, so the OS can change without touching apps. The pattern catches
    // "@/os/store", "@/os/store/windows" and "../../os/store".
    files: ["src/apps/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              regex: "(^@/|/)os/store(/|$)",
              message: "Apps reach the OS only through AppApi (plan 3.4).",
            },
          ],
        },
      ],
    },
  },
  prettier,
]);

export default eslintConfig;
