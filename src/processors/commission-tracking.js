/**
 * 追踪委托步骤处理器
 */
import { autoNavigateToTalk } from "../navigation/index.js";
import { defineStep } from "./define-step.js";

const run = async (step, context) => {
    let targetNpc = "";
    let iconType = "bigmap";
    let autoTalk = false;

    if (typeof step.data === "string") { targetNpc = step.data; }
    else if (typeof step.data === "object") {
        if (step.data.npc) targetNpc = step.data.npc;
        if (step.data.iconType) iconType = step.data.iconType;
        if (step.data.autoTalk) autoTalk = step.data.autoTalk;
    }

    log.info("执行追踪委托，目标NPC: {target}，图标类型: {type}", targetNpc, iconType);
    await autoNavigateToTalk({ npcName: targetNpc, iconType: iconType, autoTalk: autoTalk });
    log.info("追踪委托执行完成");
};

export default defineStep({
    types: ["追踪委托", "委托追踪"],
    run,
});
