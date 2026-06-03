/**
 * 追踪委托步骤处理器
 */
import { isInTalkUI, RO } from "../vision/index.js";
import { defineStep } from "./define-step.js";

/**
 * 根据 iconType 取对应的 RO 模板；未知类型回退到普通任务图标
 */
function pickIconRo(iconType) {
    const type = (iconType || "").toLowerCase();
    if (type === "bigmap") {
        log.info("使用大地图图标");
        return RO.iconBigmap;
    } else if (type === "question") {
        log.info("使用问号任务图标");
        return RO.iconQuestion;
    }
    log.info("使用任务图标");
    return RO.iconTask;
}

/**
 * 自动导航到 NPC 对话位置
 *
 * 通过地图图标匹配和前进检测，自动导航到目标NPC位置
 * 支持多种图标类型和到达后自动对话功能
 *
 * 坐标说明（基于1920×1080分辨率）：
 * - 屏幕中心约在 (960, 540)
 * - 图标在 (900-1020, <540) 范围内认为视角已调正
 * - 图标Y坐标 >= 520 时说明目标在镜头背后，需大幅调整X轴转身
 *
 * @param {Object} options - 配置选项
 * @param {string} [options.npcName] - 目标 NPC 名称
 * @param {string} [options.iconType] - 图标类型 "Bigmap"|"Question"|"Task"
 * @param {boolean} [options.autoTalk] - 到达后是否自动对话
 * @returns {Promise<void>}
 */
async function autoNavigateToTalk(options = {}) {
    const { npcName = "", iconType = "", autoTalk = false } = options;

    // 目标NPC名称（用于到达检测）
    const targetText = npcName;
    const iconTemplateRO = pickIconRo(iconType);

    // 前进次数计数器（用于超时检测）
    let forwardAttemptCount = 0;
    let lookedDownOnce = false;

    middleButtonClick();
    await sleep(800);

    // 停止信号（用于终止后台异步任务）
    const cancel = { flag: false };

    /**
     * 持续微调视角的异步任务
     * 根据图标在椭圆环上的位置动态调整视角
     * 移动距离与偏离距离完全线性成比例，无阈值
     * 
     * @param {number} [maxAdjustCount] - 最大调整次数，未传入时使用 cancel.flag 持续调整
     */
    const adjustTask = async (maxAdjustCount = null) => {
        let adjustCount = 0;
        let failCount = 0;
        while (!cancel.flag && (maxAdjustCount === null || adjustCount < maxAdjustCount)) {
            adjustCount++;
            await sleep(250);
            try {
                const cap = captureGameRegion();
                try {
                    const iconRes = cap.Find(iconTemplateRO);

                    // 识别失败处理
                    if (iconRes.isEmpty()) {
                        failCount++;
                        log.warn("图标识别失败，连续失败次数: {count}/5", failCount);
                        if (failCount >= 5) {
                            log.error("图标连续识别失败5次");
                            cancel.flag = true;
                            return;
                        }
                        continue;
                    }

                    // 识别成功，重置失败计数
                    failCount = 0;

                    if (iconRes.x >= 900 && iconRes.x <= 1020 && iconRes.y < 540) continue;

                    if (iconRes.y >= 520 && !lookedDownOnce) {
                        lookedDownOnce = true;
                        log.debug("图标位于画面下方，先下拉镜头后重新判断");
                        moveMouseBy(0, 520);
                        continue;
                    }

                    const distanceToCenter = iconRes.x - 960;

                    if (iconRes.y >= 520) {
                        const moveX = distanceToCenter * 1.5;
                        moveMouseBy(Math.round(moveX), 0);
                    } else {
                        const moveX = distanceToCenter;
                        moveMouseBy(Math.round(moveX), 0);
                    }
                } finally { cap.Dispose(); }
            } catch (e) {
                log.error("视角调整异常: {e}", e);
            }
        }
    };

    // === 异步：持续前进 ===
    const moveTask = async () => {
        let jump = 1;
        while (!cancel.flag) {
            jump++;
            keyDown("w");
            await sleep(1000);
            if (jump % 2 === 0) {
                keyPress("VK_SPACE");
                await sleep(100);
            }

            keyUp("w");
            await sleep(200);
            forwardAttemptCount++;
        }
    };

    // 先执行固定次数的视角调整
    await adjustTask(15);

    // === 启动并行异步任务 ===
    adjustTask();
    moveTask();

    // === 阶段2：OCR 到达检测主循环 ===
    while (!cancel.flag) {
        await sleep(500);
        const captureRegion = captureGameRegion();
        try {
            const rewardTextArea = captureRegion.DeriveCrop(1210, 515, 200, 50);
            try {
                const rewardResult = rewardTextArea.find(RecognitionObject.ocrThis);
                log.debug("检测到文字: " + rewardResult.text);

                if (rewardResult.text === targetText) {
                    cancel.flag = true;
                    log.info("已到达指定位置，检测到文字: " + rewardResult.text);
                    if (autoTalk) {
                        log.info("按F键开始对话");
                        keyPress("VK_F")
                    }
                    return;
                } else if (isInTalkUI()) {
                    log.info("已进入对话界面");
                    cancel.flag = true;

                } else if (forwardAttemptCount > 80) {
                    cancel.flag = true;
                    throw new Error("前进时间超时");
                }
            } finally {
                rewardTextArea.Dispose();
            }
        } finally {
            captureRegion.Dispose();
        }
    }
}

const run = async (step, context) => {
    let targetNpc = "";
    let iconType = "bigmap";
    let autoTalk = false;

    if (typeof step.data === "string") { targetNpc = step.data; }
    else if (typeof step.data === "object") {
        if (step.data.npc) targetNpc = step.data.npc;
        if (step.data.iconType) iconType = step.data.iconType;
        if (step.data.autoTalk) autoTalk = step.data.autoTalk;
    }

    log.info("执行追踪委托，目标NPC: {target}，图标类型: {type}", targetNpc, iconType);
    await autoNavigateToTalk({ npcName: targetNpc, iconType: iconType, autoTalk: autoTalk });
    log.info("追踪委托执行完成");
};

export default defineStep({
    types: ["追踪委托", "委托追踪"],
    run,
});
