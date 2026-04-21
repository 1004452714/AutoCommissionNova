/**
 * 战斗委托执行模块
 * 合并了原 core.js 和 execute.js 中重复的战斗执行逻辑
 */
import { PATHS } from "../config/index.js";
import { calculateDistance, getCommissionTargetPosition } from "../navigation/index.js";

/**
 * 执行战斗委托
 * @param {Object} commission - 委托对象
 * @returns {Promise<boolean>}
 */
export async function executeFightCommission(commission) {
  try {
    log.info("执行战斗委托: {name}", commission.name);
    const location = commission.location.trim();
    const scriptPaths = [
      PATHS.FIGHT_SCRIPT_BASE + "/" + commission.name + "/" + location + "-1.json",
      PATHS.FIGHT_SCRIPT_BASE + "/" + commission.name + "/" + location + "-2.json",
      PATHS.FIGHT_SCRIPT_BASE + "/" + commission.name + "/" + location + "-3.json",
    ];

    const scriptInfo = [];
    for (const scriptPath of scriptPaths) {
      try {
        file.readTextSync(scriptPath);
        const targetPos = await getCommissionTargetPosition(scriptPath);
        if (targetPos) {
          const distance = calculateDistance(commission.CommissionPosition, targetPos);
          scriptInfo.push({ path: scriptPath, distance, valid: true });
          log.info("委托 {name} 目标位置: ({x}, {y})，距离: {distance}", scriptPath, targetPos.x, targetPos.y, distance);
        } else {
          scriptInfo.push({ path: scriptPath, distance: Infinity, valid: false });
        }
      } catch (readError) {
        continue;
      }
    }

    scriptInfo.sort((a, b) => a.distance - b.distance);
    log.info("排序后的脚本执行顺序:");
    scriptInfo.forEach((info, index) => {
      log.info("{index}. 脚本: {path}, 距离: {distance}", index + 1, info.path, info.distance);
    });

    if (scriptInfo.length > 0) {
      const closestScript = scriptInfo[0];
      try {
        log.info("执行最近的脚本: {path} (距离: {distance})", closestScript.path, closestScript.distance);
        dispatcher.addTimer(new RealtimeTimer("AutoPick", { forceInteraction: false }));
        await pathingScript.runFile(closestScript.path);
        log.info("路径追踪脚本执行完成");
        dispatcher.ClearAllTriggers();
        return true;
      } catch (scriptError) {
        log.error("执行路径追踪脚本时出错: {error}", scriptError);
        dispatcher.ClearAllTriggers();
      }
    }

    log.warn("战斗委托 {name} 所有脚本执行失败", commission.name);
    return false;
  } catch (error) {
    log.error("执行战斗委托时出错: {error}", error.message);
    return false;
  }
}
