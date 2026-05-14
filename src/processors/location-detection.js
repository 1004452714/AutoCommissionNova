/**
 * 地址检测步骤处理器
 * 支持的数据格式: {x, y, tolerance?}
 *   - x: number (浮点数) - 目标X坐标
 *   - y: number (浮点数) - 目标Y坐标
 *   - tolerance: number (浮点数) - 容差范围，默认 15，可选
 */
import { calculateDistance } from "../navigation/index.js";
import { findCommissionTarget } from "../navigation/index.js";
import { loadNpcProcessFile } from "../core/npc-executor.js";

export function register(registry) {
    registry.register("地址检测", async function(step, context) {
        try {
            log.info("执行地址检测");

            // 验证数据格式必须为对象
            if (!step.data || typeof step.data !== 'object' || Array.isArray(step.data)) {
                log.error("地址检测步骤必须使用对象格式: {x, y, tolerance?}");
                return;
            }

            const targetX = step.data.x;
            const targetY = step.data.y;
            const tolerance = step.data.tolerance ?? 15;
            const executeFile = step.run;

            // 类型校验
            if (typeof targetX !== 'number' || typeof targetY !== 'number') {
                log.error("地址检测坐标 x 和 y 必须是数字类型");
                return;
            }

            if (typeof tolerance !== 'number') {
                log.error("地址检测参数 tolerance 必须是数字类型");
                return;
            }

            log.info("地址检测: 目标({x}, {y}), 容差: {tolerance}", targetX, targetY, tolerance);

            try {
                const commissionTarget = await findCommissionTarget(context.commissionName);
                if (commissionTarget) {
                    const distance = calculateDistance(commissionTarget, { x: targetX, y: targetY });
                    log.info("地址检测 - 委托位置: ({x}, {y}), 目标位置: ({tx}, {ty}), 距离: {d}",
                        commissionTarget.x, commissionTarget.y, targetX, targetY, distance);

                    if (distance < tolerance) {
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
                    } else {
                        log.info("地址检测失败，距离过远: {distance}", distance);
                        context.locationDetected = false;
                    }
                } else {
                    log.warn("无法获取委托目标位置，跳过地址检测");
                    context.locationDetected = false;
                }
            } catch (error) {
                log.error("地址检测时出错: {error}", error.message);
                context.locationDetected = false;
                throw error;
            }
        } catch (error) {
            log.error("执行地址检测步骤时出错: {error}", error.message);
            throw error;
        }
    });
}
