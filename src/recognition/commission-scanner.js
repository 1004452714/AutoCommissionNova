/**
 * 委托扫描共享模块
 * 提取 commission-recognizer.js 和 commission-finder.js 中的公共逻辑
 * 避免代码重复，提高可维护性
 */
import { OCR_REGIONS, COMMISSION_DETAIL_BUTTONS, MIN_TEXT_LENGTH } from "../config/index.js";
import { bvPageOcrRegion, pageScroll } from "../vision/index.js";
import { cleanText } from "../utils/text-utils.js";
import { getPositionWithVoting } from "../navigation/position-utils.js";

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
 * 
 * @example
 * const index = await findCommissionIndex("语言交流");
 * if (index !== -1) {
 *   console.log("委托在第", index + 1, "个位置");
 * }
 */
export async function findCommissionIndex(targetName) {
  // 先扫描前3个委托
  for (let positionIndex = 0; positionIndex < 3; positionIndex++) {
    const name = await scanCommissionAtPosition(positionIndex);
    
    if (name === targetName) {
      log.info("找到委托 {name} 在位置 {index}", targetName, positionIndex + 1);
      return positionIndex;
    }
  }
  
  // 前3个未找到，检查第4个
  const fourthName = await scanCommissionAtPosition(3);
  if (fourthName === targetName) {
    log.info("找到委托 {name} 在第4个位置", targetName);
    return 3;
  }
  
  return -1;
}

/**
 * 点击指定位置的委托详情按钮
 * 
 * 根据委托位置索引点击对应的详情按钮
 * 按钮坐标定义在 COMMISSION_DETAIL_BUTTONS 中
 * 
 * @param {number} positionIndex - 委托位置索引（0-3）
 * @returns {Promise<boolean>} 点击是否成功
 * 
 * @example
 * // 点击第1个委托的详情
 * await clickCommissionDetail(0);
 */
export async function clickCommissionDetail(positionIndex) {
  const button = COMMISSION_DETAIL_BUTTONS[positionIndex];
  
  if (!button) {
    log.error("无效的委托位置索引: {index}", positionIndex);
    return false;
  }
  
  click(button.x, button.y);
  return true;
}

/**
 * 退出委托详情界面
 * 
 * 通过模拟ESC按键操作退出当前详情界面
 * 包含按键按下、延迟、按键释放的完整流程
 * 
 * @param {number} [waitMs=1200] - 退出后等待的毫秒数，默认1200
 * @returns {Promise<void>}
 * 
 * @example
 * // 退出详情界面
 * await exitCommissionDetail();
 * 
 * @example
 * // 退出并等待2秒
 * await exitCommissionDetail(2000);
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
 * 
 * @example
 * const position = await getCommissionPosition();
 * if (position) {
 *   console.log("委托坐标:", position.x, position.y);
 * }
 */
export async function getCommissionPosition() {
  try {
    return await getPositionWithVoting();
  } catch (error) {
    log.error("获取委托坐标时出错: {error}", error.message);
    return null;
  }
}
