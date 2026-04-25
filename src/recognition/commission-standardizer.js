/**
 * 委托名称/地点标准化模块
 * 使用编辑距离算法将 OCR 识别结果标准化为已知委托名称和地点
 */
import { THRESHOLDS, PATHS } from "../config/index.js";
import { getClosestMatch } from "./text-matcher.js";
import { loadSupportedCommissions } from "../data/index.js";

const referenceData = { fight: {}, talk: {} };

/**
 * 初始化委托名称和地点参考数据
 * @param {Object} [supportedCommissions] - 支持的委托列表 { fight: [], talk: [] }，不传参则从数据源加载
 */
export async function initReferenceData(supportedCommissions) {
  try {
    if (!supportedCommissions) {
      supportedCommissions = await loadSupportedCommissions();
    }
    referenceData.fight = buildFightReferenceMap(supportedCommissions.fight);
    referenceData.talk = buildTalkReferenceMap(supportedCommissions.talk);
    log.debug("战斗委托参考数据: {count} 个委托", Object.keys(referenceData.fight).length);
    log.debug("对话委托参考数据: {count} 个委托", Object.keys(referenceData.talk).length);
  } catch (error) {
    log.error("初始化委托参考数据时出错: {error}", error.message);
  }
}

/**
 * 构建战斗委托名称-地点映射表
 * @param {string[]} fightCommissions - 战斗委托名称列表
 * @returns {Object} { 委托名: [地点列表] }
 */
function buildFightReferenceMap(fightCommissions) {
  const fightList = {};
  try {
    const assetsPath = PATHS.FIGHT_SCRIPT_BASE;
    for (const commissionName of fightCommissions) {
      try {
        const folderPath = assetsPath + "/" + commissionName;
        const items = Array.from(file.readPathSync(folderPath));
        const subDirs = items.filter((item) => file.isFolder(item));
        const cleanSubDirs = subDirs.map((subDirPath) => {
          const dirName = subDirPath.split("/").pop().split("\\").pop();
          // 从 "{地点}-{编号}" 中提取地点部分
          return dirName.replace(/-(\d+)$/, "");
        });
        fightList[commissionName] = cleanSubDirs;
      } catch (folderError) {
        log.warn("无法读取战斗委托 {name} 的目录: {error}", commissionName, folderError.message);
      }
    }
  } catch (error) {
    log.error("构建战斗委托参考数据时出错: {error}", error.message);
  }
  return fightList;
}

/**
 * 构建对话委托名称-地点映射表
 * @param {string[]} talkCommissions - 对话委托名称列表
 * @returns {Object} { 委托名: [地点列表] }
 */
function buildTalkReferenceMap(talkCommissions) {
  const talkList = {};
  try {
    const processPath = PATHS.TALK_PROCESS_BASE;
    for (const commissionName of talkCommissions) {
      try {
        const folderPath = processPath + "/" + commissionName;
        const subItems = Array.from(file.readPathSync(folderPath));
        const subFolders = subItems.filter((subItem) => file.isFolder(subItem));
        const cleanSubFolders = subFolders.map((subFolderPath) => subFolderPath.split("/").pop().split("\\").pop());
        talkList[commissionName] = cleanSubFolders;
      } catch (folderError) {
        log.warn("无法读取对话委托 {name} 的目录: {error}", commissionName, folderError.message);
      }
    }
  } catch (error) {
    log.error("构建对话委托参考数据时出错: {error}", error.message);
  }
  return talkList;
}

/**
 * 标准化委托名称
 * @param {string} rawName - OCR 识别的原始名称
 * @returns {Promise<string|null>} 标准化后的名称，未初始化或匹配失败时返回 null
 */
export async function standardizeCommissionName(rawName) {
  //TODO 开发时BGI环境有bug，模块会重复初始化，后续修复后可以去掉initReferenceData
  await initReferenceData();
  const allNames = [...Object.keys(referenceData.fight), ...Object.keys(referenceData.talk)];
  return getClosestMatch(rawName, allNames, THRESHOLDS.COMMISSION_NAME);
}

/**
 * 标准化委托地点
 * @param {string} commissionName - 标准化后的委托名称
 * @param {string} rawLocation - OCR 识别的原始地点
 * @returns {string} 标准化后的地点
 */
export function standardizeCommissionLocation(commissionName, rawLocation) {
  let candidates = [];
  if (referenceData.fight[commissionName]) {
    candidates = referenceData.fight[commissionName];
  } else if (referenceData.talk[commissionName]) {
    candidates = referenceData.talk[commissionName];
  }
  if (candidates.length === 0) {
    log.warn("没有找到委托 {name} 的参考地点列表", commissionName);
    return rawLocation;
  }
  const closestLocation = getClosestMatch(rawLocation, candidates, THRESHOLDS.LOCATION);
  if (closestLocation) {
    return closestLocation;
  }
  log.info("地点相似度未达阈值，保持原地点: {raw}", rawLocation);
  return rawLocation;
}
