/**
 * 跳过列表管理模块
 * 管理需要跳过的委托列表
 */
import { getSetting } from "../utils/settings-utils.js";
import { parseSkipCommissions } from "../utils/text-utils.js";

let skipCommissionsList = [];

/**
 * 初始化跳过委托列表
 */
export async function initSkipCommissionsList() {
  const setting = await getSetting();
  skipCommissionsList = parseSkipCommissions(setting.skipCommissions);
  if (skipCommissionsList.length > 0) {
    log.info("配置的跳过委托列表: {list}", skipCommissionsList.join(", "));
  }
}

/**
 * 获取跳过委托列表
 * @returns {string[]} 跳过的委托名称列表
 */
export function getSkipCommissionsList() {
  return skipCommissionsList;
}

/**
 * 检查委托是否在跳过列表中
 * @param {string} commissionName - 委托名称
 * @returns {boolean}
 */
export function isCommissionSkipped(commissionName) {
  return skipCommissionsList.indexOf(commissionName) !== -1;
}
