/**
 * 追踪委托步骤处理器
 */
import { autoNavigateToTalk } from "../navigation/index.js";

export function register(registry) {
    const handler = async function(step, context) {
        try {
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
        } catch (error) {
            log.error("执行委托追踪步骤时出错: {error}", error.message);
            throw error;
        }
    };

    registry.register("追踪委托", handler);
    registry.register("委托追踪", handler);
}
