/**
 * 委托目标查找模块
 * 在委托界面中查找指定委托并获取其地图位置
 */
import { OCR_REGIONS, UI_REGIONS, PATHS, COMMISSION_POSITIONING_BUTTONS } from "../config/index.js";
import { enterCommissionScreen } from "../vision/index.js";
import { findCommissionIndex, getCommissionPosition } from "../recognition/commission-scanner.js";

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

        const trackRo = RecognitionObject.TemplateMatch(file.ReadImageMatSync(PATHS.TRACK_IMAGE), ...UI_REGIONS.TRACK_BUTTON);
        const trackLo = page.locator(trackRo);
        await trackLo.withRetryAction(async () => {
            const button = COMMISSION_POSITIONING_BUTTONS[foundIndex];
            click(button.x, button.y);
            await sleep(500); //打开大地图跳转有些微延迟
        }).waitFor();

        await page.locator("取消追踪", OCR_REGIONS.COMMISSION_TRACKING).withRetryAction(() => click(1693, 1000)).waitFor();
        await page.locator("取消追踪", OCR_REGIONS.COMMISSION_TRACKING).withRetryAction(() => keyPress("VK_ESCAPE")).waitForDisappear();

        currentCommissionPosition = await getCommissionPosition();
        await genshin.returnMainUi();

        return currentCommissionPosition;
    } catch (error) {
        log.error("寻找委托目标位置时出错: {error}", error.message);
        log.debug("错误详情:", error);
        return null;
    }
}
