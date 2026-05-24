/**
 * 对话步骤处理器
 * 使用 DialogProcessor 处理 NPC 对话
 */
import { PATHS, DIALOG_REGIONS } from "../config/index.js";
import { isInMainUI, isInTalkUI, bvPageOcrRegion, templateMatchFindMulti } from "../vision/index.js";
import { extractName } from "../utils/text-utils.js";
import { isCancellationError } from "../utils/error-utils.js";
import { dispatchOnDialogOcr } from "../probes/index.js";

import { defineStep } from "./define-step.js";
const page = new BvPage();
export default [
    defineStep({
        type: "对话",
        run: async (step, context) => {
            try {
                log.info("执行对话步骤");
                const priorityOptions = Array.isArray(step.data.priorityOptions) ? step.data.priorityOptions : [];
                const npcWhiteList = Array.isArray(step.data.npcWhiteList) ? step.data.npcWhiteList : [];
                const mat = file.ReadImageMatSync(PATHS.INTALK_IMAGE);
                const talkRO = RecognitionObject.templateMatch(mat, 254, 19, 80, 52);
                const results = bvPageOcrRegion(DIALOG_REGIONS.DIALOG_OPTIONS);

                // 使用筛选方法先过滤出符合点击条件的元素，并保存匹配的NPC名称
                const matchedNPCs = Array.from(results)
                    .map(r => ({
                        element: r,
                        matchedNPC: npcWhiteList.find(npc => r.text.includes(npc))
                    }))
                    .filter(item => item.matchedNPC !== undefined);

                
                await page.locator(talkRO)
                    .withRetryInterval(500)
                    .withRetryAction(async () => {
                        for (let i = 0; i < matchedNPCs.length; i++) {
                            const { element, matchedNPC } = matchedNPCs[i];
                            log.info("找到白名单NPC: {npc}，点击该NPC", matchedNPC);
                            keyDown("VK_MENU");
                            await sleep(200);
                            element.click();
                            await sleep(100);
                            leftButtonClick();
                            keyUp("VK_MENU");
                        }
                    })
                    .waitFor();

                log.info("开始执行自动对话");

                // 探针总开关：仅当 step 显式声明 probe:true 才扫描分支条件
                // 一条流程通常有多个对话，关键词可能在非目标对话里出现，所以默认关闭、按需打开
                const probeEnabled = step.probe === true;

                for (let attempts = 0; attempts < 100; attempts++) {
                    const startTime = Date.now();
                    while (Date.now() - startTime < 1000) {
                        if (isInTalkUI()) {
                            // 翻页前先 OCR 当前台词，否则 SPACE 一按下一段就过去了
                            if (probeEnabled && !context.branchConditionMet) {
                                const speechOcr = bvPageOcrRegion(DIALOG_REGIONS.DIALOG_CONTENT);
                                dispatchOnDialogOcr(context, speechOcr);
                            }
                            keyPress("VK_SPACE");
                            await sleep(200);
                        } else {
                            break;
                        }
                    }
                    if (isInMainUI()) { log.info("检测到已返回主界面，结束循环"); break; }

                    let foundPriorityOption = false;
                    const ocrResults = bvPageOcrRegion(DIALOG_REGIONS.DIALOG_OPTIONS_OCR);

                    // 选项区也兼带扫一次：有些场景关键词出现在选项条目而非台词里（如 "偷吃看看"）
                    if (probeEnabled && !context.branchConditionMet) {
                        dispatchOnDialogOcr(context, ocrResults);
                    }

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

                        if (!foundPriorityOption && isInTalkUI()) {
                            const exitList = await templateMatchFindMulti(PATHS.TALK_EXIT_IMAGE, ...DIALOG_REGIONS.TALK_ICON, true);
                            const iconList = await templateMatchFindMulti(PATHS.TALK_ICON_IMAGE, ...DIALOG_REGIONS.TALK_ICON);
                            let clickXY = null;

                            if (exitList.count === 1) {
                                log.info("发现一个退出对话选项");
                                clickXY = [exitList[0].x, exitList[0].y];
                            } else if (iconList.count > 0) {
                                log.info("发现{count}个气泡对话选项，点击最后一个气泡选项", iconList.count);
                                const sorted = Array.from(iconList).sort(function (a, b) { return b.y - a.y; });
                                clickXY = [sorted[0].x, sorted[0].y];
                            } else if (ocrResults.count > 0) {
                                log.info("默认点击最后一个选项");
                                clickXY = [ocrResults[ocrResults.count - 1].x, ocrResults[ocrResults.count - 1].y];
                            }

                            if (clickXY) {
                                click(clickXY[0], clickXY[1]);
                                leftButtonClick();
                            }
                        }
                    }
                }

                if (isInMainUI()) {
                    log.info("已返回主界面，自动对话执行完成");
                } else {
                    throw new Error(`自动对话已达到最大尝试次数 ${attempts}，但未检测到返回主界面`);
                }
            } catch (error) {
                if (isCancellationError(error)) { throw error; }
                log.error("执行对话步骤时出错: {error}", error.message);
                throw error;
            }
        },
    }),
];


