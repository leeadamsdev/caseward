import js from "@eslint/js";
import { defineConfig, globalIgnores } from "eslint/config";
import prettier from "eslint-config-prettier/flat";
import reactHooks from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";

export default defineConfig(
    globalIgnores([
        "build/**",
        ".react-router/**",
        "playwright-report/**",
        "test-results/**",
    ]),
    {
        files: ["**/*.{ts,tsx}"],
        extends: [js.configs.recommended, tseslint.configs.strictTypeChecked],
        languageOptions: {
            parserOptions: {
                projectService: true,
                tsconfigRootDir: import.meta.dirname,
            },
        },
    },
    {
        files: ["**/*.tsx"],
        extends: [reactHooks.configs.flat.recommended],
    },
    {
        files: ["**/*.mjs"],
        extends: [js.configs.recommended],
    },
    prettier,
);
