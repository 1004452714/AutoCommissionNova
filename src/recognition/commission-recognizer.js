/**
 * 委托识别主模块
 * 负责委托列表的 OCR 识别、地点识别、详情检测等
 */
import { COMMISSION_TYPE, OCR_REGIONS, UI_REGIONS } from "../config/index.js";
import { bvPageOcrRegion, bvPageOcrRegionText, pageScroll } from "../vision/index.js";
import { standardizeCommissionName, standardizeCommissionLocation } from "./commission-standardizer.js";
import { detectCommissionStatusByImage } from "./status-detector.js";
import { getCommissionPosition } from "./commission-scanner.js";
import { COMMISSION_STATUS_REGIONS } from "../config/index.js";
import { PATHS } from "../config/index.js";
/**
 * 识别委托地点
 * @returns {Promise<string>} 地点名称
 */
export async function recognizeCommissionLocation(country) {
    try {
        const ocrRegion = country === "挪德卡莱" ? OCR_REGIONS.LOCATION_IN_NOD_KRAI : OCR_REGIONS.LOCATION_IN_OTHER_COUNTRY;
        const location = bvPageOcrRegionText(ocrRegion);

        if (location && location.trim()) {
            return location.trim();
        }

        return "未知地点";

    } catch (error) {
        log.error("识别委托地点时出错: {error}", error.message);
        return "未知地点";
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
                    switch (true) {
                        case text.includes("蒙德"):
                            return "蒙德";
                        case text.includes("璃月"):
                            return "璃月";
                        case text.includes("稻妻"):
                            return "稻妻";
                        case text.includes("须弥"):
                            return "须弥";
                        case text.includes("枫丹"):
                            return "枫丹";
                        case text.includes("纳塔"):
                            return "纳塔";
                        case text.includes("挪德"):
                            return "挪德卡莱";
                        case text.length >= 1:
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
 *
 * @param {Object} supportedCommissions - 支持的委托列表
 * @returns {Promise<Array>} 委托信息数组
 */
export async function recognizeCommissions(supportedCommissions) {
    try {
        const allCommissions = [];
        const page = new BvPage();
        const Rect = OpenCvSharp.OpenCvSharp.Rect;
        let commission;
        // 遍历4个委托位置
        for (let i = 0; i < 4; i++) {
            try {
                commission = {};
                if (i === 3) { await pageScroll(1) };  // 第4个委托需要翻页
                const id = i + 1;
                const rawName = bvPageOcrRegionText(OCR_REGIONS.COMMISSION_NAME[i]);
                log.info("识别到第{id}个委托名称: {name}", id, rawName);

                // 标准化委托名称
                const standardizedName = standardizeCommissionName(rawName);
                // 判断委托类型
                const isBasic = supportedCommissions.basic.includes(standardizedName);
                const isNpc = supportedCommissions.npc.includes(standardizedName);
                commission = {
                    id: id,
                    name: standardizedName,
                    supported: isBasic || isNpc,
                    type: isBasic ? COMMISSION_TYPE.BASIC : isNpc ? COMMISSION_TYPE.NPC : "",
                    location: "",
                };
                allCommissions.push(commission);
                // 检测委托状态
                const status = await detectCommissionStatusByImage(i);
                log.info("第{id}个委托状态: {status}", id, status);
                if (status === "completed") {
                    commission.location = "已完成";
                    continue;
                }

                // 进入委托详情
                log.info("查看第{id}个委托详情: {name}", id, standardizedName);

                //尝试点击委托的追踪按钮跳转到大地图，直到追踪按钮出现
                const trackRo = RecognitionObject.TemplateMatch(file.ReadImageMatSync(PATHS.TRACK_IMAGE), ...UI_REGIONS.TRACK_BUTTON);
                const trackLo = page.locator(trackRo);
                await trackLo.withRetryAction(async () => {
                    const button = COMMISSION_POSITIONING_BUTTONS[i];
                    click(button.x, button.y);
                    await sleep(500); //打开大地图跳转有些微延迟
                }).waitFor();


                // 识别国家
                const country = await checkDetailPageEntered();
                commission.country = country;

                // 识别地点并标准化地点
                let location = await recognizeCommissionLocation(country);
                commission.location = standardizeCommissionLocation(commission.name, location);

                // 获取委托任务所在位置坐标
                const bigMapPosition = await getCommissionPosition();
                commission.CommissionPosition = bigMapPosition;

                // 返回冒险之证-委托页面
                await page.Locator("每日委托奖励", UI_REGIONS.DAILY_COMMISSION_REWARD).withRetryAction(async () => {
                    log.info("尝试从地图返回委托页面");
                    keyPress("VK_ESCAPE"); //关闭详情页
                    await sleep(500);
                    keyPress("VK_ESCAPE");//关闭大地图
                    await sleep(1000); //关闭大地图跳转有些微延迟
                }).waitFor();

            } catch (error) {
                log.error("处理第 {id} 个委托 {name} 时出错: {error}", commission.id, commission.name, error.message);
                log.debug("错误详情:{error}", error);
                commission.location = "处理失败";
                commission.country = "未知";

            }
        }

        return allCommissions;
    } catch (error) {
        log.error("委托识别出错: {error}", error.message);
        log.debug("错误详情:{error}", error);
        return [];
    }
}
