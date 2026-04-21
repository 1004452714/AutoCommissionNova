/**
 * 错误处理与恢复工具
 * 提供统一的错误处理模式和恢复逻辑
 */

/**
 * 安全执行异步操作，捕获异常并尝试恢复
 * @param {Function} fn - 异步操作函数
 * @param {Object} options - 配置选项
 * @param {string} options.context - 操作上下文描述
 * @param {Function} [options.onRecover] - 恢复函数
 * @param {boolean} [options.rethrow] - 是否重新抛出异常
 * @returns {Promise<{success: boolean, error: Error|null}>}
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
 */
export async function recoverToMainUI() {
  try {
    await genshin.returnMainUi();
    log.info("已尝试返回主界面");
  } catch (error) {
    log.warn("返回主界面时出错: {error}", error.message);
  }
}
