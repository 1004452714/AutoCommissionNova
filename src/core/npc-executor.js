/**
 * NPC委托执行模块
 * 负责NPC委托的流程加载和执行
 */
import { COMMISSION_TYPE } from "../config/index.js";
import { findCommissionTarget } from "../navigation/index.js";
import { loadNpcProcessFile } from "../loaders/index.js";
import { createCommissionContext, runStepsWithContext } from "./commission-context.js";

/**
 * 执行NPC委托
 * @param {string} commissionName - 委托名称
 * @param {string} location - 委托地点
 * @param {Object} stepRegistry - 步骤处理器注册表
 * @returns {Promise<Object>} 包含 success 和 context 的对象
 */
export async function executeNpcCommission(commissionName, location, stepRegistry) {
    try {
        const processSteps = await loadNpcProcessFile(commissionName, location, "process.json");
        if (!processSteps || processSteps.length === 0) {
            log.error("没有找到有效的流程步骤");
            return { success: false, context: null };
        }

        log.info("执行统一NPC委托流程: {name}", commissionName);
        await findCommissionTarget(commissionName);

        const context = createCommissionContext({
            type: COMMISSION_TYPE.NPC,
            commissionName,
            location,
            processSteps,
            stepRegistry,
        });

        const success = await runStepsWithContext(context, { sleepMs: 250, stopOnError: true });
        if (success) {
            log.info("NPC委托流程执行完成: {name}", commissionName);
        }
        return { success, context };
    } catch (error) {
        log.error("执行NPC委托时出错: {error}", error.message);
        return { success: false, context: null };
    }
}
