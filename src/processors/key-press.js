/**
 * 按键步骤处理器
 */
export default {
    type: "按键",
    handler: async function(step, context) {
        if (!step.data) {
            log.warn("按键步骤缺少数据");
            return;
        }
        if (typeof step.data === "string") {
            log.info("执行按键: {key}", step.data);
            keyPress(step.data);
        } else if (typeof step.data === "object") {
            if (step.data.action === "down") {
                log.info("按下按键: {key}", step.data.key);
                keyDown(step.data.key);
            } else if (step.data.action === "up") {
                log.info("释放按键: {key}", step.data.key);
                keyUp(step.data.key);
            } else {
                log.info("执行按键: {key}", step.data.key);
                keyPress(step.data.key);
            }
        }
    },
};
