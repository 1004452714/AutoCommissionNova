/**
 * 等待步骤处理器
 */
function resolveWaitTime(data) {
    if (typeof data === "number") return data;
    if (typeof data === "string") return parseInt(data) || 1000;
    if (typeof data === "object" && data !== null && data.time) return data.time;
    return 1000;
}

export default {
    type: "等待",
    handler: async function(step, context) {
        const waitTime = resolveWaitTime(step.data);
        log.info("等待 {time}ms", waitTime);
        await sleep(waitTime);
    },
};
