/**
 * 错误处理工具
 */

/**
 * 判断异常是否为取消相关的异常
 * @description BGI 取消任务时会以多种形式抛出异常,统一在此识别;
 *              "尝试多次后,截图失败!" 通常也意味着任务被中断,一并视为取消
 * @param {Error|string} error
 * @returns {boolean}
 */
export function isCancellationError(error) {
    if (!error) return false;
    const msg = (error.message || error.toString() || "").toLowerCase();
    return msg.includes("取消自动任务")
        || msg.includes("task was canceled")
        || msg.includes("operationcanceledexception")
        || msg.includes("normalendexception")
        || msg.includes("尝试多次后,截图失败!");
}
