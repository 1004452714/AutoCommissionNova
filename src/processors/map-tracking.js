/**
 * 地图追踪步骤处理器
 * 支持对话委托和战斗委托两种路径解析方式
 */
import { PATHS } from "../config/index.js";

export function register(registry) {
  registry.register("地图追踪", async function(step, context) {
    const scriptName = step.data || step;
    let fullPath;

    // 优先使用 processDir（战斗委托流程目录）
    if (context.processDir) {
      fullPath = context.processDir + "/" + scriptName;
    } else {
      // 对话委托路径：assets/process/{委托名}/{地点}/
      fullPath = PATHS.TALK_PROCESS_BASE + "/" + context.commissionName + "/" + context.location + "/" + scriptName;
    }

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
