import { PATHS } from "../config/index.js";

function isPlainObject(value) {
    return value && typeof value === "object" && !Array.isArray(value);
}

function ensureParentDir(path) {
    const parts = path.split(/[\\/]/);
    parts.pop();
    file.createDirectory(parts.join("/"));
}

function normalizeUid(value) {
    const text = String(value ?? "").trim();
    return text.toLowerCase() === "test" ? "test" : text.replace(/\D/g, "");
}

export function normalizeGlobalConfig(config) {
    const next = isPlainObject(config) ? config : {};
    const rawUids = Array.isArray(next.uids)
        ? next.uids
        : (typeof next.uid === "string" ? [next.uid] : []);

    return {
        uids: Array.from(new Set(rawUids.map(normalizeUid).filter(Boolean))),
        skipSafeTeleport: next.skipSafeTeleport === true,
    };
}

export function loadGlobalConfig() {
    try {
        if (!file.isFile(PATHS.GLOBAL_CONFIG)) {
            return normalizeGlobalConfig({});
        }
        const raw = file.readTextSync(PATHS.GLOBAL_CONFIG);
        if (!raw) {
            return normalizeGlobalConfig({});
        }
        return normalizeGlobalConfig(JSON.parse(raw));
    } catch (error) {
        log.debug("读取全局配置失败，使用默认值: {err}", error.message);
        return normalizeGlobalConfig({});
    }
}

export function writeGlobalConfig(config) {
    ensureParentDir(PATHS.GLOBAL_CONFIG);
    file.writeTextSync(PATHS.GLOBAL_CONFIG, JSON.stringify(normalizeGlobalConfig(config), null, 4));
}
