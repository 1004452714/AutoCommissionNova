/**
 * Basic委托执行模块
 * 采用流程步骤驱动方式执行Basic委托
 */
import { COMMISSION_TYPE } from "../config/index.js";
import { findNearestBasicProcess } from "./basic-process-matcher.js";
import { loadBasicProcess } from "../loaders/index.js";
import { trackCommission } from "../navigation/index.js";
import { createCommissionContext, runStepsWithContext } from "./commission-context.js";

/**
 * 执行Basic委托
 * @param {Object} commission - 委托对象
 * @param {Object} stepRegistry - 步骤处理器注册表
 * @returns {Promise<Object>} 包含 success 和 context 的对象
 */
export async function executeBasicCommission(commission, stepRegistry) {
    try {
        const matched = await findNearestBasicProcess(
            commission.name,
            commission.location,
            commission.commissionPosition
        );

        if (!matched) {
            log.warn("未找到委托 {name} 在 {location} 的流程", commission.name, commission.location);
            return { success: false, context: null };
        }

        log.info("匹配到流程: {path} (距离: {distance})", matched.processPath, matched.distance.toFixed(2));

        const processSteps = await loadBasicProcess(matched.processPath);
        if (!processSteps || processSteps.length === 0) {
            log.warn("流程文件为空或解析失败: {path}", matched.processPath);
            return { success: false, context: null };
        }

        await trackCommission(commission.name);

        const context = createCommissionContext({
            type: COMMISSION_TYPE.BASIC,
            commissionName: commission.name,
            location: commission.location,
            processSteps,
            stepRegistry,
            processDir: matched.processDir,
        });

        try {
            const success = await runStepsWithContext(context, { sleepMs: 1000, stopOnError: true });
            if (success) {
                log.info("Basic委托流程执行完成: {name}", commission.name);
            }
            return { success, context };
        } finally {
            dispatcher.ClearAllTriggers();
        }
    } catch (error) {
        log.error("执行Basic委托时出错: {error}", error.message);
        return { success: false, context: null };
    }
}
