/**
 * BetterGI 遮罩页面的确定性单文件构建器。
 *
 * 该脚本只管理仓库 web 目录，并校验每个入口没有外链构建资源。
 */
import { readFile, readdir, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "vite";

// 当前脚本所在目录用于解析稳定的仓库相对路径。
const scriptDirectory = dirname(fileURLToPath(import.meta.url));
// 前端工程根目录承载 Vite 配置。
const frontendDirectory = resolve(scriptDirectory, "..");
// BetterGI 实际读取的生产页面目录。
const outputDirectory = resolve(frontendDirectory, "..", "web");
// 需要逐个构建的页面名称。
const pageNames = ["commission-config", "process-editor", "path-recorder", "developer-test"];

// 校验单文件 HTML 不包含构建期外链脚本或样式。
async function verifyOutput(pageName) {
    // 当前页面唯一允许存在的生产文件。
    const htmlPath = resolve(outputDirectory, pageName, "index.html");
    // 构建后的 HTML 内容用于离线完整性检查。
    const source = await readFile(htmlPath, "utf8");
    // 页面目录条目用于阻止遗漏的资源文件进入发布包。
    const entries = await readdir(resolve(outputDirectory, pageName));
    if (entries.length !== 1 || entries[0] !== "index.html") {
        throw new Error(`${pageName} 产物必须只包含 index.html`);
    }
    if (/<script\b[^>]*\bsrc=/i.test(source) || /<link\b[^>]*rel=["']stylesheet["']/i.test(source)) {
        throw new Error(`${pageName} 仍包含外链脚本或样式`);
    }
    if (/(?:src|href)=["']https?:\/\//i.test(source) || /url\(\s*["']?https?:\/\//i.test(source)) {
        throw new Error(`${pageName} 产物包含远程资源引用`);
    }
    await writeFile(htmlPath, source.replace(/\r*\n/g, "\r\n").replace(/(?:\r\n)*$/, "\r\n"), "utf8");
}

// 清理旧产物后顺序构建四个互不依赖的单文件入口。
async function buildAll() {
    await rm(outputDirectory, { recursive: true, force: true });
    for (const pageName of pageNames) {
        await build({
            configFile: resolve(frontendDirectory, "vite.config.ts"),
            mode: pageName,
            logLevel: "info",
        });
        await verifyOutput(pageName);
    }
}

await buildAll();
