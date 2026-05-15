/**
 * 步骤处理器注册表
 * 管理所有步骤处理器的注册、查找和执行
 */
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
     * 处理步骤（带兼容层自动转换格式）
     * @param {Object|string} step - 步骤定义
     * @param {Object} context - 执行上下文
     */
    async process(step, context) {
        const normalizedStep = this.normalizeStep(step);
        const entry = this.processors[normalizedStep.type];
        if (entry) {
            await entry.handler(normalizedStep, context);
        } else {
            log.warn("未知的流程类型: {type}", normalizedStep.type);
        }
    }

    /**
     * 兼容层：将字符串/数字格式步骤转换为对象格式
     *
     * 保持与现有 process.json 流程文件的完全兼容
     * 旧版流程文件使用字符串格式定义步骤，新版使用对象格式
     *
     * 转换规则：
     * - "xxx.json" → { type: "地图追踪", data: "xxx.json" }（路径追踪文件）
     * - "F" → { type: "对话", data: {} }（对话交互）
     * - "等待" → { type: "等待", data: {} }（其他步骤类型）
     *
     * @param {Object|string} step - 原始步骤
     * @returns {Object} 标准化后的步骤对象 { type: string, data: any }
     */
    normalizeStep(step) {
        if (typeof step === "string") {
            if (step.endsWith(".json")) {
                return { type: "地图追踪", data: step };
            }
            if (step === "F") {
                return { type: "对话", data: {} };
            }
            return { type: step, data: {} };
        }
        return step;
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
