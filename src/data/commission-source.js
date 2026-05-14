/**
 * 委托数据源模块
 * 从 name.json 白名单和 process/ 目录扫描取交集，获取支持的委托列表
 */
import { PATHS } from "../config/index.js";

/**
 * 从 name.json 加载白名单
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
    };
  } catch (error) {
    log.error("读取白名单文件失败: {error}", error.message);
    return { basic: [], npc: [] };
  }
}

/**
 * 从 process/Basic/ 目录扫描可用的Basic委托
 * @returns {string[]} 可用的Basic委托名称列表
 */
function scanBasicCommissions() {
  const basicList = [];
  try {
    const assetsPath = PATHS.BASIC_SCRIPT_BASE;
    const items = Array.from(file.readPathSync(assetsPath));
    const folders = items.filter((item) => file.isFolder(item));
    for (const folderPath of folders) {
      const folderName = folderPath.split("/").pop().split("\\").pop();
      basicList.push(folderName);
    }
  } catch (error) {
    log.error("扫描Basic委托目录时出错: {error}", error.message);
  }
  return basicList;
}

/**
 * 从 process/NPC/ 目录扫描可用的NPC委托
 * @returns {string[]} 可用的NPC委托名称列表
 */
function scanNpcCommissions() {
  const npcList = [];
  try {
    const processPath = PATHS.NPC_PROCESS_BASE;
    const items = Array.from(file.readPathSync(processPath));
    const folders = items.filter((item) => file.isFolder(item));
    for (const folderPath of folders) {
      const folderName = folderPath.split("/").pop().split("\\").pop();
      npcList.push(folderName);
    }
  } catch (error) {
    log.error("扫描NPC委托目录时出错: {error}", error.message);
  }
  return npcList;
}

/**
 * 加载支持的委托列表
 * 
 * 确保只有同时满足以下两个条件的委托才会被执行：
 * 1. 在 name.json 白名单中声明
 * 2. 在 process/ 目录下有对应的流程文件
 * 
 * @returns {Promise<Object>} 支持的委托列表
 * @returns {string[]} returns.basic - 支持的 Basic 委托名称列表
 * @returns {string[]} returns.npc - 支持的 NPC 委托名称列表
 */
export async function loadSupportedCommissions() {
  const whitelist = loadWhitelist();
  const availableBasic = scanBasicCommissions();
  const availableNpc = scanNpcCommissions();

  const supported = {
    basic: whitelist.basic.filter((name) => availableBasic.includes(name)),
    npc: whitelist.npc.filter((name) => availableNpc.includes(name)),
  };

  return supported;
}
