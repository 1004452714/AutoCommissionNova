/**
 * 步骤处理器注册表
 * 管理所有步骤处理器的注册、查找和执行
 */
import { shouldExecuteStepByDesc } from "./commission-desc-utils.js";
import { shouldExecuteStepByLoc } from "./commission-loc-utils.js";

export class StepProcessorRegistry {
    constructor() {
        // type → { handler, schema? }
        this.processors = {};
    }

    /**
     * 注册步骤处理器
     * @param {string} stepType - 步骤类型名称
     * @param {Function} handler - 异步处理函数 (step, context) => Promise<void>
     * @param {Object} [schema] - 可选 data 字段 schema（启动期静态校验用）
     */
    register(stepType, handler, schema) {
        this.processors[stepType] = { handler, schema };
    }

    /**
     * 处理步骤
     * @param {Object} step - 步骤定义 { type, data?, note?, desc?, loc?, retry?, retryOn? }
     * @param {Object} context - 执行上下文
     */
    async process(step, context) {
        if (!step || typeof step !== "object" || Array.isArray(step)) {
            log.warn("流程步骤必须是对象格式，收到: {value}", step);
            return;
        }
        const entry = this.processors[step.type];
        if (entry) {
            if (!(await shouldExecuteStepByDesc(step, context))) {
                return;
            }
            if (!(await shouldExecuteStepByLoc(step, context))) {
                return;
            }
            await entry.handler(step, context);
        } else {
            log.warn("未知的流程类型: {type}", step.type);
        }
    }

    /**
     * 检查指定 type 是否已注册
     * @param {string} stepType
     * @returns {boolean}
     */
    has(stepType) {
        return Object.prototype.hasOwnProperty.call(this.processors, stepType);
    }

    /**
     * 获取指定 type 的 schema（如未声明则返回 undefined）
     * @param {string} stepType
     * @returns {Object|undefined}
     */
    getSchema(stepType) {
        const entry = this.processors[stepType];
        return entry ? entry.schema : undefined;
    }

    /**
     * 获取所有已注册的处理器类型
     * @returns {string[]} 已注册的类型名称列表
     */
    getRegisteredTypes() {
        return Object.keys(this.processors);
    }
}

export const stepRegistry = new StepProcessorRegistry();
