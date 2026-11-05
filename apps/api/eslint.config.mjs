import { defineConfig, globalIgnores } from "eslint/config";
import tseslint from "typescript-eslint";
import prettier from "eslint-config-prettier/flat";

export default defineConfig(
  globalIgnores(["dist/**"]),
  tseslint.configs.recommended,
  prettier,
);
