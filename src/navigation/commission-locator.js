/**
 * 委托目标查找模块
 * 在委托界面中查找指定委托并获取其地图位置
 */
import { OCR_REGIONS } from "../config/index.js";
import { bvPageOcrRegionText, enterCommissionScreen } from "../vision/index.js";
import { findCommissionIndex, clickCommissionDetail, exitCommissionDetail, getCommissionPosition } from "../recognition/commission-scanner.js";

/**
 * 寻找委托目标位置并追踪
 * @param {string} commissionName - 委托名称
 * @returns {Promise<Object|null>} 位置对象
 */
export async function findCommissionTarget(commissionName) {
  try {
    log.info("开始寻找委托目标位置: {name}", commissionName);
    await genshin.returnMainUi();

    const enterSuccess = await enterCommissionScreen();
    if (!enterSuccess) { log.error("无法进入委托界面"); return null; }
    await sleep(1000);

    const foundIndex = await findCommissionIndex(commissionName);
    if (foundIndex === -1) {
      log.warn("未找到委托: {name}", commissionName);
      return null;
    }

    let currentCommissionPosition = null;
    try {
      await clickCommissionDetail(foundIndex);
      await sleep(2000);

      const trackingResult = bvPageOcrRegionText(OCR_REGIONS.COMMISSION_TRACKING);
      if (trackingResult === "追踪") {
        log.info("发现追踪按钮，点击追踪");
        click(1693, 1000);
        await sleep(1000);
      }

      await exitCommissionDetail(1200);
      currentCommissionPosition = await getCommissionPosition();
      await genshin.returnMainUi();
    } catch (error) {
      log.error("findCommissionTarget第2步失败: {error}", error.message);
    }
    return currentCommissionPosition;
  } catch (error) {
    log.error("寻找委托目标位置时出错: {error}", error.message);
    return null;
  }
}
