/**
 * 错误处理与恢复工具
 * 提供统一的错误处理模式和恢复逻辑
 */

/**
 * 错误级别枚举
 * 
 * 用于区分不同严重程度的错误，决定后续处理策略
 * 
 * @constant
 * @readonly
 * @enum {string}
 */
export const ErrorLevel = {
  /** 终止执行 - 无法恢复的严重错误（如：无法进入委托界面） */
  CRITICAL: 'critical',
  /** 可重试 - 临时性错误，可以重试后继续（如：临时识别失败） */
  RECOVERABLE: 'recoverable',
  /** 跳过继续 - 非关键错误，跳过当前步骤继续执行（如：单个委托失败） */
  WARNING: 'warning'
};

/**
 * 统一错误处理
 * 
 * 根据错误级别执行不同的处理策略：
 * - CRITICAL: 记录错误并抛出异常，终止执行
 * - RECOVERABLE: 记录错误，返回false，由上层决定是否重试
 * - WARNING: 记录警告，返回false，继续执行下一步
 * 
 * @param {Error} error - 错误对象
 * @param {ErrorLevel} level - 错误级别
 * @param {string} context - 错误上下文描述
 * @returns {Promise<boolean>} 是否继续执行（true=继续，false=停止或重试）
 * 
 * @example
 * // 关键路径错误
 * if (!await handleStepError(error, ErrorLevel.CRITICAL, "进入委托界面")) {
 *   return; // 终止执行
 * }
 * 
 * @example
 * // 可重试错误
 * const shouldContinue = await handleStepError(error, ErrorLevel.RECOVERABLE, "识别委托");
 * if (!shouldContinue) {
 *   retryCount++; // 增加重试次数
 * }
 * 
 * @example
 * // 警告级别
 * await handleStepError(error, ErrorLevel.WARNING, "单个委托执行");
 * // 继续执行下一个
 */
export async function handleStepError(error, level, context) {
  switch (level) {
    case ErrorLevel.CRITICAL:
      log.error("[CRITICAL] {context}时出错: {error}", context, error.message);
      throw error; // 终止执行
      
    case ErrorLevel.RECOVERABLE:
      log.warn("[RECOVERABLE] {context}时出错: {error}", context, error.message);
      return false; // 由上层决定是否重试
      
    case ErrorLevel.WARNING:
      log.warn("[WARNING] {context}时出错: {error}", context, error.message);
      return false; // 继续执行
      
    default:
      log.error("[UNKNOWN] {context}时出错: {error}", context, error.message);
      return false;
  }
}

/**
 * 安全执行异步操作，捕获异常并尝试恢复
 * 
 * 包装异步操作，自动处理错误并支持恢复逻辑
 * 适用于不需要区分错误级别的简单场景
 * 
 * @param {Function} fn - 异步操作函数
 * @param {Object} options - 配置选项
 * @param {string} options.context - 操作上下文描述
 * @param {Function} [options.onRecover] - 恢复函数
 * @param {boolean} [options.rethrow] - 是否重新抛出异常
 * @returns {Promise<{success: boolean, error: Error|null}>}
 * 
 * @example
 * const result = await safeExecute(
 *   async () => await someAsyncOperation(),
 *   { context: "执行操作", rethrow: false }
 * );
 * if (!result.success) {
 *   console.log("操作失败:", result.error.message);
 * }
 */
export async function safeExecute(fn, options = {}) {
  const { context = "", onRecover = null, rethrow = false } = options;
  try {
    await fn();
    return { success: true, error: null };
  } catch (error) {
    log.error("{context}时出错: {error}", context, error.message);
    if (onRecover) {
      try {
        await onRecover(error);
      } catch (recoverError) {
        log.warn("恢复操作失败: {error}", recoverError.message);
      }
    }
    if (rethrow) {
      throw error;
    }
    return { success: false, error };
  }
}

/**
 * 尝试返回主界面作为恢复操作
 * 
 * 用于错误恢复场景，确保脚本回到已知的安全状态
 */
export async function recoverToMainUI() {
  try {
    await genshin.returnMainUi();
    log.info("已尝试返回主界面");
  } catch (error) {
    log.warn("返回主界面时出错: {error}", error.message);
  }
}
