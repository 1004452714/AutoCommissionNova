import { beforeEach, describe, expect, it, vi } from "vitest";

const partyState = vi.hoisted(() => ({
    selection: { mode: "teamName", teamName: "", customTeamName: "", roles: {} } as {
        mode: "teamName" | "roles";
        teamName: string;
        customTeamName: string;
        roles: Record<string, string>;
    },
}));

vi.mock("../../src/loaders/party-config.js", () => ({
    loadPartyConfigForContext: vi.fn(() => ({})),
    resolvePartySelection: vi.fn(() => partyState.selection),
    validateCompleteRoles: vi.fn((roles: Record<string, string>) => ({ ok: true, roles })),
}));

vi.mock("../../src/config/index.js", () => ({
    PATHS: { COMMISSION_CATALOG: "config/commission-catalog.json" },
}));

// BetterGI 运行时代码是仓库根目录下没有声明文件的 JavaScript 模块。
// @ts-expect-error Runtime JavaScript module has no TypeScript declarations.
import { prepareCommissionBattleParty } from "../../src/core/commission-party-switcher.js";
// @ts-expect-error Runtime JavaScript module has no TypeScript declarations.
import switchCommissionParty from "../../src/processors/switch-commission-party.js";

describe("party switching defaults", () => {
    const warn = vi.fn();
    const switchParty = vi.fn();

    beforeEach(() => {
        partyState.selection = { mode: "teamName", teamName: "", customTeamName: "", roles: {} };
        vi.stubGlobal("log", { debug: vi.fn(), info: vi.fn(), warn, error: vi.fn() });
        vi.stubGlobal("genshin", { switchParty, SwitchCharacter: vi.fn() });
        vi.stubGlobal("file", {
            readTextSync: vi.fn(() => JSON.stringify({ switchBattleParty: ["测试委托"] })),
        });
        vi.stubGlobal("sleep", vi.fn());
    });

    it("keeps the current party when automatic battle-party selection is empty", async () => {
        await expect(prepareCommissionBattleParty({ commissionName: "测试委托" })).resolves.toBe(true);

        expect(warn).toHaveBeenCalledWith("委托 {commission} 未配置战斗队伍，保留当前队伍", "测试委托");
        expect(switchParty).not.toHaveBeenCalled();
    });

    it("keeps the current party when an explicit switch step has no team name", async () => {
        await expect(switchCommissionParty.handler({ type: "切换委托队伍", data: "元素采集" }, {})).resolves.toBe(true);

        expect(warn).toHaveBeenCalledWith("{kind}队伍未配置队伍名称，保留当前队伍", "元素采集");
        expect(switchParty).not.toHaveBeenCalled();
    });

    it("still rejects an incomplete roles-mode configuration", async () => {
        partyState.selection = { mode: "roles", teamName: "", customTeamName: "", roles: {} };

        await expect(switchCommissionParty.handler({ type: "切换委托队伍", data: "战斗" }, {}))
            .rejects.toThrow("战斗队伍使用角色模式，但当前委托未配置 customTeamName");
        expect(switchParty).not.toHaveBeenCalled();
    });
});
