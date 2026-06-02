import shared from "@mini-commerce/config/eslint.config.mjs";

export default [
  ...shared,
  {
    files: ["**/*.ts"],
    languageOptions: {
      parserOptions: {
        project: false,
      },
    },
  },
];
