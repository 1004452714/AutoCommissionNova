/**
 * 自动任务步骤处理器
 */
export function register(registry) {
  registry.register("自动任务", async function(step, context) {
    try {
      const action = step.data && step.data.action;
      const taskType = (step.data && step.data.taskType) || "default";
      const config = (step.data && step.data.config) || {};

      if (!action) {
        log.error("自动任务参数不完整，需要 action 参数");
        return false;
      }
      log.info("执行自动任务操作: {action}", action);

      if (action === "enable") {
        if (taskType === "AutoSkip") {
          log.info("启用自动剧情", taskType);
          dispatcher.addTimer(new RealtimeTimer(taskType));
        } else if (config && typeof config === "object" && Object.keys(config).length > 0) {
          log.info("启用自动任务: {type}，配置: {config}", taskType, JSON.stringify(config));
          dispatcher.addTimer(new RealtimeTimer(taskType, config));
        } else {
          log.info("启用自动任务: {type}", taskType);
          dispatcher.addTimer(new RealtimeTimer(taskType));
        }
      } else if (action === "disable") {
        log.info("取消所有自动任务");
        dispatcher.ClearAllTriggers();
      } else {
        log.error("未知的自动任务操作: {action}", action);
        return false;
      }
      return true;
    } catch (error) {
      log.error("处理自动任务步骤时出错: {error}", error.message);
      return false;
    }
  });
}
