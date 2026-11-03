/**
 * 交互步骤处理器
 * 纯交互：等待目标交互文字出现并按交互键/点击，不启动 AutoSkip、不轮询主界面。
 * 适用于进房间、开门、拾取地上道具、按 F 触发交互点等"只需要一次交互"的场景。
 *
 * 与「对话」步骤的区别：
 *   - 「交互」只做交互动作，不处理对话推进；
 *   - 「对话」交互后会启动 AutoSkip 并等待返回主界面。
 */
import { DIALOG_REGIONS } from "../config/index.js";
import { isCancellationError } from "../utils/error-utils.js";
import { defineStep } from "./define-step.js";

const page = new BvPage();

/**
 * 非致命短等待：约 2 秒（1 秒重试间隔）轮询 predicate，命中返回 true，超时返回 false。
 * 全程只做同步判定与 sleep，不抛错，确保不会因"找不到交互文字"中断步骤。
 *
 * @param {() => boolean} predicate - 每次轮询调用的判定函数
 * @returns {Promise<boolean>} 是否在等待窗口内命中
 */
async function waitBriefly(predicate) {
    if (predicate()) return true;
    await sleep(1000);
    if (predicate()) return true;
    await sleep(1000);
    return predicate();
}

export default defineStep({
    type: "交互",
    category: "交互方法",
    dataSpec: {
        kind: "object",
        optional: true,
        fields: {
            targets: {
                type: "array",
                label: "交互目标",
                minItems: 1,
                hint: "每行一个交互目标文字（命中任一即交互）。留空表示匹配交互区任意文字。",
                items: { type: "string", nonEmpty: true },
            },
        },
    },
    run: async (step) => {
        try {
            const data = step.data || {};
            const targets = (Array.isArray(data.targets) ? data.targets : [])
                .filter((item) => typeof item === "string" && item.trim())
                .map((item) => item.trim());

            log.info("执行交互步骤，目标数: {count}", targets.length);

            // 候选：优先按 targets 文字匹配；targets 为空时匹配交互区任意文字
            const candidates = targets.length > 0 ? targets : [""];
            const findHit = () => {
                for (const text of candidates) {
                    try {
                        if (page.locator(text, DIALOG_REGIONS.DIALOG_OPTIONS).isExist()) {
                            return text;
                        }
                    } catch (error) {
                        log.warn("交互目标识别异常: {error}", error.message || error);
                    }
                }
                return null;
            };

            const hit = await waitBriefly(findHit) ? findHit() : null;

            if (hit === null) {
                log.info("没找到交互文本，尝试按 F 触发交互");
                keyPress("F");
                await sleep(100);
                return;
            }

            // 命中：Alt + 点击该目标文本
            log.info("命中交互目标，点击交互区域: {text}", hit || "(任意)");
            try {
                keyDown("VK_MENU");
                await sleep(400);
                page.locator(hit, DIALOG_REGIONS.DIALOG_OPTIONS).click();
                await sleep(400);
                leftButtonClick();
            } finally {
                keyUp("VK_MENU");
            }
        } catch (error) {
            if (isCancellationError(error)) { throw error; }
            log.error("执行交互步骤时出错: {error}", error.message);
            throw error;
        }
    },
});
