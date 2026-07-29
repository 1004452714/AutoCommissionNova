import eslint from "@eslint/js";
import tseslint from "typescript-eslint";
import pluginVue from "eslint-plugin-vue";
import globals from "globals";

// 前端源码与工具脚本共用的 ESLint 平面配置。
const config = [
    { ignores: ["node_modules/**", "../web/**"] },
    eslint.configs.recommended,
    ...tseslint.configs.recommended,
    ...pluginVue.configs["flat/recommended"],
    {
        files: ["**/*.{ts,vue}"],
        languageOptions: {
            globals: {
                ...globals.browser,
                ...globals.node,
            },
            parserOptions: {
                parser: tseslint.parser,
                extraFileExtensions: [".vue"],
            },
        },
        rules: {
            "vue/multi-word-component-names": "off",
            "vue/max-attributes-per-line": "off",
            "vue/html-self-closing": "off",
            "vue/html-indent": "off",
            "vue/singleline-html-element-content-newline": "off",
            "@typescript-eslint/no-explicit-any": "error",
        },
    },
];

export default config;
