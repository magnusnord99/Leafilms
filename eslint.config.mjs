import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next. `**/`-prefiks er nødvendig for at disse
    // også skal treffe build-output i nestede git worktrees (f.eks. .worktrees/*/.next/**) —
    // uten prefiks er mønsteret rot-forankret og lar worktree-output slippe gjennom.
    "**/.next/**",
    "**/out/**",
    "**/build/**",
    "next-env.d.ts",
    // Nestede git worktrees (egne full-checkouts brukt for isolert feature-arbeid) —
    // deres kildekode skal lintes i sin egen sesjon/branch, ikke telle med her.
    ".worktrees/**",
    ".claude/worktrees/**",
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
