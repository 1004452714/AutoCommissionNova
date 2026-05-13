/**
 * 委托状态检测模块
 * 通过图像识别检测委托的完成/未完成状态
 */
import { PATHS, COMMISSION_STATUS_REGIONS } from "../config/index.js";

/**
 * 检测委托完成状态（使用图像识别）
 * @param {number} buttonIndex - 委托按钮索引（0-3）
 * @param {string} [commissionName] - 委托名称（用于日志输出）
 * @returns {Promise<string>} "completed" | "uncompleted" | "unknown"
 */
export async function detectCommissionStatusByImage(buttonIndex) {
  try {
    const page = new BvPage();
    const completedRo = RecognitionObject.TemplateMatch(file.ReadImageMatSync(PATHS.COMPLETED_IMAGE), ...COMMISSION_STATUS_REGIONS[buttonIndex]);
    const uncompletedRo = RecognitionObject.TemplateMatch(file.ReadImageMatSync(PATHS.UNCOMPLETED_IMAGE), ...COMMISSION_STATUS_REGIONS[buttonIndex]);
    if (page.locator(completedRo).isExist()) return "completed";
    if (page.locator(uncompletedRo).isExist()) return "uncompleted";
  } catch (error) {
    log.error("检测第{x}个委托完成状态时出错: {error}", buttonIndex + 1, error.message);
    return "unknown";
  }
}

