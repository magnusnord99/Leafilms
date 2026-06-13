import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

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
  ]),
  {
    rules: {
      // Appen bruker klientside datahenting i useEffect (fetchX() som setter
      // loading/data-state) gjennomgående. Den nye React Compiler-regelen
      // flagger alle slike kall som error. Nedgradert til warning til vi
      // ev. flytter datahenting til server components / en data-bibliotek.
      "react-hooks/set-state-in-effect": "warn",
      // Tillat omit-mønsteret `const { id, ...rest } = obj` og bevisst
      // ubrukte parametre/variabler med _-prefiks.
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          ignoreRestSiblings: true,
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrors: "none",
        },
      ],
    },
  },
]);

export default eslintConfig;
