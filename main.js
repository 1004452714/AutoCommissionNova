import { stepRegistry } from "./src/processors/registry.js";
import { registerAllProcessors } from "./src/processors/index.js";
import { executeMainProcess } from "./src/core/main-process.js";
import { checkVersion } from "./src/version/check-version.js";

registerAllProcessors(stepRegistry);

(async function() {
  try {
    await checkVersion();
    const startTime = Date.now();
    await executeMainProcess(stepRegistry);
    const totalTime = Math.round((Date.now() - startTime) / 1000);
    log.info("脚本执行完成，总耗时: {time} 秒", totalTime);
  } catch (error) {
    log.error("脚本执行过程中发生错误: {error}", error.message);
    throw error;
  }
})();
