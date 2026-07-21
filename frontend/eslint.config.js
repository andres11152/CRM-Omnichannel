import globals from "globals";
import pluginJs from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";

/** @type {import('eslint').Linter.Config[]} */
export default [
  { files: ["**/*.{js,mjs,cjs,ts,tsx}"] },
  { languageOptions: { globals: { ...globals.browser, ...globals.node } } },
  pluginJs.configs.recommended,
  ...tseslint.configs.recommended,
  {
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      // The installed eslint-plugin-react-hooks (v7) ships a "recommended"
      // preset built for React 19 + the React Compiler (static-components,
      // immutability, purity, set-state-in-effect, etc.) — this app is on
      // React 18 with no Compiler, so those rules fire on ordinary,
      // non-broken React 18 patterns. Enabling just the two classic,
      // version-agnostic rules instead.
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      // Same quality gates as backend/eslint.config.mjs — one bar for the whole repo.
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
      "no-console": ["warn", { allow: ["info", "warn", "error"] }],
      "prefer-const": "error",
      "@typescript-eslint/ban-ts-comment": "warn",
    },
  },
  {
    ignores: ["dist/", "node_modules/", "coverage/", "src/bones/*.bones.json"],
  },
];
