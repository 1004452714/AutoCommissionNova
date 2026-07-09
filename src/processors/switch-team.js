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
        if (step.data !== "战斗" && step.data !== "元素采集") {
            log.error("切换队伍步骤 data 只能是 \"战斗\" 或 \"元素采集\"，收到: {data}", step.data);
            return false;
        }

        const configBundle = loadPartyConfigForContext(context);
        const channel = step.data === "战斗" ? "battle" : "collect";
        const resolved = resolvePartySelection(configBundle, channel);

        if (resolved.mode === "roles") {
            if (!resolved.customTeamName) {
                log.error("{kind}队伍使用角色模式，但未配置自定义承载队伍名", step.data);
                return false;
            }
            log.info("切换至{kind}自定义承载队伍: {team}", step.data, resolved.customTeamName);
            const switched = await genshin.switchParty(resolved.customTeamName);
            if (!switched) {
                log.error("自定义承载队伍切换失败: {team}", resolved.customTeamName);
                return false;
            }
            await sleep(300);
            log.info("使用角色配置重组{kind}队伍", step.data);
            return await switchRolesByMap(resolved.roles);
        }

        const teamName = resolved.teamName;
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
