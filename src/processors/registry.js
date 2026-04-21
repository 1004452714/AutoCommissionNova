/**
 * 步骤处理器注册表
 * 管理所有步骤处理器的注册、查找和执行
 */
export class StepProcessorRegistry {
  constructor() {
    this.processors = {};
  }

  /**
   * 注册步骤处理器
   * @param {string} stepType - 步骤类型名称
   * @param {Function} handler - 异步处理函数 (step, context) => Promise<void>
   */
  register(stepType, handler) {
    this.processors[stepType] = handler;
    log.info("注册步骤处理器: {type}", stepType);
  }

  /**
   * 处理步骤（带兼容层自动转换格式）
   * @param {Object|string} step - 步骤定义
   * @param {Object} context - 执行上下文
   */
  async process(step, context) {
    const normalizedStep = this.normalizeStep(step);
    const processor = this.processors[normalizedStep.type];
    if (processor) {
      await processor(normalizedStep, context);
    } else {
      log.warn("未知的流程类型: {type}", normalizedStep.type);
    }
  }

  /**
   * 兼容层：将字符串/数字格式步骤转换为对象格式
   * 保持与现有 process.json 流程文件的完全兼容
   * @param {Object|string} step - 原始步骤
   * @returns {Object} 标准化后的步骤对象
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
   * 获取所有已注册的处理器类型
   * @returns {string[]} 已注册的类型名称列表
   */
  getRegisteredTypes() {
    return Object.keys(this.processors);
  }
}

export const stepRegistry = new StepProcessorRegistry();
