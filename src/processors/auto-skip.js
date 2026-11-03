/**
 * 对话步骤处理器
 * 使用 BetterGI AutoSkip 实时任务处理 NPC 对话
 */
import { DIALOG_REGIONS } from "../config/index.js";
import { isInMainUI, isInTalkUI, bvPageOcrRegion } from "../vision/index.js";
import { extractName } from "../utils/text-utils.js";
import { isCancellationError } from "../utils/error-utils.js";
import { dispatchOnDialogOcr } from "../probes/index.js";

import { defineStep } from "./define-step.js";
const page = new BvPage();

function createAutoSkipConfig(priorityOptions) {
    const config = new AutoSkipConfig();
    config.enabled = true;
    config.quicklySkipConversationsEnabled = true;
    config.clickChatOption = "优先选择最后一个选项";
    config.customPriorityOptionsEnabled = priorityOptions.length > 0;
    config.customPriorityOptions = priorityOptions.join("\n");
    config.skipBuiltInClickOptions = true;
    config.autoGetDailyRewardsEnabled = false;
    config.autoReExploreEnabled = false;
    return config;
}

export default [
    defineStep({
        type: "对话",
        category: "交互方法",
        dataSpec: {
            kind: "object",
            optional: true,
            fields: {
                priorityOptions: {
                    type: "array",
                    label: "优先对话选项",
                    minItems: 1,
                    items: { type: "string", nonEmpty: true },
                    hint: "每行一个对话选项。",
                },
                npcWhiteList: {
                    type: "array",
                    label: "NPC 白名单",
                    minItems: 1,
                    items: { type: "string", nonEmpty: true },
                    hint: "每行一个 NPC 名称。",
                },
            },
        },
        run: async (step, context) => {
            try {
                log.info("执行对话步骤");
                const priorityOptions = Array.isArray(step.data?.priorityOptions) ? step.data.priorityOptions : [];
                const npcWhiteList = Array.isArray(step.data?.npcWhiteList) ? step.data.npcWhiteList : [];

                // 追踪任务描述，从当前任务描述中提取目标人名，作为白名单未命中时的兜底匹配源
                keyPress("V");
                await sleep(1000);
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

                const results = bvPageOcrRegion(DIALOG_REGIONS.DIALOG_OPTIONS);

                // 使用筛选方法先过滤出符合点击条件的元素，并保存匹配的NPC名称
                const matchedNPCs = Array.from(results)
                    .map(r => ({
                        element: r,
                        matchedNPC: npcWhiteList.find(npc => r.text.includes(npc))
                    }))
                    .filter(item => item.matchedNPC !== undefined);

                // 复用同一份 OCR，找一个文本包含提取人名的选项作为兜底点击目标
                const matchedByName = extractedName
                    ? Array.from(results).find(r => r.text.includes(extractedName))
                    : null;

                // 进入对话的判定：满足以下任一即视为进入对话
                //   1) 目标交互文本出现过并被点击至消失（交互成功）
                //   2) 检测到 InTalk 图标（左上角对话气泡）
                // 由于 BvFlow 单步只支持单一条件，无法表达"文本消失 或 InTalk 出现"的或条件，
                // 这里直接用一段有上限的轮询实现，非致命。
                const interactionTexts = matchedNPCs.length > 0
                    ? matchedNPCs.map(item => item.matchedNPC)
                    : (matchedByName ? [extractedName] : [""]);
                const interactionLocator = interactionTexts.length > 1
                    ? page.GetByAnyText(interactionTexts, DIALOG_REGIONS.DIALOG_OPTIONS)
                    : page.locator(interactionTexts[0], DIALOG_REGIONS.DIALOG_OPTIONS);

                const clickTargets = async () => {
                    keyDown("VK_MENU");
                    await sleep(400);
                    try {
                        // 按住 Alt 后第一次点击点不到，需要点两下（中间稍作间隔）
                        if (matchedNPCs.length > 0) {
                            for (const { matchedNPC } of matchedNPCs) {
                                log.info("找到白名单NPC: {npc}，点击该NPC", matchedNPC);
                                const locator = page.locator(matchedNPC, DIALOG_REGIONS.DIALOG_OPTIONS);
                                locator.click();
                                await sleep(400);
                                leftButtonClick();
                            }
                        } else if (matchedByName) {
                            log.info("点击包含提取到任务人名的选项: {text}", matchedByName.text);
                            matchedByName.click();
                            await sleep(400);
                            leftButtonClick();
                        } else {
                            log.info("点击交互区域内选项");
                            interactionLocator.click();
                            await sleep(400);
                            leftButtonClick();
                        }
                    } finally {
                        keyUp("VK_MENU");
                    }
                };

                let enteredDialog = false;
                const interactStart = Date.now();
                while (Date.now() - interactStart < 10000) {
                    if (isInTalkUI()) {
                        enteredDialog = true;
                        log.info("检测到已进入对话界面，进入自动对话");
                        break;
                    }
                    if (interactionLocator.isExist()) {
                        await clickTargets();
                        await sleep(300);
                        if (!interactionLocator.isExist()) {
                            enteredDialog = true;
                            log.info("目标交互文本已点击消失，进入自动对话");
                            break;
                        }
                    }
                    await sleep(500);
                }

                if (!enteredDialog) {
                    log.info("未检测到交互文本或对话界面，使用默认按F触发对话");
                    keyPress("F");
                    await sleep(100);
                    keyPress("F");
                    await sleep(400);
                }

                log.info("开始执行自动对话");

                // 探针总开关：仅当 step 显式声明 probe:true 才扫描分支条件
                // 一条流程通常有多个对话，关键词可能在非目标对话里出现，所以默认关闭、按需打开
                const probeEnabled = step.probe === true;

                const autoSkipConfig = createAutoSkipConfig(priorityOptions);
                dispatcher.AddTimer(new RealtimeTimer("AutoSkip", autoSkipConfig));
                try {
                    const startTime = Date.now();
                    while (Date.now() - startTime < 120000) {
                        if (probeEnabled && !context.branchConditionMet) {
                            dispatchOnDialogOcr(context, bvPageOcrRegion(DIALOG_REGIONS.DIALOG_CONTENT));
                            dispatchOnDialogOcr(context, bvPageOcrRegion(DIALOG_REGIONS.DIALOG_OPTIONS_OCR));
                        }
                        if (isInMainUI()) {
                            log.info("已返回主界面，AutoSkip 对话执行完成");
                            return;
                        }
                        await sleep(probeEnabled ? 200 : 500);
                    }
                    throw new Error("AutoSkip 对话执行超过 120 秒，但未检测到返回主界面");
                } finally {
                    dispatcher.ClearAllTriggers();
                }
            } catch (error) {
                if (isCancellationError(error)) { throw error; }
                log.error("执行对话步骤时出错: {error}", error.message);
                throw error;
            }
        },
    }),
];
