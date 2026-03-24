import tseslint from 'typescript-eslint';

export default tseslint.config(
    {
        ignores: ["**/dist/"],
    },
    ...tseslint.configs.recommended,
    {
        files: ["**/*.js"],
        rules: {
            "no-console": "warn",
            "no-unused-vars": "off",
            "@typescript-eslint/no-unused-vars": ["error", { 
                "argsIgnorePattern": "^_",
                "varsIgnorePattern": "^_",
                "caughtErrorsIgnorePattern": "^_"
            }],
        },
        languageOptions: {
            parserOptions: {
                project: true,
                tsconfigRootDir: import.meta.dirname,
            },
        },
    }
);
