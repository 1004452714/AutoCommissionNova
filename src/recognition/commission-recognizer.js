/**
 * 委托识别主模块
 * 负责委托列表的 OCR 识别、地点识别、详情检测等
 */
import { COMMISSION_TYPE, OCR_REGIONS } from "../config/index.js";
import { bvPageOcrRegion, bvPageOcrRegionText } from "../vision/index.js";
import { standardizeCommissionName, standardizeCommissionLocation } from "./commission-standardizer.js";
import { detectCommissionStatusByImage } from "./status-detector.js";
import { scanCommissionAtPosition, clickCommissionDetail, exitCommissionDetail, getCommissionPosition } from "./commission-scanner.js";

/**
 * 识别委托地点
 * @returns {Promise<string>} 地点名称
 */
export async function recognizeCommissionLocation() {
  try {
    const location = bvPageOcrRegionText(OCR_REGIONS.LOCATION);
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
      const results = bvPageOcrRegion(OCR_REGIONS.DETAIL_COUNTRY);
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
 *
 * 遍历委托界面4个位置，依次识别委托名称、状态和地点
 * 第4个委托需要翻页操作
 *
 * 识别流程：
 * 1. 扫描委托名称（前3个直接识别，第4个需要翻页）
 * 2. 标准化委托名称（使用编辑距离算法匹配已知委托）
 * 3. 检测委托状态（已完成/未完成）
 * 4. 进入详情页识别地点
 * 5. 获取委托地图坐标
 * 6. 退出详情页
 */
export async function recognizeCommissions(supportedCommissions) {
  try {
    const allCommissions = [];

    // 遍历4个委托位置
    for (let i = 0; i < 4; i++) {
      // 使用共享函数扫描委托名称
      const rawName = await scanCommissionAtPosition(i);

      if (!rawName) {
        continue;
      }

      // 标准化委托名称
      const standardizedName = await standardizeCommissionName(rawName);

      // 判断委托类型
      const isBasic = supportedCommissions.basic.includes(standardizedName);
      const isNpc = supportedCommissions.npc.includes(standardizedName);
      const commission = {
        id: i + 1,
        name: standardizedName,
        supported: isBasic || isNpc,
        type: isBasic ? COMMISSION_TYPE.BASIC : isNpc ? COMMISSION_TYPE.NPC : "",
        location: "",
      };

      allCommissions.push(commission);

      try {
        // 检测委托状态
        const status = await detectCommissionStatusByImage(i, standardizedName);
        if (status === "completed") {
          commission.location = "已完成";
          continue;
        }

        // 进入委托详情
        log.info("查看第{id}个委托详情: {name}", commission.id, commission.name);
        await clickCommissionDetail(i);
        await sleep(700);

        // 识别详情信息
        const detailStatus = await checkDetailPageEntered();
        commission.country = detailStatus;
        let location = await recognizeCommissionLocation();

        // 标准化地点
        const standardizedLocation = standardizeCommissionLocation(commission.name, location);
        if (standardizedLocation && standardizedLocation !== location) {
          location = standardizedLocation;
        }
        commission.location = location;

        // 获取委托坐标（未完成的委托需要）
        if (commission.location !== "已完成") {
          const bigMapPosition = await getCommissionPosition();
          commission.CommissionPosition = bigMapPosition;

          // 退出详情页
          await exitCommissionDetail(1200);

          // 退出大地图（getPositionWithVoting操作了大地图，需要再次按ESC退出）
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
          // 错误恢复：确保退出详情页
          await exitCommissionDetail(1200);
        } catch (escapeError) {
          log.warn("尝试退出详情页面时出错: {error}", escapeError.message);
        }
      }
    }

    return allCommissions;
  } catch (error) {
    log.error("委托识别出错: {error}", error.message);
    return [];
  }
}
