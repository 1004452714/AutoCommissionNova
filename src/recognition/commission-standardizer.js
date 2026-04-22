/**
 * 委托名称/地点标准化模块
 * 使用编辑距离算法将 OCR 识别结果标准化为已知委托名称
 */
import { THRESHOLDS, PATHS } from "../config/index.js";
import { getClosestMatch } from "./text-matcher.js";

const standardizationLists = { fight: {}, talk: {} };

/**
 * 初始化标准化列表
 */
export function initialize() {
  log.info("初始化委托标准化列表...");
  try {
    standardizationLists.fight = buildFightStandardizationList();
    standardizationLists.talk = buildTalkStandardizationList();
    log.info("委托标准化列表初始化完成");
    log.debug("战斗委托标准化列表: {count} 个委托", Object.keys(standardizationLists.fight).length);
    log.debug("对话委托标准化列表: {count} 个委托", Object.keys(standardizationLists.talk).length);
  } catch (error) {
    log.error("初始化标准化列表时出错: {error}", error.message);
  }
}

/**
 * 构建战斗委托标准化列表
 * @returns {Object} { 委托名: [地点列表] }
 */
function buildFightStandardizationList() {
  const fightList = {};
  try {
    const assetsPath = PATHS.FIGHT_SCRIPT_BASE;
    const items = Array.from(file.readPathSync(assetsPath));
    const folders = items.filter((item) => file.isFolder(item) && !item.includes("process"));
    for (const folderPath of folders) {
      const folderName = folderPath.replace(assetsPath + "/", "").replace(assetsPath + "\\", "");
      const files = Array.from(file.readPathSync(folderPath));
      const jsonFiles = files.filter((f) => f.endsWith(".json"));
      const cleanFileNames = jsonFiles.map((filePath) => {
        const fileName = filePath.split("/").pop().split("\\").pop();
        return fileName.replace(/-(\d+)?\.json$/, "");
      });
      fightList[folderName] = cleanFileNames;
    }
  } catch (error) {
    log.error("构建战斗委托标准化列表时出错: {error}", error.message);
  }
  return fightList;
}

/**
 * 构建对话委托标准化列表
 * @returns {Object} { 委托名: [地点列表] }
 */
function buildTalkStandardizationList() {
  const talkList = {};
  try {
    const processPath = PATHS.TALK_PROCESS_BASE;
    const items = Array.from(file.readPathSync(processPath));
    const folders = items.filter((item) => file.isFolder(item));
    for (const folderPath of folders) {
      const folderName = folderPath.split("/").pop().split("\\").pop();
      const subItems = Array.from(file.readPathSync(folderPath));
      const subFolders = subItems.filter((subItem) => file.isFolder(subItem));
      const cleanSubFolders = subFolders.map((subFolderPath) => subFolderPath.split("/").pop().split("\\").pop());
      talkList[folderName] = cleanSubFolders;
    }
  } catch (error) {
    log.error("构建对话委托标准化列表时出错: {error}", error.message);
  }
  return talkList;
}

/**
 * 标准化委托名称
 * @param {string} rawName - OCR 识别的原始名称
 * @returns {string|null} 标准化后的名称
 */
export function standardizeCommissionName(rawName) {
  //TODO 开发时BGI环境有bug，模块会重复初始化，后续修复后可以去掉initialize
  initialize();
  const allNames = [...Object.keys(standardizationLists.fight), ...Object.keys(standardizationLists.talk)];
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
  if (standardizationLists.fight[commissionName]) {
    candidates = standardizationLists.fight[commissionName];
  } else if (standardizationLists.talk[commissionName]) {
    candidates = standardizationLists.talk[commissionName];
  }
  if (candidates.length === 0) {
    log.warn("没有找到委托 {name} 的标准化地点列表", commissionName);
    return rawLocation;
  }
  const closestLocation = getClosestMatch(rawLocation, candidates, THRESHOLDS.LOCATION);
  if (closestLocation) {
    log.info("标准化地点: {raw} -> {standard}", rawLocation, closestLocation);
    return closestLocation;
  }
  log.info("地点相似度未达阈值，保持原地点: {raw}", rawLocation);
  return rawLocation;
}
