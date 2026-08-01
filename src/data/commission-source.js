/**
 * 委托数据源模块
 * 从 process/config/support-list.json 白名单和 process/ 目录扫描取交集，获取支持的委托列表
 */
import { COMMISSION_TYPE, PATHS } from "../config/index.js";
import { scanCommissionScopes } from "../loaders/process-scope.js";

/**
 * 从 process/config/support-list.json 加载白名单
 *
 * @returns {Object} 白名单 { basic: [], npc: [] }
 */
function loadWhitelist() {
    try {
        const content = file.readTextSync(PATHS.SUPPORT_LIST);
        const data = JSON.parse(content);
        return {
            basic: data.basic || [],
            npc: data.npc || [],
            ban: data.ban || [],
        };
    } catch (error) {
        log.error("读取白名单文件失败: {error}", error.message);
        return { basic: [], npc: [], ban: [] };
    }
}

function scanCommissionNamesByType(type, scopes) {
    const matchingScopes = scopes.filter((scope) => scope.type === type);
    return Array.from(new Set(matchingScopes.map((scope) => scope.commissionName)));
}

/**
 * 加载支持的委托列表
 * 
 * 确保只有同时满足以下两个条件的委托才会被执行：
 * 1. 在 process/config/support-list.json 白名单中声明
 * 2. 在 process/ 目录下有对应的流程文件
 * 
 * @param {Array} [commissionScopes] - 可复用的流程范围快照；不传时扫描一次流程目录
 * @returns {Promise<Object>} 支持的委托列表
 * @returns {string[]} returns.basic - 支持的 Basic 委托名称列表
 * @returns {string[]} returns.npc - 支持的 NPC 委托名称列表
 */
export async function loadSupportedCommissions(commissionScopes) {
    const whitelist = loadWhitelist();
    const scopes = commissionScopes ?? scanCommissionScopes().list;
    const availableBasic = scanCommissionNamesByType(COMMISSION_TYPE.BASIC, scopes);
    const availableNpc = scanCommissionNamesByType(COMMISSION_TYPE.NPC, scopes);

    const supported = {
        basic: whitelist.basic.filter((name) => availableBasic.includes(name) && !whitelist.ban.includes(name)),
        npc: whitelist.npc.filter((name) => availableNpc.includes(name) && !whitelist.ban.includes(name)),
    };

    return supported;
}
