/**
 * 委托状态检测模块
 * 通过图像识别检测委托的完成/未完成状态
 */
import { PATHS, COMMISSION_CONFIG, COMMISSION_DETAIL_BUTTONS, THRESHOLDS } from "../config/index.js";

/**
 * 检测委托完成状态（使用图像识别）
 * @param {number} buttonIndex - 委托按钮索引（0-3）
 * @param {string} [commissionName] - 委托名称（用于日志输出）
 * @returns {Promise<string>} "completed" | "uncompleted" | "unknown"
 */
export async function detectCommissionStatusByImage(buttonIndex, commissionName) {
  try {
    const config = COMMISSION_CONFIG[buttonIndex];
    if (!config) {
      log.error("无效的按钮索引: {index}", buttonIndex);
      return "unknown";
    }

    const button = COMMISSION_DETAIL_BUTTONS[buttonIndex];
    if (!button) {
      log.error("无效的按钮索引: {index}", buttonIndex);
      return "unknown";
    }

    const statusRegion = config.statusRegion;
    log.debug("检测委托 {name} 的完成状态（图像识别）", commissionName || `#${button.id}`);
    const captureRegion = captureGameRegion();
    try {
      const checkRegion = captureRegion.DeriveCrop(statusRegion.checkX, button.y - 30, statusRegion.checkWidth, 60);
      try {
        const completedMat = file.ReadImageMatSync(PATHS.COMPLETED_IMAGE);
        const uncompletedMat = file.ReadImageMatSync(PATHS.UNCOMPLETED_IMAGE);
        try {
          const completedRo = RecognitionObject.TemplateMatch(completedMat, 0, 0, statusRegion.checkWidth, 60);
          const uncompletedRo = RecognitionObject.TemplateMatch(uncompletedMat, 0, 0, statusRegion.checkWidth, 60);
          completedRo.threshold = THRESHOLDS.TEMPLATE_MATCH;
          uncompletedRo.threshold = THRESHOLDS.TEMPLATE_MATCH;

          const completedResult = checkRegion.find(completedRo);
          if (!completedResult.isEmpty()) return "completed";

          const uncompletedResult = checkRegion.find(uncompletedRo);
          if (!uncompletedResult.isEmpty()) return "uncompleted";

          log.warn("委托 {name} 状态识别失败", commissionName || `#${button.id}`);
          return "unknown";
        } finally {
          completedMat.Dispose();
          uncompletedMat.Dispose();
        }
      } finally {
        checkRegion.Dispose();
      }
    } finally {
      captureRegion.Dispose();
    }
  } catch (error) {
    log.error("检测委托完成状态时出错: {error}", error.message);
    return "unknown";
  }
}
