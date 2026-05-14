/**
 * 等待返回主界面步骤处理器
 */
import { isInMainUI } from "../vision/ui-detector.js";

export function register(registry) {
    const handler = async function(step, context) {
        log.info("等待返回主界面");
        let maxWaitTime = 120000;
        let checkInterval = 1000;

        if (step.data && typeof step.data === "object") {
            maxWaitTime = step.data.maxWaitTime || maxWaitTime;
            checkInterval = step.data.checkInterval || checkInterval;
        } else if (typeof step.data === "number") {
            maxWaitTime = step.data;
        }

        for (let i = 0; i < Math.floor(maxWaitTime / checkInterval); i++) {
            if (isInMainUI()) {
                log.info("检测到已返回主界面，结束等待");
                return;
            }
            await sleep(checkInterval);
        }
        if (!isInMainUI()) {
            log.info("等待返回主界面超时，尝试继续执行后续步骤");
        }
    };

    registry.register("等待返回主界面", handler);
    registry.register("等待主界面", handler);
}
