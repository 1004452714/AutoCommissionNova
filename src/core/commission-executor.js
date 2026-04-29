/**
 * 委托执行调度模块
 * 遍历委托列表，按类型调度执行，支持重试
 *
 * 执行流程：
 * 1. 加载委托数据文件
 * 2. 预统计已完成数量（用于后续完成状态判断）
 * 3. 遍历委托列表，过滤已完成、缺少地点的委托
 * 4. 按委托类型（NPC/Basic）执行对应流程
 * 5. 执行后检查完成状态，支持重试机制
 */
import { COMMISSION_TYPE, MAX_COMMISSION_RETRY_COUNT, PATHS } from "../config/index.js";
import { isCompleted } from "../recognition/index.js";
import { executeNpcCommission } from "./npc-executor.js";
import { executeBasicCommission } from "./basic-executor.js";

/**
 * 更新分支完成进度
 * 当委托任务成功完成时调用
 *
 * @param {string} commissionName - 委托名称
 * @param {Object} context - 执行上下文（包含 branchConfigCache 和 executedBranches）
 */
async function updateBranchCompletion(commissionName, context) {
  try {
    // 从缓存中获取配置（如果有的话）
    const config = context.branchConfigCache;
    if (!config) {
      return; // 没有缓存配置，说明没有使用分支选择
    }

    const commissionConfig = config[commissionName];
    if (!commissionConfig) {
      return; // 没有配置该委托的分支信息
    }

    // 初始化 completed 数组
    if (!commissionConfig.completed) {
      commissionConfig.completed = [];
    }

    // 获取本次执行的分支列表
    const executedBranches = context.executedBranches || [];

    // 更新完成进度
    let hasUpdate = false;
    for (const branch of executedBranches) {
      if (!commissionConfig.completed.includes(branch)) {
        commissionConfig.completed.push(branch);
        hasUpdate = true;
        log.info("已更新分支完成进度: {branch}", branch);
      }
    }

    // 如果有更新，保存配置文件
    if (hasUpdate) {
      const configPath = PATHS.CONFIG_BASE + "/commission-branches.json";
      file.writeTextSync(configPath, JSON.stringify(config, null, 2));
      log.info("分支配置文件已更新");
    }
  } catch (error) {
    log.error("更新分支完成进度时出错: {error}", error.message);
  }
}

/**
 * 执行委托追踪（遍历+重试）
 *
 * 遍历识别到的委托列表，按类型（NPC/Basic）执行对应流程
 * 每个委托支持重试机制，执行完成后检查状态
 *
 * @param {Object} stepRegistry - 步骤处理器注册表
 * @returns {Promise<boolean>} 是否有委托执行成功
 *
 * @example
 * const success = await executeCommissionTracking(stepRegistry);
 * if (success) {
 *   console.log("至少完成一个委托");
 * }
 */
export async function executeCommissionTracking(stepRegistry) {
  try {
    log.info("开始执行委托追踪");
    await genshin.returnMainUi();
    await sleep(1000);

    // 加载委托数据
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

    // 预统计已完成数量，用于后续完成状态判断的基准值
    let completedCount = 0;
    for (const commission of commissions) {
      if (commission.location === "已完成") { completedCount++; continue; }
    }

    // 遍历执行每个委托
    for (const commission of commissions) {
      // 过滤已完成的委托
      if (commission.location === "已完成") {
        log.info("委托 {name} 已完成，跳过", commission.name);
        continue;
      }
      // 过滤缺少地点信息的委托
      if (!commission.location || commission.location === "未知地点" || commission.location === "识别失败") {
        log.warn("委托 {name} 缺少地点信息，跳过", commission.name);
        continue;
      }

      log.info("开始执行委托: {name} ({location}) [{type}]", commission.name, commission.location, commission.type || "未知类型");

      let success = false;
      let retryCount = 0;

      // 重试循环
      while (retryCount <= MAX_COMMISSION_RETRY_COUNT && !success) {
        if (retryCount > 0) {
          log.info("委托 {name} 第 {retry} 次重试执行", commission.name, retryCount);
        }

        // 按类型执行
        if (commission.type === COMMISSION_TYPE.NPC) {
          const npcResult = await executeNpcCommission(commission.name, commission.location, stepRegistry);
          dispatcher.ClearAllTriggers();
          if (npcResult.success) {
            const completed = await isCompleted(commission.name);
            if (completed) {
              success = true;
              completedCount++;
              log.info("NPC委托 {name} 执行完成", commission.name);
              // 更新分支完成进度
              await updateBranchCompletion(commission.name, npcResult.context);
            }
            else { log.warn("NPC委托 {name} 执行后检查未完成，重试次数: {retry}/{max}", commission.name, retryCount, MAX_COMMISSION_RETRY_COUNT); }
          } else {
            log.warn("NPC委托 {name} 执行失败，重试次数: {retry}/{max}", commission.name, retryCount, MAX_COMMISSION_RETRY_COUNT);
          }
        } else {
          const basicSuccess = await executeBasicCommission(commission, stepRegistry);
          if (basicSuccess) {
            const completed = await isCompleted(commission.name);
            if (completed) { success = true; completedCount++; log.info("委托 {name} 已完成", commission.name); }
            else { log.info("委托 {name} 未完成", commission.name); }
          } else {
            log.warn("Basic委托 {name} 执行失败，重试次数: {retry}/{max}", commission.name, retryCount, MAX_COMMISSION_RETRY_COUNT);
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
