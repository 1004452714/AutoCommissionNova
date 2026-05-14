/**
        * Basic委托执行模块
        * 采用流程步骤驱动方式执行Basic委托
        */
import { findNearestBasicProcess } from "./basic-process-matcher.js";
import { loadBasicProcess } from "./basic-process-loader.js";

/**
        * 执行Basic委托
        * @param {Object} commission - 委托对象
        * @param {Object} stepRegistry - 步骤处理器注册表
        * @returns {Promise<boolean>}
        */
export async function executeBasicCommission(commission, stepRegistry) {
        try {
                // 1. 匹配最近的流程
                const matched = await findNearestBasicProcess(
                        commission.name,
                        commission.location,
                        commission.CommissionPosition
                );

                if (!matched) {
                        log.warn("未找到委托 {name} 在 {location} 的流程", commission.name, commission.location);
                        return false;
                }

                log.info("匹配到流程: {path} (距离: {distance})", matched.processPath, matched.distance.toFixed(2));

                // 2. 加载流程步骤
                const processSteps = await loadBasicProcess(matched.processPath);

                if (!processSteps || processSteps.length === 0) {
                        log.warn("流程文件为空或解析失败: {path}", matched.processPath);
                        return false;
                }

                // 3. 执行流程步骤
                return await executeBasicProcessSteps(commission, matched.processDir, processSteps, stepRegistry);
        } catch (error) {
                log.error("执行Basic委托时出错: {error}", error.message);
                return false;
        }
}

/**
        * 执行Basic流程步骤
        * @param {Object} commission - 委托对象
        * @param {string} processDir - 流程所在目录
        * @param {Array} processSteps - 流程步骤数组
        * @param {Object} stepRegistry - 步骤处理器注册表
        * @returns {Promise<boolean>}
        */
async function executeBasicProcessSteps(commission, processDir, processSteps, stepRegistry) {
        for (let i = 0; i < processSteps.length; i++) {
                const step = processSteps[i];
                log.info("执行流程步骤 {step}: {type}", i + 1, step.type || step);

                try {
                        await stepRegistry.process(step, {
                                commissionName: commission.name,
                                location: commission.location,
                                processDir: processDir,
                                currentIndex: i,
                        });
                } catch (stepError) {
                        log.error("执行步骤 {step} 时出错: {error}", i + 1, stepError.message);
                        dispatcher.ClearAllTriggers();
                        return false;
                }

                await sleep(1000);
        }

        dispatcher.ClearAllTriggers();
        log.info("Basic委托流程执行完成: {name}", commission.name);
        return true;
}
