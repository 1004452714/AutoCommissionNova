/**
 * 委托完成检测模块
 * 检查委托是否已完成
 */
import { enterCommissionScreen, pageScroll } from "../vision/ui-detector.js";
import { detectCommissionStatusByImage } from "./status-detector.js";

/**
 * 检查委托是否已完成
 * @param {number} completedCount - 已完成的委托数量
 * @returns {Promise<boolean>}
 */
export async function isCompleted(completedCount) {
  try {
    log.info("已完成委托数量: {completedCount}", completedCount);
    const enterSuccess = await enterCommissionScreen();
    if (!enterSuccess) {
      log.error("无法进入委托界面");
      return false;
    }
    await sleep(900);

    if (completedCount === 0) {
      await pageScroll(1);
      const status = await detectCommissionStatusByImage(3);
      return status === "completed";
    } else {
      const status = await detectCommissionStatusByImage(3 - completedCount);
      return status === "completed";
    }
  } catch (error) {
    log.error("检查委托完成状态失败: {error}", error.message);
    try {
      await genshin.returnMainUi();
    } catch (exitError) {
      log.warn("退出委托界面失败: {error}", exitError);
    }
    return false;
  }
}
