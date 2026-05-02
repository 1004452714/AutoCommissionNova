/**
 * 委托目标查找模块
 * 在委托界面中查找指定委托并获取其地图位置
 */
import { OCR_REGIONS, COMMISSION_DETAIL_BUTTONS, MIN_TEXT_LENGTH } from "../config/index.js";
import { ocrCaptureRegion, ocrCaptureRegionText, enterCommissionScreen, pageScroll } from "../vision/index.js";
import { cleanText } from "../utils/text-utils.js";
import { getPositionWithVoting } from "./position-utils.js";

/**
 * 寻找委托目标位置并追踪
 * @param {string} commissionName - 委托名称
 * @returns {Promise<Object|null>} 位置对象
 */
export async function findCommissionTarget(commissionName) {
  try {
    log.info("开始寻找委托目标位置: {name}", commissionName);
    await genshin.returnMainUi();

    let index = 4;
    try {
      const enterSuccess = await enterCommissionScreen();
      if (!enterSuccess) { log.error("无法进入委托界面"); return null; }
      await sleep(1000);

      for (let regionIndex = 0; regionIndex < 3; regionIndex++) {
        const region = OCR_REGIONS.COMMISSION_NAME[regionIndex];
        try {
          const results = await ocrCaptureRegion(region);
          for (let i = 0; i < results.count; i++) {
            const text = cleanText(results[i].text);
            if (text && text.length >= MIN_TEXT_LENGTH) {
              if (text === commissionName) {
                index = regionIndex + 1;
                log.info("找到委托 {name} 在位置 {index}", commissionName, index);
                break;
              }
            }
          }
          if (index !== 4) break;
        } catch (regionError) {
          log.error("识别第{index}个委托区域时出错: {error}", regionIndex + 1, regionError);
          continue;
        }
      }
    } catch (error) {
      log.error("findCommissionTarget第一步失败: {error}", error.message);
    }

    if (index === 4) {
      try {
        log.info("前3个委托中未找到，检查第4个委托");
        await pageScroll(1);
        const region = OCR_REGIONS.COMMISSION_NAME[3];
        const results = await ocrCaptureRegion(region);
        for (let i = 0; i < results.count; i++) {
          const text = cleanText(results[i].text);
          if (text && text.length >= MIN_TEXT_LENGTH && text === commissionName) {
            index = 4;
            log.info("找到委托 {name} 在第4个位置", commissionName);
            break;
          }
        }
      } catch (fourthError) {
        log.error("识别第4个委托时出错: {error}", fourthError);
      }
    }

    let currentCommissionPosition = null;
    try {
      const button = COMMISSION_DETAIL_BUTTONS[index - 1];
      if (button) {
        click(button.x, button.y);
        await sleep(2000);

        const trackingResult = await ocrCaptureRegionText(OCR_REGIONS.COMMISSION_TRACKING);
        if (trackingResult === "追踪") {
          log.info("发现追踪按钮，点击追踪");
          click(1693, 1000);
          await sleep(1000);
        }

        keyDown("VK_ESCAPE");
        await sleep(300);
        keyUp("VK_ESCAPE");
        await sleep(1200);
        currentCommissionPosition = await getPositionWithVoting();
        await genshin.returnMainUi();
      }
    } catch (error) {
      log.error("findCommissionTarget第2步失败: {error}", error.message);
    }
    return currentCommissionPosition;
  } catch (error) {
    log.error("寻找委托目标位置时出错: {error}", error.message);
    return null;
  }
}
