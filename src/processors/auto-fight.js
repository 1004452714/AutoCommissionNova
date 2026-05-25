/**
 * 定时自动战斗步骤处理器
 * 使用 BvPage 重写战斗结束检测
 */
import { defineStep } from "./define-step.js";
import { RO } from "../vision/index.js";

async function waitFight(timeout, intervals) {
    const startTime = Date.now();
    while (Date.now() - startTime < timeout) {
        keyPress("l");
        await sleep(1000);
        const page = new BvPage();
        const results = await page.Locator(RO.team).TryWaitFor(2000);
        if (results.length > 0) {
            log.info("识别到战斗结束");
            keyPress("l");
            return true;
        }
        log.info("未识别到战斗结束");
        await sleep(intervals);
    }
    return false;
}

export default defineStep({
    type: "定时自动战斗",
    swallow: true,
    run: async (step, context) => {
        const timeout = (step.data && step.data.timeout) || 30000;
        const intervals = (step.data && step.data.intervals) || 5000;

        let cts = new CancellationTokenSource();
        try {
            log.info("开始战斗");
            dispatcher.RunTask(new SoloTask("AutoFight"), cts);
            await waitFight(timeout, intervals);
            cts.cancel();
            return true;
        } finally {
            cts.Dispose();
        }
    },
});
