// 全局运行配置。
export interface GlobalConfig {
    uids: string[];
    skipSafeTeleport: boolean;
}

// 单个委托的分支配置。
export interface BranchConfig {
    type: string;
    default: string | null;
    conditions: Record<string, unknown>;
    descriptions: Record<string, string>;
    completed: string[];
    note: string;
    [key: string]: unknown;
}

// 队伍配置支持预设队伍名或四角色模式。
export interface TeamConfig {
    mode: "global" | "custom";
    teamMode: "teamName" | "roles";
    teamName: string;
    customTeamName: string;
    roles: Record<string, string>;
    strategy?: string;
}

// 委托地点对应的战斗与采集配置。
export interface PartyScope {
    key: string;
    country: string;
    type: string;
    typeDir: string;
    commissionName: string;
    location: string;
    locationDir: string;
    ordinal: number | null;
    label: string;
    config: { battle: TeamConfig; collect: TeamConfig };
}

// 全局队伍默认值。
export interface GlobalPartyConfig {
    battleTeamName: string;
    elementTeamName: string;
    customBattleTeamName: string;
    customElementTeamName: string;
    battleStrategy: string;
}

// 配置页一次加载和保存的组合视图。
export interface CommissionConfigPayload {
    global: GlobalConfig;
    branches: Record<string, BranchConfig>;
    party: {
        global: GlobalPartyConfig;
        scopesByCommission: Record<string, PartyScope[]>;
    };
}

// 策略文件树节点。
export interface StrategyNode {
    path: string;
    type: "folder" | "file";
    expanded: boolean;
    loaded: boolean;
    children: StrategyNode[];
}

// 后端返回的策略目录条目。
export interface StrategyEntry {
    name: string;
    type: "folder" | "file";
}

// 战斗配置侧栏的分组条目。
export interface BattleListItem {
    name: string;
    progress: string;
}

// 国家内的 NPC 或 Basic 二级分组。
export interface BattleListTypeGroup {
    key: string;
    title: "NPC" | "Basic";
    items: BattleListItem[];
}

// 战斗配置侧栏的国家一级分组。
export interface BattleListGroup {
    key: string;
    title: string;
    count: number;
    groups: BattleListTypeGroup[];
}

// 通用配置操作结果。
export interface ConfigOperationResult {
    status: "ok" | "error";
    message?: string;
}
