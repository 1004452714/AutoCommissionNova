// 委托配置页的开发模式响应，不参与生产构建。
import type { CommissionConfigPayload } from "@/apps/commission-config/types";
import { DEFAULT_STRATEGY } from "@/apps/commission-config/model";

// Mock 覆盖全局、成就分支和地点队伍三类视图。
const payload: CommissionConfigPayload = {
    uids: ["100000001"],
    selectedUid: "100000001",
    currentUid: "100000001",
    global: { skipSafeTeleport: false },
    branches: {
        示例委托: {
            type: "achievement",
            default: "normal",
            conditions: { achievement: { type: "completion" } },
            descriptions: { achievement: "成就分支", normal: "普通分支" },
            completed: [],
            note: "开发模式分支示例",
        },
    },
    party: {
        global: { battleTeamName: "", elementTeamName: "", customBattleTeamName: "", customElementTeamName: "", battleStrategy: DEFAULT_STRATEGY },
        scopesByCommission: {
            示例委托: [{
                key: "蒙德::NPC::示例委托::城外",
                country: "蒙德",
                type: "npc",
                typeDir: "NPC",
                commissionName: "示例委托",
                location: "城外",
                locationDir: "城外",
                ordinal: null,
                label: "蒙德 | 城外",
                config: {
                    battle: { mode: "global", teamMode: "teamName", teamName: "", customTeamName: "", roles: {}, strategy: DEFAULT_STRATEGY },
                    collect: { mode: "global", teamMode: "teamName", teamName: "", customTeamName: "", roles: {} },
                },
            }],
        },
    },
};

// 返回与 BetterGI 配置编辑后端一致的开发响应。
export async function mockCommissionConfigRequest(url: string): Promise<unknown> {
    if (url === "/loadConfig") return payload;
    if (url === "/loadStrategyTree") return { children: [{ name: "示例策略.txt", type: "file" }], error: "" };
    if (url === "/loadStrategyChildren") return { children: [], error: "" };
    return { status: "ok" };
}
