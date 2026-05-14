/**
        * 流程执行共享模块
        * 提供流程步骤执行、context 构建等通用功能
        */
import { stepRegistry } from "../processors/registry.js";
import { isInMainUI } from "../vision/ui-detector.js";

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
        for (let i = 0; i < processSteps.length; i++) {
                const step = processSteps[i];
                log.info("执行测试步骤 {step}: {type}", i + 1, step.type || step);

                try {
                        context.currentIndex = i;

                        await context.stepRegistry.process(step, context);
                } catch (stepError) {
                        log.error("执行步骤 {step} 时出错: {error}", i + 1, stepError.message);
                }

                await sleep(sleepMs);
        }

        return true;
}
