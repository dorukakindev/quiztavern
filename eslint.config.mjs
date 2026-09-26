import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";

// §7.15 — ESLint flat config. Repo-boyu format turu açık PR'ları çakıştıracağı
// için kural seti "recommended"da tutuldu; ağırlaştırma ayrı bir turda yapılır.
export default tseslint.config(
  { ignores: ["**/dist/**", "**/node_modules/**", "**/coverage/**", "client/public/**", "client/src/_legacy/**"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.js", "**/*.mjs", "**/*.cjs"],
    languageOptions: { globals: { ...globals.node } },
    rules: {
      // tools/ altındaki yardımcılar CJS kalır.
      "@typescript-eslint/no-require-imports": "off",
    },
  },
  {
    files: ["**/*.ts", "**/*.tsx"],
    rules: {
      // Ölü kod ve sürüklenmeler erken görünsün (§7.15'in asıl hedefi).
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "@typescript-eslint/no-explicit-any": "warn",
      // Test scriptleri ve dosya-kökü script'ler boş bloklara bilinçli izin verir.
      "no-empty": ["warn", { allowEmptyCatch: true }],
    },
  },
  {
    // Hook kuralları: kaynaktaki `eslint-disable react-hooks/...` yorumları
    // bu eklenti yokken "tanımsız kural" hatası verip lint'i kırıyordu.
    files: ["client/src/**/*.{ts,tsx}"],
    plugins: { "react-hooks": reactHooks },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
    },
  },
);
