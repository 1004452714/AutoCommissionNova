/**
 * 自定义脚本步骤处理器
 *
 * data: { path: string }
 *   path — 脚本文件相对路径，由 context.resolveResource 解析为绝对路径
 *          NPC 委托：相对 process/蒙德/NPC/{commissionName}/{location}/
 *          Basic 委托：相对 {processDir}
 *
 * 脚本文件约定：内容是一个函数表达式，例如
 *   return async (ctx) => {
 *       ctx.log.info("自定义逻辑，参数: {p}", ctx.data.xxx);
 *       await ctx.sleep(500);
 *   };
 *
 * 执行时用 new Function(code)() 得到该函数并调用，ctx 仅注入脚本拿不到的非全局内容：
 *   { data: step.data, context }
 * log / sleep / keyPress / keyDown / keyUp / leftButtonClick / click / BvPage 等宿主全局
 * 在 new Function 创建的函数里天然可用，无需注入；context 上的方法（如 resolveResource）
 * 可通过 ctx.context.resolveResource 取。
 *
 * 注意：项目为 ESM 且不支持 import()，故用户脚本不能使用 export，只能用上述函数表达式形式。
 */
import { defineStep } from "./define-step.js";
import { isCancellationError } from "../utils/error-utils.js";

export default defineStep({
    type: "自定义脚本",
    category: "流程控制",
    dataSpec: {
        kind: "object",
        fields: {
            path: { type: "string", label: "脚本文件", required: true, nonEmpty: true, resource: "process" },
        },
    },
    run: async (step, context) => {
        try {
            const fullPath = context.resolveResource(step.data.path);
            log.info("执行自定义脚本: {path}", fullPath);

            const code = file.readTextSync(fullPath);

            // 约定：文件内容为函数表达式，如 return async (ctx) => { ... }
            const factory = new Function(code);
            const fn = factory();
            if (typeof fn !== "function") {
                throw new Error("自定义脚本必须 return 一个函数: " + fullPath);
            }

            // 只注入脚本拿不到的、非全局的东西：step.data 与委托上下文。
            // log / sleep / keyPress / BvPage 等宿主全局在 new Function 创建的作用域里天然可用，无需注入。
            const ctx = {
                data: step.data,
                context,
            };

            await fn(ctx);
            log.info("自定义脚本执行完成: {path}", step.data.path);
        } catch (error) {
            if (isCancellationError(error)) { throw error; }
            log.error("执行自定义脚本时出错: {error}", error.message);
            throw error;
        }
    },
});
