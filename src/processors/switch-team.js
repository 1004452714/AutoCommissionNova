/**
 * 切换队伍步骤处理器
 */
import { getSetting } from "../utils/settings-utils.js";
import { defineStep } from "./define-step.js";

export default defineStep({
    type: "切换队伍",
    run: async (step, context) => {
        log.info("执行切换队伍操作");
        if (!step.data) { log.warn("切换队伍步骤缺少数据"); return false; }

        let teamName;
        if (typeof step.data === "string") { teamName = step.data; }
        else if (typeof step.data === "object") { teamName = step.data.name; }

        if (!teamName) { log.warn("切换队伍步骤缺少队伍名称"); return false; }

        let actualTeamName;
        if (teamName === "战斗" || teamName === "元素采集") {
            const setting = getSetting();
            actualTeamName = teamName === "战斗" ? setting.team : setting.elementTeam;
        } else {
            actualTeamName = teamName;
        }

        if (!actualTeamName || actualTeamName.trim() === "") {
            log.warn("未配置队伍名称，跳过切换操作");
            return true;
        }

        const success = await genshin.switchParty(actualTeamName);
        if (success) {
            log.info("队伍切换成功: {team}", actualTeamName);
            await sleep(300);
            return true;
        } else {
            log.error("队伍切换失败: {team}", actualTeamName);
            return false;
        }
    },
});
