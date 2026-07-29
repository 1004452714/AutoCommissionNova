/**
 * 委托配置视图的规范化与展示模型。
 *
 * 本模块只转换 JSON 数据，不读取 DOM、不保存文件也不发送宿主消息。
 */
import type { BattleListGroup, BranchConfig, CommissionConfigPayload, GlobalConfig, GlobalPartyConfig, PartyScope, TeamConfig } from "@/apps/commission-config/types";

// 战斗策略未显式设置时使用的稳定值。
export const DEFAULT_STRATEGY = "根据队伍自动选择";
// 四角色队伍编辑器使用的固定槽位。
export const ROLE_SLOTS = ["1", "2", "3", "4"];

// 将未知值收窄为普通对象。
function record(value: unknown): Record<string, unknown> {
    return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

// 将旧 HTML 富文本备注安全转换为纯文本。
export function sanitizeNote(note: unknown): string {
    if (typeof note !== "string" || !note) return "";
    if (!/<br\s*\/?>|<[a-z!/][^>]*>/i.test(note)) return note;
    // DOMParser 只读取文本，不执行备注中的标记或脚本。
    const documentNode = new DOMParser().parseFromString(
        note.replace(/<br\s*\/?>/gi, "\n").replace(/<\/(div|p|li|tr|h[1-6])>/gi, "\n"),
        "text/html",
    );
    return (documentNode.body.textContent ?? "").replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

// 规范化 UID 列表并兼容开发者测试字面值。
export function normalizeGlobalConfig(value: unknown): GlobalConfig {
    // 原始对象兼容历史单 uid 字段。
    const source = record(value);
    // 原始 UID 候选只接受数组或字符串。
    const rawUids = Array.isArray(source.uids) ? source.uids : (typeof source.uid === "string" ? [source.uid] : []);
    // 清洗结果去除重复、空值和 UID 非数字字符。
    const uids = Array.from(new Set(rawUids.map((item) => {
        const raw = String(item ?? "").trim();
        return raw.toLowerCase() === "test" ? "test" : raw.replace(/\D/g, "");
    }).filter(Boolean)));
    return { uids: uids.length ? uids : [""], skipSafeTeleport: source.skipSafeTeleport === true };
}

// 规范化四角色映射。
function normalizeRoles(value: unknown): Record<string, string> {
    // 角色来源可能为空或为旧版普通对象。
    const source = record(value);
    return Object.fromEntries(ROLE_SLOTS.map((slot) => [slot, typeof source[slot] === "string" ? source[slot].trim() : ""]));
}

// 规范化地点级队伍选择。
function normalizeTeam(value: unknown, withStrategy = false): TeamConfig {
    // 原始队伍对象缺失时回落到全局模式。
    const source = record(value);
    // 标准化对象保持后端既有字段名称。
    const team: TeamConfig = {
        mode: source.mode === "custom" ? "custom" : "global",
        teamMode: source.teamMode === "roles" ? "roles" : "teamName",
        teamName: typeof source.teamName === "string" ? source.teamName.trim() : "",
        customTeamName: typeof source.customTeamName === "string" ? source.customTeamName.trim() : "",
        roles: normalizeRoles(source.roles),
    };
    if (withStrategy) team.strategy = typeof source.strategy === "string" && source.strategy.trim() ? source.strategy.trim() : DEFAULT_STRATEGY;
    return team;
}

// 规范化全局队伍默认配置。
function normalizeGlobalParty(value: unknown): GlobalPartyConfig {
    // 全局队伍对象允许从空配置平滑启动。
    const source = record(value);
    return {
        battleTeamName: typeof source.battleTeamName === "string" ? source.battleTeamName.trim() : "",
        elementTeamName: typeof source.elementTeamName === "string" ? source.elementTeamName.trim() : "",
        customBattleTeamName: typeof source.customBattleTeamName === "string" ? source.customBattleTeamName.trim() : "",
        customElementTeamName: typeof source.customElementTeamName === "string" ? source.customElementTeamName.trim() : "",
        battleStrategy: typeof source.battleStrategy === "string" && source.battleStrategy.trim() ? source.battleStrategy.trim() : DEFAULT_STRATEGY,
    };
}

// 规范化一个可定位的委托地点。
function normalizeScope(value: unknown, commissionName: string): PartyScope {
    // 后端范围对象可能来自不同版本的扫描结果。
    const source = record(value);
    // 地点和国家参与生成稳定的回退键。
    const country = typeof source.country === "string" ? source.country : "";
    // locationDir 优先于展示 location。
    const locationDir = typeof source.locationDir === "string" ? source.locationDir : "";
    // 范围内嵌配置继续使用原有 battle/collect 结构。
    const config = record(source.config);
    return {
        key: typeof source.key === "string" && source.key ? source.key : [country, source.type ?? "", commissionName, locationDir].join("::"),
        country,
        type: typeof source.type === "string" ? source.type : "",
        typeDir: typeof source.typeDir === "string" ? source.typeDir : "",
        commissionName: typeof source.commissionName === "string" && source.commissionName.trim() ? source.commissionName.trim() : commissionName,
        location: typeof source.location === "string" ? source.location : locationDir,
        locationDir,
        ordinal: typeof source.ordinal === "number" ? source.ordinal : null,
        label: typeof source.label === "string" ? source.label : [country, locationDir].filter(Boolean).join(" | "),
        config: { battle: normalizeTeam(config.battle, true), collect: normalizeTeam(config.collect) },
    };
}

// 规范化一个委托的分支定义和完成状态。
function normalizeBranch(value: unknown): BranchConfig {
    // 分支对象保留未知字段以兼容后端扩展。
    const source = record(value);
    // 条件和描述必须是普通映射。
    const descriptions = record(source.descriptions);
    // 文本描述只保留字符串值。
    const normalizedDescriptions = Object.fromEntries(Object.entries(descriptions).filter((entry): entry is [string, string] => typeof entry[1] === "string"));
    // 旧版展示层字段不应重新写回分支配置。
    const compatibleSource = { ...source };
    delete compatibleSource.noteLevel;
    return {
        ...compatibleSource,
        type: typeof source.type === "string" && source.type ? source.type : "achievement",
        default: typeof source.default === "string" ? source.default : null,
        conditions: record(source.conditions),
        descriptions: normalizedDescriptions,
        completed: Array.isArray(source.completed) ? source.completed.filter((item): item is string => typeof item === "string") : [],
        note: sanitizeNote(source.note),
    } as BranchConfig;
}

// 将后端新旧组合格式统一为页面可编辑视图。
export function normalizePayload(value: unknown): CommissionConfigPayload {
    // 新格式具有 global、branches 或 party 中的至少一个字段。
    const source = record(value);
    // 旧格式整体就是 branches 映射。
    const branchSource = "global" in source || "branches" in source || "party" in source ? record(source.branches) : source;
    // 队伍视图包含全局值和按委托分组的地点。
    const partySource = record(source.party);
    // 地点集合按委托名称进行规范化和排序。
    const scopeGroups = record(partySource.scopesByCommission);
    // 标准化分支映射保留后端的委托名称键。
    const branches = Object.fromEntries(Object.entries(branchSource).map(([name, config]) => [name, normalizeBranch(config)]));
    // 标准化地点映射便于列表和详情共享同一引用。
    const scopesByCommission = Object.fromEntries(Object.entries(scopeGroups).map(([name, scopes]) => [
        name,
        (Array.isArray(scopes) ? scopes : []).map((scope) => normalizeScope(scope, name)).sort((a, b) => a.label.localeCompare(b.label, "zh-CN")),
    ]));
    return {
        global: normalizeGlobalConfig(source.global),
        branches,
        party: { global: normalizeGlobalParty(partySource.global), scopesByCommission },
    };
}

// 生成写回后端前的无空值全局配置。
export function globalConfigForSave(config: GlobalConfig): GlobalConfig {
    return normalizeGlobalConfig(config);
}

// 将路径值转换为 BetterGI 策略名称。
export function normalizeStrategyValue(path: string): string {
    if (path === DEFAULT_STRATEGY) return DEFAULT_STRATEGY;
    return String(path || "").replace(/\\/g, "/").replace(/\.(txt|json)$/i, "");
}

// 按国家及 NPC/Basic 两级结构构建战斗配置侧栏。
export function buildBattleGroups(scopesByCommission: Record<string, PartyScope[]>, searchTerm = ""): BattleListGroup[] {
    // 国家映射中的二级类型按委托累计地点数量。
    const countries = new Map<string, Map<"NPC" | "Basic", Map<string, number>>>();
    // 搜索词只匹配委托名称，不改变原始配置。
    const query = searchTerm.trim().toLowerCase();
    Object.keys(scopesByCommission).sort((a, b) => a.localeCompare(b, "zh-CN")).forEach((name) => {
        if (query && !name.toLowerCase().includes(query)) return;
        // 同一委托的每个地点分别计入其国家和目录类型。
        const scopes = scopesByCommission[name] ?? [];
        scopes.forEach((scope) => {
            // 目录名称统一为稳定的 NPC/Basic 显示值。
            const type = String(scope.typeDir || scope.type).toLowerCase() === "basic" ? "Basic" : "NPC";
            // 缺失国家的历史范围进入可见的未分类组。
            const country = scope.country.trim() || "未分类";
            // 二级映射为后续排序保留类型边界。
            const typeGroups = countries.get(country) ?? new Map<"NPC" | "Basic", Map<string, number>>();
            // 委托映射累计当前国家和类型下的地点数量。
            const items = typeGroups.get(type) ?? new Map<string, number>();
            items.set(name, (items.get(name) ?? 0) + 1);
            typeGroups.set(type, items);
            countries.set(country, typeGroups);
        });
    });
    return Array.from(countries.entries()).sort(([a], [b]) => a.localeCompare(b, "zh-CN")).map(([country, typeGroups]) => {
        // 二级类型固定使用 NPC 在前、Basic 在后的业务顺序。
        const groups = (["NPC", "Basic"] as const).flatMap((type) => {
            const items = typeGroups.get(type);
            if (!items?.size) return [];
            return [{
                key: `${country}:${type.toLowerCase()}`,
                title: type,
                items: Array.from(items.entries()).sort(([a], [b]) => a.localeCompare(b, "zh-CN")).map(([name, count]) => ({ name, progress: count > 1 ? String(count) : "" })),
            }];
        });
        // 国家数量统计当前可见的二级委托条目。
        const count = groups.reduce((total, group) => total + group.items.length, 0);
        return { key: `country:${country}`, title: country, count, groups };
    });
}
