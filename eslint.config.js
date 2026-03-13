import tseslint from 'typescript-eslint';

export default tseslint.config(
    ...tseslint.configs.recommended,
    {
        files: ["**/*.js"],
        rules: {
            "no-console": "warn",
            "no-unused-vars": ["error", { "argsIgnorePattern": "^_" }],
        },
        languageOptions: {
            parserOptions: {
                project: true,
                tsconfigRootDir: import.meta.dirname,
            },
        },
    }
);
