// eslint-config-next (v15+) ships native flat configs, so we import them
// directly instead of going through FlatCompat/@eslint/eslintrc — the compat
// path crashes under ESLint 9 ("Converting circular structure to JSON") when it
// tries to schema-validate the bundled eslint-plugin-react config.
import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

const eslintConfig = [
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    ignores: [".next/**", "node_modules/**"],
  },
  {
    // This app is written throughout with a few idioms that the default Next +
    // TypeScript ruleset flags as errors: `any` at API boundaries (the
    // `api<T = any>` client, `useState<any>` for server shapes), data-loading
    // effects that call a loader on mount (`useEffect(() => { load() }, [load])`),
    // and plain apostrophes in copy. These are deliberate house style, not bugs,
    // so they are warnings here — visible, but not a wall that blocks `next build`.
    rules: {
      "@typescript-eslint/no-explicit-any": "warn",
      "react-hooks/set-state-in-effect": "warn",
      "react/no-unescaped-entities": "warn",
    },
  },
];

export default eslintConfig;
