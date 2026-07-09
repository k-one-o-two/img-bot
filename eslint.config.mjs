import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";
import { defineConfig } from "eslint/config";

export default defineConfig([
  {
    files: ["**/*.{js,mjs,cjs}"],
    plugins: { js },
    extends: ["js/recommended"],
    languageOptions: { globals: globals.node },
  },
  ...tseslint.configs.recommended.map((config) => ({
    ...config,
    files: ["**/*.ts"],
    languageOptions: {
      ...(config.languageOptions ?? {}),
      globals: { ...globals.node, ...(config.languageOptions?.globals ?? {}) },
    },
  })),
  {
    ignores: ["dist/**", "node_modules/**", "output/**", "square/**"],
  },
]);
