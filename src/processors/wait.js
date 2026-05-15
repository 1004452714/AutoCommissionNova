/**
 * 等待步骤处理器
 */
import { defineStep } from "./define-step.js";

function resolveWaitTime(data) {
    if (typeof data === "number") return data;
    if (typeof data === "string") return parseInt(data) || 1000;
    if (typeof data === "object" && data !== null && data.time) return data.time;
    return 1000;
}

export default defineStep({
    type: "等待",
    run: async (step, context) => {
        const waitTime = resolveWaitTime(step.data);
        log.info("等待 {time}ms", waitTime);
        await sleep(waitTime);
    },
});
