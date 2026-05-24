/**
 * 委托数据管理模块
 * 负责委托数据的加载、保存、验证和持久化
 * 采用内存 + 文件双写模式，文件仅作为持久化备份
 */
import { PATHS } from "../config/index.js";
import { isCancellationError } from "../utils/error-utils.js";

/**
 * 检查时间戳是否为今天（以凌晨四点为分界）
 * @param {string} timestampString - ISO 格式时间戳
 * @returns {boolean}
 */
function isToday(timestampString) {
    try {
        const timestamp = new Date(timestampString);
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 4, 0, 0);
        if (now < today) {
            today.setDate(today.getDate() - 1);
        }
        return timestamp >= today;
    } catch (error) {
        log.error("检查时间戳时出错：{error}", error.message);
        return false;
    }
}

/**
 * 保存委托数据（内存 + 文件双写）
 * @param {Array} commissions - 委托数据列表
 * @returns {Promise<Array>} 受支持的委托列表
 */
/**
 * 检查两组委托的名称集合是否一致（用于检测同一账号同一天的复扫）
 * 名称集合变化 → 视为换号 / 跨日，本次扫到的全部字段都按新值写
 */
function sameNameSet(a, b) {
    if (a.length !== b.length) { return false; }
    const an = a.map((c) => c.name).sort();
    const bn = b.map((c) => c.name).sort();
    return an.every((name, i) => name === bn[i]);
}

/**
 * 保存委托数据（内存 + 文件双写）
 * @param {Array} commissions - 委托数据列表
 * @returns {Promise<Array>} 受支持的委托列表
 */
export async function saveCommissionsData(commissions) {
    try {
        log.info("保存委托数据到文件...");
        const outputPath = PATHS.COMMISSIONS_DATA;

        let existingData = null;
        try {
            existingData = JSON.parse(file.readTextSync(outputPath));
        } catch (error) {
            log.debug("无法读取现有委托数据：{error}", error.message);
        }

        // 委托地点会随流程阶段变化，但 process 文件按「接取地点」组织目录。
        // 同一账号同一天复扫时，保留首次扫到的 location / country，避免后续扫描覆盖成空串或下一阶段的地点。
        // 名称集合变化 → 换号或跨日，所有字段都用新扫到的覆盖。
        const canPreserve = existingData
            && existingData.timestamp
            && isToday(existingData.timestamp)
            && Array.isArray(existingData.commissions)
            && sameNameSet(existingData.commissions, commissions);

        const merged = commissions.map((c) => {
            const existing = canPreserve
                ? existingData.commissions.find((e) => e.name === c.name)
                : null;
            return {
                ...c,
                location: existing?.location || c.location,
                country: existing?.country || c.country,
            };
        });

        file.writeTextSync(outputPath, JSON.stringify({
            timestamp: new Date().toISOString(),
            scriptVersion: "1.0.0",
            bgiVersion: getVersion(),
            commissions: merged,
        }, null, 2));
        log.info("委托数据保存结束");

        return commissions.filter((c) => c.supported);
    } catch (error) {
        log.error("处理委托数据时出错：{error}", error.message);
        return [];
    }
}

/**
 * 更新单个委托的状态并回写 commissions_data.json
 * 用于委托执行完成后把 status 标记为「已完成」，避免 skipRecognition 复用旧数据时重跑
 *
 * @param {string} commissionName - 委托名称
 * @param {string} status - 目标状态（取 COMMISSION_STATUS 中的值）
 */
export function updateCommissionStatus(commissionName, status) {
    try {
        const data = JSON.parse(file.readTextSync(PATHS.COMMISSIONS_DATA));
        if (!Array.isArray(data?.commissions)) {
            log.warn("委托数据文件格式错误，跳过状态更新：{name}", commissionName);
            return;
        }
        const target = data.commissions.find((c) => c.name === commissionName);
        if (!target) {
            log.warn("未在委托数据中找到 {name}，跳过状态更新", commissionName);
            return;
        }
        if (target.status === status) {
            return;
        }
        target.status = status;
        file.writeTextSync(PATHS.COMMISSIONS_DATA, JSON.stringify(data, null, 2));
        log.info("委托 {name} 状态已更新为 {status}", commissionName, status);
    } catch (error) {
        if (isCancellationError(error)) { throw error; }
        log.error("更新委托状态时出错：{name}, {error}", commissionName, error.message);
    }
}
