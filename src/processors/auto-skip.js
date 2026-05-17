/**
 * 对话步骤处理器
 * 使用 DialogProcessor 处理 NPC 对话
 */
import { PATHS, DIALOG_REGIONS } from "../config/index.js";
import { isInMainUI, bvPageOcrRegion, templateMatchFindMulti } from "../vision/index.js";
import { extractName } from "../utils/text-utils.js";
import { isCancellationError } from "../utils/error-utils.js";

import { defineStep } from "./define-step.js";

export default [
    defineStep({
        type: "对话",
        run: async (step, context) => {
            await executeDialogStep(step, context);
        },
    }),
];

/**
 * 执行优化的自动对话
 * 
 * 自动处理对话流程：识别NPC、选择对话选项、跳过剧情
 * 
 * @param {Object} options - 配置选项
 * @param {string[]} [options.priorityOptions] - 优先对话选项
 * @param {string[]} [options.npcWhiteList] - NPC 白名单
 */
async function executeOptimizedAutoTalk(options) {
    const priorityOptions = (options && options.priorityOptions) || [];
    const npcWhiteList = (options && options.npcWhiteList) || [];
    keyPress("V");

    let extractedName = null;
    const nameResults = bvPageOcrRegion(DIALOG_REGIONS.NPC_NAME);
    for (let i = 0; i < nameResults.count; i++) {
        const text = nameResults[i].text;
        log.info("任务区域识别文本: {text}", text);
        const name = extractName(text);
        if (name) {
            extractedName = name;
            log.info("提取到人名: {name}", extractedName);
            break;
        }
    }

    const dialogResults = bvPageOcrRegion(DIALOG_REGIONS.DIALOG_OPTIONS);
    const talkIconRegion = DIALOG_REGIONS.TALK_ICON;
    let clickedWhitelistNPC = false;
    let clickedExtractedName = false;

    if (dialogResults.count > 0) {
        for (let i = 0; i < dialogResults.count; i++) {
            const text = dialogResults[i].text;
            const res = dialogResults[i];
            for (let j = 0; j < npcWhiteList.length; j++) {
                if (text.includes(npcWhiteList[j])) {
                    log.info("找到白名单NPC: {npc}，点击该NPC", npcWhiteList[j]);
                    keyDown("VK_MENU");
                    await sleep(500);
                    click(res.x, res.y);
                    leftButtonClick();
                    keyUp("VK_MENU");
                    await sleep(200);
                    if (!isInMainUI()) { clickedWhitelistNPC = true; break; }
                }
            }
        }

        if (!clickedWhitelistNPC && extractedName) {
            for (let i = 0; i < dialogResults.count; i++) {
                const text = dialogResults[i].text;
                const res = dialogResults[i];
                if (text.includes(extractedName)) {
                    log.info("点击包含提取到任务人名的选项: {text}", text);
                    keyDown("VK_MENU");
                    await sleep(500);
                    click(res.x, res.y);
                    leftButtonClick();
                    keyUp("VK_MENU");
                    await sleep(200);
                    if (!isInMainUI()) { clickedExtractedName = true; break; }
                }
            }
        }
    }

    if (!clickedWhitelistNPC && !clickedExtractedName) {
        log.info("未找到匹配的NPC，使用默认触发方式");
        keyPress("F");
        await sleep(100);
        keyPress("F");
        await sleep(400);
    }

    const maxAttempts = 100;
    let attempts = 0;
    await sleep(1000);
    log.info("开始执行自动剧情");

    while (!isInMainUI() && attempts < maxAttempts) {
        attempts++;
        const startTime = Date.now();
        while (Date.now() - startTime < 1000) {
            keyPress("VK_SPACE");
            await sleep(200);
        }
        if (isInMainUI()) { log.info("检测到已返回主界面，结束循环"); break; }

        let foundPriorityOption = false;
        const ocrResults = bvPageOcrRegion(DIALOG_REGIONS.DIALOG_OPTIONS_OCR);
        if (ocrResults.count > 0) {
            for (let i = 0; i < ocrResults.count; i++) {
                const ocrText = ocrResults[i].text;
                for (let j = 0; j < priorityOptions.length; j++) {
                    if (ocrText.includes(priorityOptions[j])) {
                        log.info("找到优先选项: {option}，点击该选项", priorityOptions[j]);
                        ocrResults[i].click();
                        await sleep(500);
                        foundPriorityOption = true;
                        break;
                    }
                }
                if (foundPriorityOption) break;
            }

            if (!foundPriorityOption && !isInMainUI()) {
                const exitList = await templateMatchFindMulti(PATHS.TALK_EXIT_IMAGE, ...talkIconRegion, true);
                const iconList = await templateMatchFindMulti(PATHS.TALK_ICON_IMAGE, ...talkIconRegion);
                let clickXY = null;

                if (exitList.count === 1) {
                    log.info("发现一个退出对话选项");
                    clickXY = [exitList[0].x, exitList[0].y];
                } else if (iconList.count > 0) {
                    log.info("发现{count}个气泡对话选项，点击最后一个气泡选项", iconList.count);
                    const sorted = Array.from(iconList).sort(function(a, b) { return b.y - a.y; });
                    clickXY = [sorted[0].x, sorted[0].y];
                } else if (ocrResults.count > 0) {
                    log.info("默认点击最后一个选项");
                    clickXY = [ocrResults[ocrResults.count - 1].x, ocrResults[ocrResults.count - 1].y];
                }

                if (clickXY) {
                    keyDown("VK_MENU");
                    await sleep(300);
                    click(clickXY[0], clickXY[1]);
                    leftButtonClick();
                    keyUp("VK_MENU");
                }
            }
        }

        if (isInMainUI()) { log.info("检测到已返回主界面，结束循环"); break; }
    }

    if (isInMainUI()) {
        log.info("已返回主界面，自动剧情执行完成");
        await sleep(500);
        keyPress("V");
        await sleep(2000);
    } else {
        log.warn("已达到最大尝试次数 {attempts}，但未检测到返回主界面", maxAttempts);
    }
}

/**
 * 执行对话步骤（使用 DialogProcessor）
 * 
 * 从步骤数据中读取 priorityOptions 和 npcWhiteList 配置，执行自动对话
 * 
 * @param {Object} step - 流程步骤
 * @param {Object} context - 执行上下文
 */
async function executeDialogStep(step, context) {
    try {
        log.info("执行对话步骤");
        let priorityOptions = [];
        let npcWhiteList = [];

        if (step.data && typeof step.data === "object") {
            if (Array.isArray(step.data.priorityOptions)) {
                priorityOptions = step.data.priorityOptions;
            }
            if (Array.isArray(step.data.npcWhiteList)) {
                npcWhiteList = step.data.npcWhiteList;
            }
        }

        await executeOptimizedAutoTalk({
            priorityOptions: priorityOptions,
            npcWhiteList: npcWhiteList,
        });
    } catch (error) {
        if (isCancellationError(error)) { throw error; }
        log.error("执行对话步骤时出错: {error}", error.message);
        throw error;
    }
}
