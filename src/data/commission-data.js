/**
 * 委托数据管理模块
 * 负责委托数据的加载、保存、验证和持久化
 * 采用内存 + 文件双写模式，文件仅作为持久化备份
 */
import { PATHS, COMMISSION_STATUS } from "../config/index.js";

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
export async function saveCommissionsData(commissions) {
    try {
        log.info("保存委托数据到文件...");
        const outputPath = PATHS.COMMISSIONS_DATA;
        let shouldUpdateExisting = false;
        let existingData = null;

        try {
            const existingContent = file.readTextSync(outputPath);
            existingData = JSON.parse(existingContent);
            if (existingData && existingData.timestamp && existingData.commissions &&
                    existingData.commissions.length === 4 && commissions.length === 4 &&
                    isToday(existingData.timestamp) &&
                    existingData.commissions.every((c) => c.status)) {
                const existingNames = existingData.commissions.map((c) => c.name).sort();
                const newNames = commissions.map((c) => c.name).sort();
                if (existingNames.every((name, idx) => name === newNames[idx])) {
                    log.info("检测到相同的委托列表，只更新已完成状态");
                    shouldUpdateExisting = true;
                }
            }
        } catch (error) {
            log.debug("无法读取现有委托数据：{error}", error.message);
        }

        let commissionsData;
        if (shouldUpdateExisting && existingData) {
            for (let i = 0; i < existingData.commissions.length; i++) {
                const existing = existingData.commissions[i];
                const updated = commissions.find((c) => c.name === existing.name);
                if (updated && existing.status === COMMISSION_STATUS.UNKNOWN) {
                    existing.location = updated.location;
                    existing.status = updated.status;
                    existing.type = updated.type;
                    existing.supported = updated.supported;
                    existing.country = updated.country;
                    existing.commissionPosition = updated.commissionPosition;
                }
            }
            existingData.timestamp = new Date().toISOString();
            commissionsData = existingData;
        } else {
            commissionsData = {
                timestamp: new Date().toISOString(),
                scriptVersion: "1.0.0",
                bgiVersion: getVersion(),
                commissions: commissions,
            };
        }

        try {
            file.writeTextSync(outputPath, JSON.stringify(commissionsData, null, 2));
            log.info("委托数据保存结束");
        } catch (writeError) {
            log.error("保存委托数据失败：{error}", writeError.message);
        }

        return commissions.filter((c) => c.supported);
    } catch (error) {
        log.error("处理委托数据时出错：{error}", error.message);
        return [];
    }
}
