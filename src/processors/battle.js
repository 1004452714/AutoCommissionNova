/**
 * 委托级战斗步骤处理器
 *
 * 默认读取当前委托的战斗配置：
 *   - 全局模式：使用 global.battleStrategy
 *   - 自定义模式：使用 local.battle.strategy
 *
 * step.data 可选：
 *   - string: 直接覆盖策略名
 *   - { strategy?: string, strategyName?: string, timeout?: number }
 */
import { defineStep } from "./define-step.js";
import { DEFAULT_BATTLE_STRATEGY, loadPartyConfigForContext, resolveBattleStrategy } from "../loaders/party-config.js";

function resolveBattleStepOptions(stepData) {
    if (typeof stepData === "string") {
        return {
            strategy: stepData.trim(),
            timeout: null,
        };
    }

    if (!stepData || typeof stepData !== "object" || Array.isArray(stepData)) {
        return {
            strategy: "",
            timeout: null,
        };
    }

    const strategy = typeof stepData.strategy === "string" && stepData.strategy.trim()
        ? stepData.strategy.trim()
        : (typeof stepData.strategyName === "string" && stepData.strategyName.trim()
            ? stepData.strategyName.trim()
            : "");

    return {
        strategy,
        timeout: typeof stepData.timeout === "number" && stepData.timeout > 0
            ? Math.round(stepData.timeout)
            : null,
    };
}

export default defineStep({
    type: "战斗",
    run: async (step, context) => {
        const configBundle = loadPartyConfigForContext(context);
        const options = resolveBattleStepOptions(step.data);
        const strategyName = options.strategy || resolveBattleStrategy(configBundle) || DEFAULT_BATTLE_STRATEGY;

        log.info("开始执行战斗步骤，策略: {strategy}", strategyName);

        const param = new AutoFightParam(strategyName);
        if (options.timeout) {
            param.Timeout = options.timeout;
        }

        await dispatcher.RunAutoFightTask(param);
        log.info("战斗步骤执行完成");
        return true;
    },
});
