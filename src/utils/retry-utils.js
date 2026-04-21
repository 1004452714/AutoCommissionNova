/**
 * 重试与等待工具
 * 提供通用的重试、超时等待等异步操作工具函数
 */

/**
 * 带超时的条件等待
 * @param {Function} checkFn - 检查函数，返回 true 表示条件满足
 * @param {number} timeoutMs - 超时时间（毫秒）
 * @param {number} intervalMs - 检查间隔（毫秒）
 * @returns {Promise<boolean>} 条件是否在超时前满足
 */
export async function waitForCondition(checkFn, timeoutMs = 10000, intervalMs = 500) {
  let elapsed = 0;
  while (elapsed < timeoutMs) {
    if (checkFn()) return true;
    await sleep(intervalMs);
    elapsed += intervalMs;
  }
  return false;
}

/**
 * 带重试的异步操作
 * @param {Function} fn - 异步操作函数
 * @param {number} maxRetries - 最大重试次数
 * @param {number} retryDelay - 重试间隔（毫秒）
 * @param {string} operationName - 操作名称（用于日志）
 * @returns {Promise<{success: boolean, result: any}>}
 */
export async function retryOperation(fn, maxRetries = 1, retryDelay = 1000, operationName = "操作") {
  let lastError = null;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const result = await fn();
      return { success: true, result };
    } catch (error) {
      lastError = error;
      if (attempt < maxRetries) {
        log.info("{name}第 {retry} 次重试...", operationName, attempt + 1);
        await sleep(retryDelay);
      }
    }
  }
  log.warn("{name}重试 {count} 次后仍失败", operationName, maxRetries);
  return { success: false, result: null };
}

/**
 * 随机延迟
 * @param {number} min - 最小延迟（毫秒）
 * @param {number} max - 最大延迟（毫秒）
 */
export async function randomDelay(min, max) {
  const delay = Math.random() * (max - min) + min;
  await sleep(delay);
}
