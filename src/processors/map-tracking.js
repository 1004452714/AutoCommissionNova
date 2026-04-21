/**
 * 地图追踪步骤处理器
 */
import { PATHS } from "../config/index.js";

export function register(registry) {
  registry.register("地图追踪", async function(step, context) {
    const fullPath = PATHS.TALK_PROCESS_BASE + "/" + context.commissionName + "/" + context.location + "/" + (step.data || step);
    log.info("执行地图追踪: {path}", fullPath);
    try {
      await pathingScript.runFile(fullPath);
      log.info("地图追踪执行完成");
    } catch (error) {
      log.error("执行地图追踪时出错: {error}", error.message);
      throw error;
    }
  });
}
