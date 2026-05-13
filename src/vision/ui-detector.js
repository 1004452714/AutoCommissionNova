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
 * 进入委托界面（F1快捷键 + 点击委托标签）
 * @returns {Promise<boolean>}
 */
export async function enterCommissionScreen() {
  try {
    const page = new BvPage();
    const rect1 = new OpenCvSharp.OpenCvSharp.Rect(260, 317, 89, 47);
    const rect2 = new OpenCvSharp.OpenCvSharp.Rect(427, 345, 142, 36);
    
    // 确保打开冒险之证界面
    await page.Locator("委托", rect1).withRetryAction(() => keyPress("VK_F1")).waitFor();
    
    // 确保进入委托界面，否则点击委托标签进入
    await page.Locator("每日委托奖励", rect2).withRetryAction(() => click(300, 350)).waitFor();
    log.info("已进入委托界面");
  } catch (error) {
    log.error("进入委托界面失败: {error}", error.message);
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
