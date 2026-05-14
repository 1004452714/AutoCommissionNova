/**
 * 委托扫描共享模块
 * 提取 commission-recognizer.js 和 commission-finder.js 中的公共逻辑
 * 避免代码重复，提高可维护性
 */
import { OCR_REGIONS, MIN_TEXT_LENGTH } from "../config/index.js";
import { bvPageOcrRegion, pageScroll } from "../vision/index.js";
import { cleanText } from "../utils/text-utils.js";
import { getPositionWithVoting } from "../navigation/position-utils.js";
import { standardizeCommissionName } from "./commission-standardizer.js";

/**
 * 扫描指定位置的委托名称
 * 
 * 对委托界面指定位置进行OCR识别，返回识别到的委托名称
 * 
 * @param {number} positionIndex - 委托位置索引（0-3）
 * @returns {Promise<string|null>} 识别到的委托名称，失败返回null
 */
export async function scanCommissionAtPosition(positionIndex) {
  // 第4个委托需要翻页
  if (positionIndex === 3) {
    await pageScroll(1);
  }

  const region = OCR_REGIONS.COMMISSION_NAME[positionIndex];

  try {
    const results = bvPageOcrRegion(region);

    for (let i = 0; i < results.count; i++) {
      const text = cleanText(results[i].text);

      // 过滤掉太短的文本（可能是误识别）
      if (text && text.length >= MIN_TEXT_LENGTH) {
        return text;
      }
    }
  } catch (error) {
    log.error("识别第{index}个委托区域时出错: {error}", positionIndex + 1, error.message);
  }

  return null;
}

/**
 * 查找指定委托在界面中的位置索引
 * 
 * 遍历委托界面的4个位置，查找匹配的委托名称
 * 返回位置索引（0-3），未找到返回-1
 * 
 * @param {string} targetName - 目标委托名称
 * @returns {Promise<number>} 委托位置索引（0-3），未找到返回-1
 */
export async function findCommissionIndex(targetName) {

  for (let positionIndex = 0; positionIndex < 4; positionIndex++) {

    // 第4个委托需要翻页
    if (positionIndex === 3) { await pageScroll(1); }

    //ocr委托名称然后标准化名称
    const name = standardizeCommissionName(
      bvPageOcrRegionText(OCR_REGIONS.COMMISSION_NAME[positionIndex])
    );
    if (name === targetName) {
      log.info("找到委托 {name} 在位置 {index}", targetName, positionIndex + 1);
      return positionIndex;
    }
  }
  return -1;
}


/**
 * 退出委托详情界面
 * 
 * 通过模拟ESC按键操作退出当前详情界面
 * 包含按键按下、延迟、按键释放的完整流程
 * 
 * @param {number} [waitMs=1200] - 退出后等待的毫秒数，默认1200
 * @returns {Promise<void>}
 */
export async function exitCommissionDetail(waitMs = 1200) {
  keyDown("VK_ESCAPE");
  await sleep(300);
  keyUp("VK_ESCAPE");
  await sleep(waitMs);
}

/**
 * 获取当前委托的地图坐标
 * 
 * 进入委托详情后，通过投票定位算法获取委托在游戏地图中的坐标
 * 用于战斗委托流程的距离匹配
 * 
 * @returns {Promise<Object|null>} 坐标对象 {x, y}，失败返回null
 */
export async function getCommissionPosition() {
  try {
    return await getPositionWithVoting();
  } catch (error) {
    log.error("获取委托坐标时出错: {error}", error.message);
    return null;
  }
}
