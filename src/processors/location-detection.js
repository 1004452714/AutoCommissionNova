/**
 * 地址检测步骤处理器
 * data: {x: number, y: number, tolerance?: number=15}
 * step.run（可选）: 命中目标位置后加载追加的子流程文件名（仅 NPC 上下文 splice 后续 step 才生效）
 */
import { loadNpcProcessFile } from "../loaders/index.js";
import { defineStep } from "./define-step.js";
import { detectCommissionLocation } from "./commission-loc-utils.js";

export default defineStep({
    type: "地址检测",
    schema: {
        x: "number",
        y: "number",
        tolerance: { type: "number", default: 15 },
    },
    run: async (step, context) => {
        const { x: targetX, y: targetY, tolerance } = step.data;
        const executeFile = step.run;

        const matched = await detectCommissionLocation(
            { x: targetX, y: targetY, tolerance },
            context,
            "地址检测"
        );
        if (!matched) {
            return;
        }

        if (executeFile) {
            log.info("加载并执行后续步骤文件: {file}", executeFile);
            try {
                const nextSteps = await loadNpcProcessFile(context.commissionName, context.location, executeFile);
                if (nextSteps && nextSteps.length > 0) {
                    context.insertSubSteps(nextSteps);
                    log.info("已插入 {count} 个后续步骤", nextSteps.length);
                }
            } catch (fileError) {
                log.error("加载后续步骤文件失败: {error}", fileError.message);
            }
        }
    },
});
