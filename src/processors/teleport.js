/**
 * 传送步骤处理器
 * data: {x: number, y: number, force?: boolean}
 */
import { defineStep } from "./define-step.js";

export default defineStep({
    types: ["tp", "传送"],
    schema: {
        x: "number",
        y: "number",
        force: { type: "boolean", default: false },
    },
    run: async (step, context) => {
        const { x, y, force } = step.data;
        log.info("传送到坐标: ({x}, {y}), 强制: {force}", x, y, force);
        await genshin.tp(x, y, force);
        log.info("传送完成");
        await sleep(2000);
    },
});
