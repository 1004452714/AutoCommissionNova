/**
 * 委托数据源模块
 * 从 name.json 白名单和 assets/ 目录扫描取交集，获取支持的委托列表
 */
import { PATHS } from "../config/index.js";

/**
 * 从 name.json 加载白名单
 * @returns {Object} 白名单 { fight: [], talk: [] }
 */
function loadWhitelist() {
  try {
    const content = file.readTextSync(PATHS.SUPPORT_LIST);
    const data = JSON.parse(content);
    return {
      fight: data.fight || [],
      talk: data.talk || [],
    };
  } catch (error) {
    log.error("读取白名单文件失败: {error}", error.message);
    return { fight: [], talk: [] };
  }
}

/**
 * 从 assets/ 目录扫描可用的战斗委托
 * @returns {string[]} 可用的战斗委托名称列表
 */
function scanFightCommissions() {
  const fightList = [];
  try {
    const assetsPath = PATHS.FIGHT_SCRIPT_BASE;
    const items = Array.from(file.readPathSync(assetsPath));
    const folders = items.filter((item) => file.isFolder(item) && !item.includes("process"));
    for (const folderPath of folders) {
      const folderName = folderPath.replace(assetsPath + "/", "").replace(assetsPath + "\\", "");
      fightList.push(folderName);
    }
  } catch (error) {
    log.error("扫描战斗委托目录时出错: {error}", error.message);
  }
  return fightList;
}

/**
 * 从 assets/process/ 目录扫描可用的对话委托
 * @returns {string[]} 可用的对话委托名称列表
 */
function scanTalkCommissions() {
  const talkList = [];
  try {
    const processPath = PATHS.TALK_PROCESS_BASE;
    const items = Array.from(file.readPathSync(processPath));
    const folders = items.filter((item) => file.isFolder(item));
    for (const folderPath of folders) {
      const folderName = folderPath.split("/").pop().split("\\").pop();
      talkList.push(folderName);
    }
  } catch (error) {
    log.error("扫描对话委托目录时出错: {error}", error.message);
  }
  return talkList;
}

/**
 * 加载支持的委托列表（白名单 ∩ 可用委托）
 * @returns {Promise<Object>} 支持的委托 { fight: [], talk: [] }
 */
export async function loadSupportedCommissions() {
  const whitelist = loadWhitelist();
  const availableFight = scanFightCommissions();
  const availableTalk = scanTalkCommissions();

  const supported = {
    fight: whitelist.fight.filter((name) => availableFight.includes(name)),
    talk: whitelist.talk.filter((name) => availableTalk.includes(name)),
  };

  return supported;
}
