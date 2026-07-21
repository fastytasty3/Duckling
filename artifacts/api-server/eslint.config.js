import js from "@eslint/js";
import tsPlugin from "@typescript-eslint/eslint-plugin";
import tsParser from "@typescript-eslint/parser";

/** @type {import("eslint").Linter.FlatConfig[]} */
export default [
  js.configs.recommended,
  {
    files: ["src/**/*.ts"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        project: "./tsconfig.json",
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      "@typescript-eslint": tsPlugin,
    },
    rules: {
      // TypeScript recommended
      ...tsPlugin.configs.recommended.rules,

      // Security: no console.log in prod code (use pino logger)
      "no-console": "warn",

      // Catch common bugs
      "no-unused-vars": "off",
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-floating-promises": "error",

      // Prevent accidental secret logging
      "no-restricted-syntax": [
        "error",
        {
          selector: "CallExpression[callee.property.name='log'] > Literal[value=/password|token|secret|hash/i]",
          message: "Do not log sensitive data",
        },
      ],
    },
  },
  {
    // Relax rules for test files
    files: ["src/__tests__/**/*.ts"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "no-console": "off",
    },
  },
  {
    ignores: ["dist/**", "node_modules/**"],
  },
];
