/**
 * 流程执行共享模块
 * 提供流程步骤执行、context 构建、步骤配置处理等通用功能
 */
import { stepRegistry } from "../processors/registry.js";
import { isInMainUI } from "../vision/ui-detector.js";

/**
 * 处理步骤配置（优先选项和NPC白名单）
 * @param {Object} step - 步骤定义
 * @param {Array} defaultPriorityOptions - 默认优先选项
 * @param {Array} defaultNpcWhiteList - 默认NPC白名单
 * @returns {Object} 更新后的配置
 */
export function processStepConfiguration(step, defaultPriorityOptions, defaultNpcWhiteList) {
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

/**
 * 构建测试 context 对象
 * @param {Object} options - 配置选项
 * @param {string} options.commissionName - 委托名称
 * @param {string} options.location - 委托地点
 * @param {Array} options.processSteps - 流程步骤数组
 * @param {Object} [options.stepRegistry] - 步骤注册表（默认使用全局 stepRegistry）
 * @returns {Object} 完整的 context 对象
 */
export function buildTestContext(options) {
  const {
    commissionName,
    location,
    processSteps,
    stepRegistry: customRegistry = stepRegistry,
  } = options;

  return {
    commissionName,
    location,
    processSteps,
    currentIndex: 0,
    isInMainUI,
    stepRegistry: customRegistry,
    priorityOptions: [],
    npcWhiteList: [],
    executedBranches: [],
    branchConfigCache: null,
  };
}

/**
 * 执行流程步骤
 * @param {Array} processSteps - 流程步骤数组
 * @param {Object} context - 执行上下文
 * @param {number} [sleepMs=2000] - 每步执行后的等待时间（毫秒）
 * @returns {Promise<boolean>} 执行是否成功
 */
export async function executeProcessSteps(processSteps, context, sleepMs = 2000) {
  let priorityOptions = context.priorityOptions || [];
  let npcWhiteList = context.npcWhiteList || [];

  for (let i = 0; i < processSteps.length; i++) {
    const step = processSteps[i];
    log.info("执行测试步骤 {step}: {type}", i + 1, step.type || step);

    try {
      const stepConfig = processStepConfiguration(step, priorityOptions, npcWhiteList);
      priorityOptions = stepConfig.priorityOptions;
      npcWhiteList = stepConfig.npcWhiteList;

      context.currentIndex = i;
      context.priorityOptions = priorityOptions;
      context.npcWhiteList = npcWhiteList;

      await context.stepRegistry.process(step, context);
    } catch (stepError) {
      log.error("执行步骤 {step} 时出错: {error}", i + 1, stepError.message);
    }

    await sleep(sleepMs);
  }

  return true;
}