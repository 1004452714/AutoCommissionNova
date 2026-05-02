/**
 * 委托完成检测模块
 * 检查委托是否已完成
 */
import { COMMISSION_CONFIG } from "../config/index.js";
import { enterCommissionScreen } from "../vision/ui-detector.js";
import { bvPageOcrRegionText } from "../vision/index.js";
import { detectCommissionStatusByImage } from "./status-detector.js";

/**
 * 检查指定委托是否已完成
 * 通过遍历4个委托位置的OCR识别，匹配委托名后检测其完成状态
 * @param {string} commissionName - 委托名称
 * @returns {Promise<boolean>}
 */
export async function isCompleted(commissionName) {
  try {
    const enterSuccess = await enterCommissionScreen();
    if (!enterSuccess) {
      log.error("无法进入委托界面");
      return false;
    }
    await sleep(900);

    // 遍历4个委托位置，找到对应的委托名
    for (let i = 0; i < 4; i++) {
      const config = COMMISSION_CONFIG[i];
      const ocrResult = bvPageOcrRegionText(config.ocrRegion);
      
      if (ocrResult && ocrResult.trim() === commissionName) {
        // 找到匹配的委托，检测其完成状态
        log.info("找到委托 {name}，检测完成状态", commissionName);
        const status = await detectCommissionStatusByImage(i, commissionName);
        return status === "completed";
      }
    }

    log.warn("未在委托界面找到委托: {name}", commissionName);
    return false;
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
