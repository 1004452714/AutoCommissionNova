/**
 * 切换队伍步骤处理器
 */
import { loadPartyConfigForContext, resolvePartySelection } from "../loaders/party-config.js";
import { defineStep } from "./define-step.js";
import { switchRolesByMap } from "./switch-role.js";

export default defineStep({
    type: "切换队伍",
    run: async (step, context) => {
        log.info("执行切换队伍操作");
        if (!step.data) { log.warn("切换队伍步骤缺少数据"); return false; }

        let teamName;
        if (typeof step.data === "string") { teamName = step.data; }
        else if (typeof step.data === "object") { teamName = step.data.name; }

        if (!teamName) { log.warn("切换队伍步骤缺少队伍名称"); return false; }

        if (teamName === "战斗" || teamName === "元素采集") {
            const configBundle = loadPartyConfigForContext(context);
            const channel = teamName === "战斗" ? "battle" : "collect";
            const resolved = resolvePartySelection(configBundle, channel);

            if (resolved.mode === "roles") {
                log.info("使用委托级角色配置切换{kind}队伍", teamName);
                return await switchRolesByMap(resolved.roles);
            }

            teamName = resolved.teamName;
        }

        if (!teamName || teamName.trim() === "") {
            log.warn("未配置队伍名称，跳过切换操作");
            return true;
        }

        const success = await genshin.switchParty(teamName);
        if (success) {
            log.info("队伍切换成功: {team}", teamName);
            await sleep(300);
            return true;
        } else {
            log.error("队伍切换失败: {team}", teamName);
            return false;
        }
    },
});
