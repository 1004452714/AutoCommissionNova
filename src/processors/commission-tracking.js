/**
 * 追踪委托步骤处理器
 */
import { RO } from "../vision/index.js";
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
 * - 图标在 (920-980, <540) 范围内认为视角已调正
 * - 图标Y坐标 >= 520 时需要重新调整视角
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

    // 打开大地图
    middleButtonClick();
    await sleep(800);

    // 停止信号（用于终止后台异步任务）
    const cancel = { flag: false };

    // === 异步：持续微调视角 ===
    const adjustTask = async () => {
        while (!cancel.flag) {
            await sleep(250);
            try {
                const cap = captureGameRegion();
                try {
                    const iconRes = cap.Find(iconTemplateRO);
                    if (iconRes.x >= 920 && iconRes.x <= 980 && iconRes.y < 540) continue;
                    if (iconRes.y >= 520) moveMouseBy(0, 600);
                    const adjustAmount = iconRes.x < 920 ? -8 : 8;
                    const distanceToCenter = Math.abs(iconRes.x - 920);
                    const scaleFactor = Math.max(1, Math.floor(distanceToCenter / 80));
                    moveMouseBy(adjustAmount * Math.min(scaleFactor, 3), 0);
                    keyPress("v");
                } finally { cap.Dispose(); }
            } catch (e) {
                log.error("视角调整异常: {e}", e);
            }
        }
    };

    // === 异步：持续前进 ===
    const moveTask = async () => {
        while (!cancel.flag) {
            keyDown("w");
            await sleep(200);
            keyPress("VK_SPACE");
            await sleep(100);
            keyUp("w");
            await sleep(200);
            forwardAttemptCount++;
        }
    };

    // === 阶段1：粗调视角（先大致对准方向再并行移动）===
    for (let i = 0; i < 15; i++) {
        const cap = captureGameRegion();
        try {
            const iconRes = cap.Find(iconTemplateRO);
            if (iconRes.x >= 750 && iconRes.x <= 1150 && iconRes.y < 600) {
                log.info("粗调完成");
                break;
            }
            if (iconRes.y >= 520) moveMouseBy(0, 920);
            const adjustAmount = iconRes.x < 750 ? -20 : 20;
            const distanceToCenter = Math.abs(iconRes.x - 750);
            moveMouseBy(adjustAmount * Math.max(1, Math.floor(distanceToCenter / 80)), 0);
        } finally {
            cap.Dispose();
        }
        await sleep(100);
    }

    // === 启动并行异步任务（不带 await）===
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
                    if (autoTalk) keyPress("VK_F");
                    return;
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
