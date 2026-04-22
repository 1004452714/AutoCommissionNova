/**
 * 委托识别主模块
 * 负责委托列表的 OCR 识别、地点识别、详情检测等
 */
import { OCR_REGIONS, COMMISSION_DETAIL_BUTTONS, COMMISSION_TYPE, MIN_TEXT_LENGTH } from "../config/index.js";
import { easyOCR, easyOCROne, pageScroll } from "../vision/index.js";
import { cleanText } from "../utils/text-utils.js";
import { standardizeCommissionName, standardizeCommissionLocation } from "./commission-standardizer.js";
import { detectCommissionStatusByImage } from "./status-detector.js";
import { getPositionWithVoting } from "../navigation/position-utils.js";

/**
 * 识别委托地点
 * @returns {Promise<string>} 地点名称
 */
export async function recognizeCommissionLocation() {
  try {
    const location = await easyOCROne(OCR_REGIONS.LOCATION);
    if (location && location.trim()) return location.trim();
    return "未知地点";
  } catch (error) {
    log.error("识别委托地点时出错: {error}", error.message);
    return "识别失败";
  }
}

/**
 * 检测是否进入委托详情界面
 * @returns {Promise<string>} 国家名称或状态
 */
export async function checkDetailPageEntered() {
  try {
    for (let i = 0; i < 3; i++) {
      const results = await easyOCR(OCR_REGIONS.DETAIL_COUNTRY);
      if (results.count > 0) {
        for (let j = 0; j < results.count; j++) {
          const text = results[j].text.trim();
          if (text.includes("蒙德")) {
            log.info("检测到蒙德委托，成功进入详情界面");
            return "蒙德";
          } else if (text === "") {
            log.info("未检测到地区文本，可能是已完成委托");
            return "已完成";
          } else if (text.length >= 2) {
            log.info("检测到其他地区委托: {text}", text);
            return text;
          }
        }
      }
      await sleep(500);
    }
    log.info("三次OCR检测后仍未确认委托国家");
    return "未知";
  } catch (error) {
    log.error("检测委托详情界面时出错: {error}", error.message);
    return "错误";
  }
}

/**
 * 识别委托列表（4个委托）
 * @param {Object} supportedCommissions - 支持的委托列表 { fight: [], talk: [] }
 * @returns {Promise<Array>} 识别到的委托数组
 */
export async function recognizeCommissions(supportedCommissions) {
  try {
    log.info("开始执行委托识别");
    const allCommissions = [];

    for (let i = 0; i < 4; i++) {
      if (i === 3) {
        await pageScroll(1);
      }

      const region = OCR_REGIONS.Main_Dev[i];
      log.info("识别第{index}个委托区域", i + 1);
      let commission = null;
      try {
        const results = await easyOCR(region);
        for (let j = 0; j < results.count; j++) {
          try {
            const text = cleanText(results[j].text);
            if (text && text.length >= MIN_TEXT_LENGTH) {
              const standardizedName = standardizeCommissionName(text);
              const finalName = standardizedName || text;
              if (standardizedName && standardizedName !== text) {
                log.info('第{index}个委托(标准化名称): {raw} -> {standard}', i + 1, text, standardizedName);
              } else if (!standardizedName) {
                log.warn('第{index}个委托标准化失败，使用OCR原始结果: "{text}"', i + 1, text);
              }
              const isFight = supportedCommissions.fight.includes(finalName);
              const isTalk = supportedCommissions.talk.includes(finalName);
              commission = {
                id: i + 1,
                name: finalName,
                supported: isFight || isTalk,
                type: isFight ? COMMISSION_TYPE.FIGHT : isTalk ? COMMISSION_TYPE.TALK : "",
                location: "",
              };
              break;
            }
          } catch (ocrError) {
            log.error("处理OCR结果时出错: {error}", ocrError.message);
            continue;
          }
        }
      } catch (regionError) {
        log.error("识别第{index}个委托区域时出错: {error}", i + 1, regionError);
        continue;
      }

      if (!commission) {
        continue;
      }
      allCommissions.push(commission);

      try {
        const status = await detectCommissionStatusByImage(i);
        if (status === "completed") {
          commission.location = "已完成";
          continue;
        }
        log.info("查看第{id}个委托详情: {name}", commission.id, commission.name);
        const detailButton = COMMISSION_DETAIL_BUTTONS[commission.id - 1];
        click(detailButton.x, detailButton.y);
        await sleep(700);

        const detailStatus = await checkDetailPageEntered();
        commission.country = detailStatus;
        let location = await recognizeCommissionLocation();
        const standardizedLocation = standardizeCommissionLocation(commission.name, location);
        if (standardizedLocation && standardizedLocation !== location) {
          location = standardizedLocation;
        }
        commission.location = location;

        if (commission.location !== "已完成") {
          keyDown("VK_ESCAPE");
          await sleep(300);
          keyUp("VK_ESCAPE");
          await sleep(1200);
          const bigMapPosition = await getPositionWithVoting();
          commission.CommissionPosition = bigMapPosition;
          keyDown("VK_ESCAPE");
          await sleep(300);
          keyUp("VK_ESCAPE");
          await sleep(1200);
        }
      } catch (commissionError) {
        log.error("处理委托{id} {name} 时出错: {error}", commission.id, commission.name, commissionError.message);
        commission.location = "处理失败";
        commission.country = "未知";
        try {
          keyDown("VK_ESCAPE");
          await sleep(300);
          keyUp("VK_ESCAPE");
          await sleep(1200);
        } catch (escapeError) {
          log.warn("尝试退出详情页面时出错: {error}", escapeError);
        }
      }
    }

    if (allCommissions.length > 0) {
      log.info("委托识别完成，共识别到 {total} 个委托，其中 {supported} 个受支持",
        allCommissions.length, allCommissions.filter(function(c) { return c.supported; }).length);
    } else {
      log.warn("委托识别失败，未识别到任何委托");
    }
    return allCommissions;
  } catch (error) {
    log.error("委托识别出错: {error}", error.message);
    return [];
  }
}
