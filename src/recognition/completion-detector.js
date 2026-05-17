/**
 * 委托完成检测模块
 * 检查委托是否已完成
 */
import { OCR_REGIONS } from "../config/index.js";
import { enterCommissionScreen, detectCommissionStatusByImage, bvPageOcrRegionText, pageScroll } from "../vision/index.js";
import { standardizeCommissionName } from "./commission-standardizer.js";
import { isCancellationError } from "../utils/error-utils.js";

/**
 * 检查指定委托是否已完成
 * 通过遍历4个委托位置的OCR识别，匹配委托名后检测其完成状态
 * @param {string} commissionName - 委托名称
 * @returns {Promise<boolean>}
 */
export async function isCompleted(commissionName) {
    try {
        const enterSuccess = await enterCommissionScreen();
        if (!enterSuccess) {
            log.error("无法进入委托界面");
            return false;
        }
        await sleep(900);

        for (let i = 0; i < 4; i++) {
            if (i === 3) { await pageScroll(1); }  // 第4个委托需要翻页
            const ocrRegion = OCR_REGIONS.COMMISSION_NAME[i];
            const rawName = bvPageOcrRegionText(ocrRegion);
            const standardizedName = standardizeCommissionName(rawName);

            if (standardizedName === commissionName) {
                log.info("找到委托 {name}，检测完成状态", commissionName);
                const status = await detectCommissionStatusByImage(i);
                return status === "completed";
            }
            await sleep(1);
        }

        log.warn("未在委托界面找到委托: {name}", commissionName);
        return false;
    } catch (error) {
        if (isCancellationError(error)) { throw error; }
        log.error("检查委托完成状态失败: {error}", error.message);
        try {
            await genshin.returnMainUi();
        } catch (exitError) {
            if (isCancellationError(exitError)) { throw exitError; }
            log.warn("退出委托界面失败: {error}", exitError);
        }
        return false;
    }
}
