import { PATHS } from "../config/index.js";
import { buildCommissionScope, buildCommissionScopeFromContext } from "./process-scope.js";
import { getSetting } from "../utils/settings-utils.js";

export const DEFAULT_BATTLE_STRATEGY = "根据队伍自动选择";

function isPlainObject(value) {
    return value && typeof value === "object" && !Array.isArray(value);
}

function normalizeRoles(roles) {
    const next = {};
    for (const key of ["1", "2", "3", "4"]) {
        const value = roles && typeof roles[key] === "string" ? roles[key].trim() : "";
        next[key] = value;
    }
    return next;
}

function normalizeTeamSelectionConfig(config, fallbackMode = "global") {
    const next = isPlainObject(config) ? { ...config } : {};
    return {
        mode: next.mode === "custom" ? "custom" : fallbackMode,
        teamMode: next.teamMode === "roles" ? "roles" : "teamName",
        teamName: typeof next.teamName === "string" ? next.teamName.trim() : "",
        roles: normalizeRoles(next.roles),
    };
}

function normalizeBattleScopeConfig(config, fallbackMode = "global") {
    const next = normalizeTeamSelectionConfig(config, fallbackMode);
    return {
        ...next,
        strategy: typeof config?.strategy === "string" && config.strategy.trim()
            ? config.strategy.trim()
            : DEFAULT_BATTLE_STRATEGY,
    };
}

export function normalizeGlobalPartyConfig(config) {
    const next = isPlainObject(config) ? { ...config } : {};
    const setting = getSetting();
    return {
        battleTeamName: typeof next.battleTeamName === "string" && next.battleTeamName.trim()
            ? next.battleTeamName.trim()
            : (setting.team || ""),
        elementTeamName: typeof next.elementTeamName === "string" && next.elementTeamName.trim()
            ? next.elementTeamName.trim()
            : (setting.elementTeam || ""),
        battleStrategy: typeof next.battleStrategy === "string" && next.battleStrategy.trim()
            ? next.battleStrategy.trim()
            : DEFAULT_BATTLE_STRATEGY,
    };
}

export function normalizeScopePartyConfig(config) {
    const next = isPlainObject(config) ? { ...config } : {};
    return {
        battle: normalizeBattleScopeConfig(next.battle, "global"),
        collect: normalizeTeamSelectionConfig(next.collect, "global"),
    };
}

export function getPartyGlobalConfigPath() {
    return `${PATHS.PARTY_CONFIG_DIR}/global.json`;
}

export function getPartyScopeConfigPath(scope) {
    const normalizedScope = buildCommissionScope(scope);
    return `${PATHS.PARTY_CONFIG_DIR}/${normalizedScope.country}/${normalizedScope.typeDir}/${normalizedScope.commissionName}/${normalizedScope.locationDir}.json`;
}

function ensureParentDir(path) {
    const parts = path.split(/[\\/]/);
    parts.pop();
    file.createDirectory(parts.join("/"));
}

function readJsonIfExists(path) {
    if (!file.isFile(path)) {
        return null;
    }

    const raw = file.readTextSync(path);
    if (!raw) {
        return null;
    }

    return JSON.parse(raw);
}

function hasRoleValue(roles) {
    for (const key of ["1", "2", "3", "4"]) {
        if (roles && typeof roles[key] === "string" && roles[key].trim()) {
            return true;
        }
    }
    return false;
}

function hasTeamSelectionValue(config) {
    return (typeof config.teamName === "string" && config.teamName.trim())
        || hasRoleValue(config.roles);
}

function shouldPersistScopeConfig(config) {
    const normalized = normalizeScopePartyConfig(config);
    const battleCustom = normalized.battle.mode === "custom";
    const collectCustom = normalized.collect.mode === "custom";

    if (!battleCustom && !collectCustom) {
        return false;
    }

    return (battleCustom && hasTeamSelectionValue(normalized.battle))
        || (collectCustom && hasTeamSelectionValue(normalized.collect));
}

export function loadGlobalPartyConfig() {
    try {
        const json = readJsonIfExists(getPartyGlobalConfigPath());
        if (!json) {
            return normalizeGlobalPartyConfig({});
        }
        return normalizeGlobalPartyConfig(json);
    } catch (error) {
        log.debug("读取全局队伍配置失败，使用默认值: {err}", error.message);
        return normalizeGlobalPartyConfig({});
    }
}

export function writeGlobalPartyConfig(config) {
    const path = getPartyGlobalConfigPath();
    ensureParentDir(path);
    file.writeTextSync(path, JSON.stringify(normalizeGlobalPartyConfig(config), null, 4));
}

export function loadScopePartyConfig(scope) {
    try {
        const json = readJsonIfExists(getPartyScopeConfigPath(scope));
        if (!json) {
            return normalizeScopePartyConfig({});
        }
        return normalizeScopePartyConfig(json);
    } catch (error) {
        log.debug("读取委托队伍配置失败 [{key}]，使用默认值: {err}", scope?.key, error.message);
        return normalizeScopePartyConfig({});
    }
}

export function writeScopePartyConfig(scope, config) {
    const path = getPartyScopeConfigPath(scope);
    ensureParentDir(path);
    file.writeTextSync(path, JSON.stringify(normalizeScopePartyConfig(config), null, 4));
}

export function loadPartyConfigForContext(context) {
    const scope = buildCommissionScopeFromContext(context);
    return {
        scope,
        global: loadGlobalPartyConfig(),
        local: scope ? loadScopePartyConfig(scope) : normalizeScopePartyConfig({}),
    };
}

function selectRoles(roles) {
    const selected = {};
    for (const key of ["1", "2", "3", "4"]) {
        if (roles[key]) {
            selected[key] = roles[key];
        }
    }
    return selected;
}

export function resolvePartySelection(configBundle, channel) {
    const globalConfig = configBundle?.global || normalizeGlobalPartyConfig({});
    const localConfig = configBundle?.local || normalizeScopePartyConfig({});
    const config = channel === "collect" ? localConfig.collect : localConfig.battle;

    if (config.mode !== "custom") {
        if (channel === "collect") {
            return {
                mode: "teamName",
                teamName: globalConfig.elementTeamName || "",
                roles: {},
                strategy: "",
            };
        }
        return {
            mode: "teamName",
            teamName: globalConfig.battleTeamName || "",
            roles: {},
            strategy: globalConfig.battleStrategy || DEFAULT_BATTLE_STRATEGY,
        };
    }

    if (config.teamMode === "roles") {
        return {
            mode: "roles",
            teamName: "",
            roles: selectRoles(config.roles),
            strategy: channel === "battle" ? (config.strategy || DEFAULT_BATTLE_STRATEGY) : "",
        };
    }

    return {
        mode: "teamName",
        teamName: config.teamName || "",
        roles: {},
        strategy: channel === "battle" ? (config.strategy || DEFAULT_BATTLE_STRATEGY) : "",
    };
}

export function resolveBattleStrategy(configBundle) {
    const globalConfig = configBundle?.global || normalizeGlobalPartyConfig({});
    const localConfig = configBundle?.local || normalizeScopePartyConfig({});
    return localConfig.battle.mode === "custom"
        ? (localConfig.battle.strategy || DEFAULT_BATTLE_STRATEGY)
        : (globalConfig.battleStrategy || DEFAULT_BATTLE_STRATEGY);
}

export function createPartyConfigView(scopesByCommission) {
    const view = {};
    const global = loadGlobalPartyConfig();

    for (const [commissionName, scopes] of Object.entries(scopesByCommission || {})) {
        view[commissionName] = (scopes || []).map((scope) => ({
            ...scope,
            config: loadScopePartyConfig(scope),
        })).sort((a, b) => a.label.localeCompare(b.label, "zh-CN"));
    }

    return { global, scopesByCommission: view };
}

export function writePartyConfigView(view) {
    if (!isPlainObject(view)) {
        return;
    }

    const scopesByCommission = isPlainObject(view.scopesByCommission) ? view.scopesByCommission : {};
    const globalPath = getPartyGlobalConfigPath();
    let shouldWriteGlobal = file.isFile(globalPath) || file.isFolder(PATHS.PARTY_CONFIG_DIR);
    const pendingWrites = [];

    for (const scopeList of Object.values(scopesByCommission)) {
        if (!Array.isArray(scopeList)) continue;
        for (const scopeEntry of scopeList) {
            if (!scopeEntry || !scopeEntry.key || !scopeEntry.config) continue;
            const path = getPartyScopeConfigPath(scopeEntry);
            const exists = file.isFile(path);
            const normalizedConfig = normalizeScopePartyConfig(scopeEntry.config);
            const shouldPersist = shouldPersistScopeConfig(normalizedConfig);

            if (shouldPersist) {
                shouldWriteGlobal = true;
                pendingWrites.push({ scopeEntry, config: normalizedConfig });
                continue;
            }

            if (exists) {
                pendingWrites.push({ scopeEntry, config: normalizeScopePartyConfig({}) });
            }
        }
    }

    if (shouldWriteGlobal) {
        writeGlobalPartyConfig(view.global || {});
    }

    for (const item of pendingWrites) {
        writeScopePartyConfig(item.scopeEntry, item.config);
    }
}
