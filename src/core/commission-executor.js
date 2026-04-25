/**
 * 委托执行调度模块
 * 遍历委托列表，按类型调度执行，支持重试
 */
import { COMMISSION_TYPE, MAX_COMMISSION_RETRY_COUNT, PATHS } from "../config/index.js";
import { isCompleted } from "../recognition/index.js";
import { isCommissionSkipped } from "../data/index.js";
import { executeTalkCommission } from "./talk-executor.js";
import { executeFightCommission } from "./fight-executor.js";

/**
 * 执行委托追踪（遍历+重试）
 * @param {Object} stepRegistry - 步骤处理器注册表
 * @returns {Promise<boolean>}
 */
export async function executeCommissionTracking(stepRegistry) {
  try {
    log.info("开始执行委托追踪 - 按距离排序模式");
    await genshin.returnMainUi();
    await sleep(1000);

    let commissions = [];
    try {
      const commissionsDataContent = file.readTextSync(PATHS.COMMISSIONS_DATA);
      const commissionsData = JSON.parse(commissionsDataContent);
      if (commissionsData && commissionsData.commissions && Array.isArray(commissionsData.commissions)) {
        commissions = commissionsData.commissions.filter((c) => c.supported);
      } else {
        log.error("委托数据文件格式错误");
        return false;
      }
    } catch (error) {
      log.error("读取委托数据失败: {error}", error.message);
      return false;
    }

    if (commissions.length === 0) {
      log.warn("没有找到支持的委托，请先运行识别脚本");
      return false;
    }

    let completedCount = 0;
    for (const commission of commissions) {
      if (commission.location === "已完成") { completedCount++; continue; }
    }

    for (const commission of commissions) {
      if (isCommissionSkipped(commission.name)) {
        log.info("委托 {name} 在跳过列表中，跳过执行", commission.name);
        continue;
      }
      if (commission.location === "已完成") {
        log.info("委托 {name} 已完成，跳过", commission.name);
        continue;
      }
      if (!commission.location || commission.location === "未知地点" || commission.location === "识别失败") {
        log.warn("委托 {name} 缺少地点信息，跳过", commission.name);
        continue;
      }

      log.info("开始执行委托: {name} ({location}) [{type}]", commission.name, commission.location, commission.type || "未知类型");

      let success = false;
      let retryCount = 0;

      while (retryCount <= MAX_COMMISSION_RETRY_COUNT && !success) {
        if (retryCount > 0) {
          log.info("委托 {name} 第 {retry} 次重试执行", commission.name, retryCount);
        }

        if (commission.type === COMMISSION_TYPE.TALK) {
          const talkSuccess = await executeTalkCommission(commission.name, commission.location, stepRegistry);
          dispatcher.ClearAllTriggers();
          if (talkSuccess) {
            const completed = await isCompleted(completedCount);
            if (completed) { completedCount++; success = true; log.info("对话委托 {name} 执行完成", commission.name); }
            else { log.warn("对话委托 {name} 执行后检查未完成，重试次数: {retry}/{max}", commission.name, retryCount, MAX_COMMISSION_RETRY_COUNT); }
          } else {
            log.warn("对话委托 {name} 执行失败，重试次数: {retry}/{max}", commission.name, retryCount, MAX_COMMISSION_RETRY_COUNT);
          }
        } else {
          const fightSuccess = await executeFightCommission(commission, stepRegistry);
          if (fightSuccess) {
            const completed = await isCompleted(completedCount);
            if (completed) { completedCount++; success = true; log.info("委托 {name} 已完成", commission.name); }
            else { log.info("委托 {name} 未完成", commission.name); }
          } else {
            log.warn("战斗委托 {name} 执行失败，重试次数: {retry}/{max}", commission.name, retryCount, MAX_COMMISSION_RETRY_COUNT);
          }
        }

        retryCount++;
        if (!success && retryCount <= MAX_COMMISSION_RETRY_COUNT) {
          await sleep(1000);
        }
      }

      if (!success) {
        log.warn("委托 {name} 重试 {retry} 次后仍未完成，跳过该委托", commission.name, MAX_COMMISSION_RETRY_COUNT);
      } else {
        log.info("委托 {name} 执行成功", commission.name);
      }
    }

    log.info("委托追踪全部执行完成，共执行 {count}/{total} 个委托", completedCount, commissions.length);
    return completedCount > 0;
  } catch (error) {
    log.error("执行委托追踪时出错: {error}", error.message);
    return false;
  }
}
