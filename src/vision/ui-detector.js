/**
 * UI 检测与操作工具
 * 使用 BvPage 检测游戏界面状态，提供通用 UI 操作
 */
import { PATHS } from "../config/index.js";

/**
 * 检测是否在主界面
 * @returns {boolean}
 */
export function isInMainUI() {
  const mat = file.ReadImageMatSync(PATHS.PAIMON_MENU_IMAGE);
  try {
    const ro = RecognitionObject.TemplateMatch(mat, 0, 0, genshin.width / 3.0, genshin.width / 5.0);
    const page = new BvPage();
    const results = page.Locator(ro).FindAll();
    return results.count > 0;
  } finally {
    mat.Dispose();
  }
}

/**
 * 检测是否在商店界面
 * @returns {boolean}
 */
export function isStoreUI() {
  const mat = file.ReadImageMatSync(PATHS.STORE_IMAGE);
  try {
    const ro = RecognitionObject.TemplateMatch(mat, 0, 0, genshin.width / 3.0, genshin.width / 5.0);
    const page = new BvPage();
    const results = page.Locator(ro).FindAll();
    return results.count > 0;
  } finally {
    mat.Dispose();
  }
}

/**
 * 进入委托界面（F1快捷键 + 点击委托标签）
 * @returns {Promise<boolean>}
 */
export async function enterCommissionScreen() {
  try {
    keyPress("VK_F1");
    await sleep(1000);
    click(300, 350);
    await sleep(100);
    click(300, 350);
    await sleep(1000);
    return true;
  } catch (error) {
    log.error("进入委托界面失败: {error}", error);
    return false;
  }
}

/**
 * 委托列表翻页（模拟鼠标拖拽）
 * @param {number} scrollCount - 滚动次数
 * @returns {Promise<boolean>}
 */
export async function pageScroll(scrollCount) {
  try {
    const clickX = 950;
    const clickY = 600;
    const totalDistance = 200;
    const stepDistance = 10;
    for (let i = 0; i < scrollCount; ++i) {
      moveMouseTo(clickX, clickY);
      await sleep(100);
      leftButtonDown();
      const steps = totalDistance / stepDistance;
      for (let j = 0; j < steps; j++) {
        moveMouseBy(0, -stepDistance);
        await sleep(10);
      }
      await sleep(100);
      leftButtonUp();
      await sleep(300);
    }
    return true;
  } catch (error) {
    log.error("执行滑动操作时发生错误：{error}", error.message);
    return false;
  }
}
