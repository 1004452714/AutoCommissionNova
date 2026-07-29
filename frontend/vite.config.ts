import { fileURLToPath, URL } from "node:url";
import { resolve } from "node:path";
import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import { viteSingleFile } from "vite-plugin-singlefile";

// BetterGI 独立加载的四个页面入口。
const PAGE_NAMES = ["commission-config", "process-editor", "path-recorder", "developer-test"] as const;

/** 为当前模式建立单入口、单文件的 Vite 配置。 */
export default defineConfig(({ command, mode }) => {
    // 未显式指定时使用委托配置页，保证直接运行 vite 仍可开发。
    const pageName = PAGE_NAMES.includes(mode as (typeof PAGE_NAMES)[number]) ? mode : "commission-config";
    // 前端工程根目录用于开发服务器解析共享源码。
    const frontendRoot = fileURLToPath(new URL(".", import.meta.url));
    // 每个生产入口拥有自己的 HTML 根目录。
    const entryRoot = resolve(frontendRoot, "entries", pageName);
    // 生产文件写入仓库统一的 web 运行目录。
    const outputRoot = resolve(fileURLToPath(new URL(".", import.meta.url)), "..", "web", pageName);

    return {
        root: command === "serve" ? frontendRoot : entryRoot,
        base: "./",
        plugins: [vue(), ...(command === "build" ? [viteSingleFile({ removeViteModuleLoader: true })] : [])],
        resolve: {
            alias: {
                "@": fileURLToPath(new URL("./src", import.meta.url)),
            },
        },
        build: {
            outDir: outputRoot,
            emptyOutDir: false,
            sourcemap: false,
            assetsInlineLimit: Number.MAX_SAFE_INTEGER,
            cssCodeSplit: false,
        },
        server: {
            open: `/entries/${pageName}/`,
        },
    };
});
