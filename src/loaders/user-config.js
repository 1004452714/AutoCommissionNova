import { PATHS } from "../config/index.js";

const SCHEMA_VERSION = 1;

function isPlainObject(value) {
    return value && typeof value === "object" && !Array.isArray(value);
}

function emptyConfig() {
    return {
        schemaVersion: SCHEMA_VERSION,
        uids: [],
        skipSafeTeleport: false,
        party: { global: {}, scopes: {} },
    };
}

function normalize(config) {
    const source = isPlainObject(config) ? config : {};
    const party = isPlainObject(source.party) ? source.party : {};
    return {
        schemaVersion: SCHEMA_VERSION,
        uids: Array.isArray(source.uids) ? source.uids : [],
        skipSafeTeleport: source.skipSafeTeleport === true,
        party: {
            global: isPlainObject(party.global) ? party.global : {},
            scopes: isPlainObject(party.scopes) ? party.scopes : {},
        },
    };
}

function readJson(path) {
    if (!file.isFile(path)) return null;
    const raw = file.readTextSync(path);
    return raw ? JSON.parse(raw) : null;
}

function scopeKey(scope) {
    return [scope.country, scope.typeDir, scope.commissionName, scope.locationDir].join("/");
}

function migrateLegacy() {
    const config = emptyConfig();
    const global = readJson(PATHS.LEGACY_GLOBAL_CONFIG);
    if (isPlainObject(global)) {
        config.uids = Array.isArray(global.uids) ? global.uids : [];
        config.skipSafeTeleport = global.skipSafeTeleport === true;
    }
    const partyGlobal = readJson(`${PATHS.LEGACY_PARTY_CONFIG_DIR}/global.json`);
    if (isPlainObject(partyGlobal)) config.party.global = partyGlobal;
    return config;
}

export function loadUserConfig() {
    try {
        const current = readJson(PATHS.USER_CONFIG);
        return normalize(current || migrateLegacy());
    } catch (error) {
        log.debug("读取统一用户配置失败，使用默认值: {err}", error.message);
        return emptyConfig();
    }
}

export function writeUserConfig(config) {
    file.createDirectory("Data");
    file.writeTextSync(PATHS.USER_CONFIG, JSON.stringify(normalize(config), null, 4));
}

export function getUserPartyScope(config, scope) {
    return config.party.scopes[scopeKey(scope)];
}

export function setUserPartyScope(config, scope, value) {
    config.party.scopes[scopeKey(scope)] = value;
}

