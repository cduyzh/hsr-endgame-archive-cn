import js from "@eslint/js"
import pluginVue from "eslint-plugin-vue"
import tseslint from "typescript-eslint"

export default [
  {
    ignores: ["dist", "node_modules", "coverage", ".netlify", "vite.config.ts.timestamp-*.mjs"],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...pluginVue.configs["flat/recommended"],
  {
    files: ["**/*.vue"],
    languageOptions: {
      parserOptions: {
        parser: tseslint.parser,
      },
    },
  },
  {
    rules: {
      "vue/multi-word-component-names": "off",
      "vue/no-v-html": "error",
      "@typescript-eslint/no-explicit-any": "error",
    },
  },
  {
    // scripts/*.mjs 是 Node 24 脚本（可带 .ts 后缀的 ESM import），不强制 TypeScript 风格。
    // `process` 等 globals 由各 .mjs 文件首行 `/* global process */` 声明，避免重复。
    // fetch/URL 在 ecmaVersion 2024 + sourceType module 下默认可用。
    files: ["scripts/**/*.mjs"],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: "module",
      globals: {
        Buffer: "readonly",
      },
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": "off",
      "no-unused-vars": "off",
    },
  },
]
