/**
 * NPC 委托流程文件加载器
 * 从 process/NPC/{name}/{location}/{file} 读取并解析流程
 * 支持 JSON 数组格式与纯文本行格式
 */
import { PATHS } from "../config/index.js";

/**
 * 读取并解析 NPC 流程文件
 * @param {string} commissionName - 委托名称
 * @param {string} location - 委托地点
 * @param {string} processFileName - 流程文件名，默认为 "process.json"
 * @returns {Promise<Array|false>} 步骤数组，失败返回 false
 */
export async function loadNpcProcessFile(commissionName, location, processFileName = "process.json") {
    const processFilePath = PATHS.NPC_PROCESS_BASE + "/" + commissionName + "/" + location + "/" + processFileName;
    try {
        const processContent = file.readTextSync(processFilePath);
        log.info("找到NPC委托流程文件: {path}", processFilePath);
        try {
            const jsonData = JSON.parse(processContent);
            if (Array.isArray(jsonData)) {
                log.debug("JSON流程解析成功");
                return jsonData;
            }
            log.error("JSON流程格式错误，应为数组");
            return false;
        } catch (jsonError) {
            const lines = processContent.split("\n").map((line) => line.trim()).filter((line) => line.length > 0);
            return lines;
        }
    } catch (error) {
        log.warn("未找到NPC委托 {name} 在 {location} 的流程文件: {path}", commissionName, location, processFilePath);
        return false;
    }
}
