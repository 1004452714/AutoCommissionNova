/**
 * 对话委托执行模块
 * 负责对话委托的流程加载和执行
 */
import { PATHS } from "../config/index.js";
import { executeOptimizedAutoTalk } from "../dialog/index.js";
import { findCommissionTarget } from "../navigation/index.js";
import { isInMainUI } from "../vision/ui-detector.js";

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
 * @returns {Promise<boolean>}
 */
export async function executeTalkCommission(commissionName, location, stepRegistry) {
  try {
    const processSteps = await loadProcessFile(commissionName, location, "process.json");
    return await executeUnifiedTalkProcess(processSteps, commissionName, location, stepRegistry);
  } catch (error) {
    log.error("执行对话委托时出错: {error}", error.message);
    return false;
  }
}

/**
 * 统一的对话委托流程处理器
 * @param {Array} processSteps - 流程步骤数组
 * @param {string} commissionName - 委托名称
 * @param {string} location - 委托地点
 * @param {Object} stepRegistry - 步骤处理器注册表
 * @returns {Promise<boolean>}
 */
async function executeUnifiedTalkProcess(processSteps, commissionName, location, stepRegistry) {
  try {
    log.info("执行统一对话委托流程: {name}", commissionName);
    if (!processSteps || processSteps.length === 0) {
      log.warn("没有找到有效的流程步骤");
      return false;
    }

    const checkMainUI = isInMainUI;
    let priorityOptions = [];
    let npcWhiteList = [];

    await findCommissionTarget(commissionName);

    for (let i = 0; i < processSteps.length; i++) {
      const step = processSteps[i];
      log.info("执行流程步骤 {step}: {type}", i + 1, step.type || step);
      try {
        const stepConfig = processStepConfiguration(step, priorityOptions, npcWhiteList);
        priorityOptions = stepConfig.priorityOptions;
        npcWhiteList = stepConfig.npcWhiteList;

        const context = {
          commissionName,
          location,
          processSteps,
          currentIndex: i,
          isInMainUI: checkMainUI,
          priorityOptions,
          npcWhiteList,
        };

        await stepRegistry.process(step, context);
      } catch (stepError) {
        log.error("执行步骤 {step} 时出错: {error}", i + 1, stepError.message);
      }
      await sleep(2000);
    }

    log.info("统一对话委托流程执行完成: {name}", commissionName);
    return true;
  } catch (error) {
    log.error("执行统一对话委托流程时出错: {error}", error.message);
    return false;
  }
}

/**
 * 处理步骤配置（优先选项和NPC白名单）
 */
function processStepConfiguration(step, defaultPriorityOptions, defaultNpcWhiteList) {
  let priorityOptions = defaultPriorityOptions.slice();
  let npcWhiteList = defaultNpcWhiteList.slice();
  if (step.data && typeof step.data === "object") {
    if (Array.isArray(step.data.priorityOptions)) {
      priorityOptions = step.data.priorityOptions;
      log.info("使用自定义优先选项: {options}", priorityOptions.join(", "));
    }
    if (Array.isArray(step.data.npcWhiteList)) {
      npcWhiteList = step.data.npcWhiteList;
      log.info("使用自定义NPC白名单: {npcs}", npcWhiteList.join(", "));
    }
  }
  return { priorityOptions, npcWhiteList };
}
