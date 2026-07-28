/**
 * 按当前委托配置切换战斗队伍或元素采集队伍。
 */
import {
    loadPartyConfigForContext,
    resolvePartySelection,
    validateCompleteRoles,
} from "../loaders/party-config.js";
import { defineStep } from "./define-step.js";

export default defineStep({
    type: "切换委托队伍",
    category: "战斗与队伍",
    dataSpec: { kind: "string", label: "队伍用途", options: ["战斗", "元素采集"] },
    run: async (step, context) => {
        log.info("执行切换委托队伍操作");
        if (step.data !== "战斗" && step.data !== "元素采集") {
            throw new Error(`切换委托队伍步骤 data 只能是 "战斗" 或 "元素采集"，收到: ${step.data}`);
        }

        const configBundle = loadPartyConfigForContext(context);
        const channel = step.data === "战斗" ? "battle" : "collect";
        const resolved = resolvePartySelection(configBundle, channel);

        if (resolved.mode === "roles") {
            if (!resolved.customTeamName) {
                throw new Error(`${step.data}队伍使用角色模式，但当前委托未配置 customTeamName`);
            }
            const roleResult = validateCompleteRoles(resolved.roles);
            if (!roleResult.ok) throw new Error(`${step.data}队伍角色配置无效: ${roleResult.error}`);

            log.info("切换至{kind}自定义承载队伍: {team}", step.data, resolved.customTeamName);
            const switched = await genshin.switchParty(resolved.customTeamName);
            if (!switched) {
                throw new Error(`自定义承载队伍切换失败: ${resolved.customTeamName}`);
            }
            await sleep(300);
            log.info("使用角色配置重组{kind}队伍", step.data);
            const roles = roleResult.roles;
            const roleSwitched = await genshin.SwitchCharacter(
                roles["1"],
                roles["2"],
                roles["3"],
                roles["4"]
            );
            if (!roleSwitched) throw new Error(`${step.data}队伍角色重组失败`);
            return true;
        }

        const teamName = resolved.teamName;
        if (!teamName || teamName.trim() === "") {
            throw new Error(`${step.data}队伍未配置队伍名称`);
        }

        const success = await genshin.switchParty(teamName);
        if (!success) throw new Error(`队伍切换失败: ${teamName}`);
        log.info("队伍切换成功: {team}", teamName);
        await sleep(300);
        return true;
    },
});
