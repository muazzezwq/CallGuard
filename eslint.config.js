import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import jsxA11y from "eslint-plugin-jsx-a11y";
import globals from "globals";

// Every rule that a recommended preset ships as "error" is demoted to "warn",
// except the correctness rules listed below and react-hooks/rules-of-hooks.
// Rationale: SPEC_8 item 1 — existing violations are warnings, not gates.
function demoteErrorsToWarn(config) {
  const out = {};
  for (const [name, value] of Object.entries(config?.rules ?? {})) {
    const severity = Array.isArray(value) ? value[0] : value;
    if (severity === 2 || severity === "error") {
      out[name] = Array.isArray(value) ? ["warn", ...value.slice(1)] : "warn";
    }
  }
  return out;
}

const jsxA11yFlat = Array.isArray(jsxA11y.flatConfigs.recommended)
  ? jsxA11y.flatConfigs.recommended
  : [jsxA11y.flatConfigs.recommended];

const recommendedConfigs = [
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...jsxA11yFlat,
];

const demotedRules = Object.assign({}, ...recommendedConfigs.map(demoteErrorsToWarn));

// Kept as errors: correctness rules that indicate a real bug, not a style nit.
const correctnessRules = {
  "no-unreachable": "error",
  "no-dupe-keys": "error",
  "no-dupe-args": "error",
  "no-dupe-else-if": "error",
  "no-constant-condition": "error",
  "no-self-assign": "error",
  "use-isnan": "error",
  "valid-typeof": "error",
  "no-unsafe-negation": "error",
  "no-obj-calls": "error",
  "no-sparse-arrays": "error",
  "no-func-assign": "error",
  "no-cond-assign": "error",
  "no-empty-pattern": "error",
  "@typescript-eslint/no-unused-expressions": "warn",
};

export default tseslint.config(
  {
    ignores: [
      "dist/**",
      "app/**",
      "node_modules/**",
      "contracts/**",
      "lib/**",
      "subgraph/**",
      "x402-facilitator/**",
      "api/**",
      "scripts/**",
    ],
  },
  ...recommendedConfigs,
  {
    files: ["src/**/*.{ts,tsx}"],
    languageOptions: {
      globals: { ...globals.browser },
    },
    plugins: {
      "react-hooks": reactHooks,
    },
    rules: {
      ...demotedRules,
      ...correctnessRules,
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
    },
  }
);
