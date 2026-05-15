/**
 * NPC委托执行模块
 * 负责NPC委托的流程加载和执行
 */
import { COMMISSION_TYPE, PATHS } from "../config/index.js";
import { findCommissionTarget } from "../navigation/index.js";
import { createCommissionContext } from "./commission-context.js";

/**
 * 读取并解析流程文件
 *
 * 从指定路径加载并解析流程文件
 * 支持JSON数组格式和纯文本行格式
 *
 * @param {string} commissionName - 委托名称
 * @param {string} location - 委托地点
 * @param {string} processFileName - 流程文件名，默认为"process.json"
 * @returns {Promise<Array|false>} 步骤数组，失败返回false
 */
export async function loadNpcProcessFile(commissionName, location, processFileName = "process.json") {
    const processFilePath = PATHS.NPC_PROCESS_BASE + "/" + commissionName + "/" + location + "/" + processFileName;
    try {
        const processContent = file.readTextSync(processFilePath);
        log.info("找到NPC委托流程文件: {path}", processFilePath);
        try {
            const jsonData = JSON.parse(processContent);
            if (Array.isArray(jsonData)) {
                log.debug("JSON流程解析成功");
                return jsonData;
            }
            log.error("JSON流程格式错误，应为数组");
            return false;
        } catch (jsonError) {
            const lines = processContent.split("\n").map((line) => line.trim()).filter((line) => line.length > 0);
            return lines;
        }
    } catch (error) {
        log.warn("未找到NPC委托 {name} 在 {location} 的流程文件: {path}", commissionName, location, processFilePath);
        return false;
    }
}

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
        const result = await executeUnifiedNpcProcess(processSteps, commissionName, location, stepRegistry);
        return { success: result.success, context: result.context };
    } catch (error) {
        log.error("执行NPC委托时出错: {error}", error.message);
        return { success: false, context: null };
    }
}

/**
 * 统一的NPC委托流程处理器
 * @param {Array} processSteps - 流程步骤数组
 * @param {string} commissionName - 委托名称
 * @param {string} location - 委托地点
 * @param {Object} stepRegistry - 步骤处理器注册表
 * @returns {Promise<Object>} 包含 success 和 context 的对象
 */
async function executeUnifiedNpcProcess(processSteps, commissionName, location, stepRegistry) {
    try {
        log.info("执行统一NPC委托流程: {name}", commissionName);
        if (!processSteps || processSteps.length === 0) {
            log.error("没有找到有效的流程步骤");
            return { success: false, context: null };
        }

        await findCommissionTarget(commissionName);

        // 在循环外部创建共享 context，使所有步骤可以跨步骤传递缓存数据
        const sharedContext = createCommissionContext({
            type: COMMISSION_TYPE.NPC,
            commissionName,
            location,
            processSteps,
            stepRegistry,
        });

        for (let i = 0; i < processSteps.length; i++) {
            try {
                const step = processSteps[i];
                log.info("执行流程步骤 {step}: {type}", i + 1, step.type || step);
                sharedContext.currentIndex = i;
                await stepRegistry.process(step, sharedContext);
            } catch (stepError) {
                log.error("执行步骤 {step} 时出错: {error}", i + 1, stepError.message);
                return { success: false, context: null };
            }
            await sleep(250);
        }
        log.info("NPC委托流程执行完成: {name}", commissionName);
        return { success: true, context: sharedContext };
    } catch (error) {
        log.error("执行NPC委托流程时出错: {error}", error.message);
        return { success: false, context: null };
    }
}
