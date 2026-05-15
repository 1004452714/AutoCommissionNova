/**
 * 地址检测步骤处理器
 * data: {x: number, y: number, tolerance?: number=15}
 * step.run（可选）: 命中目标位置后加载追加的子流程文件名（仅 NPC 上下文 splice 后续 step 才生效）
 */
import { calculateDistance, findCommissionTarget } from "../navigation/index.js";
import { loadNpcProcessFile } from "../loaders/index.js";
import { defineStep } from "./define-step.js";

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

        log.info("地址检测: 目标({x}, {y}), 容差: {tolerance}", targetX, targetY, tolerance);

        const commissionTarget = await findCommissionTarget(context.commissionName);
        if (!commissionTarget) {
            log.warn("无法获取委托目标位置，跳过地址检测");
            context.locationDetected = false;
            return;
        }

        const distance = calculateDistance(commissionTarget, { x: targetX, y: targetY });
        log.info("地址检测 - 委托位置: ({x}, {y}), 目标位置: ({tx}, {ty}), 距离: {d}",
            commissionTarget.x, commissionTarget.y, targetX, targetY, distance);

        if (distance >= tolerance) {
            log.info("地址检测失败，距离过远: {distance}", distance);
            context.locationDetected = false;
            return;
        }

        log.info("地址检测成功，距离在容差范围内");
        if (executeFile) {
            log.info("加载并执行后续步骤文件: {file}", executeFile);
            try {
                const nextSteps = await loadNpcProcessFile(context.commissionName, context.location, executeFile);
                if (nextSteps && nextSteps.length > 0) {
                    context.processSteps.splice(context.currentIndex + 1, 0, ...nextSteps);
                    log.info("已插入 {count} 个后续步骤", nextSteps.length);
                }
            } catch (fileError) {
                log.error("加载后续步骤文件失败: {error}", fileError.message);
            }
        }
        context.locationDetected = true;
        context.detectedPosition = commissionTarget;
    },
});
