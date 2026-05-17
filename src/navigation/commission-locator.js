/**
 * 委托目标查找模块
 * 在委托界面中查找指定委托并获取其地图位置
 */
import { OCR_REGIONS } from "../config/index.js";
import { enterCommissionScreen } from "../vision/index.js";
import { findCommissionIndex, getCommissionPosition, clickCommissionAndOpenMap } from "../recognition/commission-scanner.js";

/**
 * 寻找委托目标位置并追踪
 * @param {string} commissionName - 委托名称
 * @returns {Promise<Object|null>} 位置对象
 */
export async function findCommissionTarget(commissionName) {
    try {
        const page = new BvPage();
        log.info("开始寻找委托目标位置: {name}", commissionName);
        await genshin.returnMainUi();

        await enterCommissionScreen();

        const foundIndex = await findCommissionIndex(commissionName);
        if (foundIndex === -1) {
            log.warn("未找到委托: {name}", commissionName);
            return null;
        }

        let currentCommissionPosition = null;

        await clickCommissionAndOpenMap(page, foundIndex);

        await page.locator("取消追踪", OCR_REGIONS.COMMISSION_TRACKING).withRetryInterval(1000).withRetryAction(() => click(1693, 1000)).waitFor();
        await page.locator("取消追踪", OCR_REGIONS.COMMISSION_TRACKING).withRetryInterval(1000).withRetryAction(() => keyPress("VK_ESCAPE")).waitForDisappear();

        currentCommissionPosition = await getCommissionPosition();
        await genshin.returnMainUi();

        return currentCommissionPosition;
    } catch (error) {
        log.error("寻找委托目标位置时出错: {error}", error.message);
        log.debug("错误详情:", error);
        return null;
    }
}
