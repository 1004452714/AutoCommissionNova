/**
 * 对话委托执行模块
 * 负责对话委托的流程加载和执行
 */
import { PATHS } from "../config/index.js";
import { findCommissionTarget } from "../navigation/index.js";
import { processStepConfiguration } from "./process-executor.js";

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
 * 
 * @example
 * const steps = await loadProcessFile("语言交流", "蒙德城");
 */
export async function loadProcessFile(commissionName, location, processFileName = "process.json") {
  const processFilePath = PATHS.TALK_PROCESS_BASE + "/" + commissionName + "/" + location + "/" + processFileName;
  try {
    const processContent = await file.readText(processFilePath);
    log.info("找到对话委托流程文件: {path}", processFilePath);
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
    log.warn("未找到对话委托 {name} 在 {location} 的流程文件: {path}", commissionName, location, processFilePath);
    return false;
  }
}

/**
 * 执行对话委托
 * @param {string} commissionName - 委托名称
 * @param {string} location - 委托地点
 * @param {Object} stepRegistry - 步骤处理器注册表
 * @returns {Promise<Object>} 包含 success 和 context 的对象
 */
export async function executeTalkCommission(commissionName, location, stepRegistry) {
  try {
    const processSteps = await loadProcessFile(commissionName, location, "process.json");
    const result = await executeUnifiedTalkProcess(processSteps, commissionName, location, stepRegistry);
    return { success: result.success, context: result.context };
  } catch (error) {
    log.error("执行对话委托时出错: {error}", error.message);
    return { success: false, context: null };
  }
}

/**
 * 统一的对话委托流程处理器
 * @param {Array} processSteps - 流程步骤数组
 * @param {string} commissionName - 委托名称
 * @param {string} location - 委托地点
 * @param {Object} stepRegistry - 步骤处理器注册表
 * @returns {Promise<Object>} 包含 success 和 context 的对象
 */
async function executeUnifiedTalkProcess(processSteps, commissionName, location, stepRegistry) {
  try {
    log.info("执行统一对话委托流程: {name}", commissionName);
    if (!processSteps || processSteps.length === 0) {
      log.warn("没有找到有效的流程步骤");
      return { success: false, context: null };
    }

    let priorityOptions = [];
    let npcWhiteList = [];

    await findCommissionTarget(commissionName);

    // 在循环外部创建共享 context，使所有步骤可以跨步骤传递缓存数据
    const sharedContext = {
      commissionName,
      location,
      processSteps,
      priorityOptions,
      npcWhiteList,
      stepRegistry, // 传入 stepRegistry 供嵌套步骤调用
    };

    for (let i = 0; i < processSteps.length; i++) {
      const step = processSteps[i];
      log.info("执行流程步骤 {step}: {type}", i + 1, step.type || step);
      try {
        const stepConfig = processStepConfiguration(step, priorityOptions, npcWhiteList);
        priorityOptions = stepConfig.priorityOptions;
        npcWhiteList = stepConfig.npcWhiteList;

        // 更新动态字段
        sharedContext.currentIndex = i;
        sharedContext.priorityOptions = priorityOptions;
        sharedContext.npcWhiteList = npcWhiteList;

        await stepRegistry.process(step, sharedContext);
      } catch (stepError) {
        log.error("执行步骤 {step} 时出错: {error}", i + 1, stepError.message);
      }
      await sleep(2000);
    }

    log.info("统一对话委托流程执行完成: {name}", commissionName);
    return { success: true, context: sharedContext };
  } catch (error) {
    log.error("执行统一对话委托流程时出错: {error}", error.message);
    return { success: false, context: null };
  }
}
