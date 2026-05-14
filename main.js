import { stepRegistry } from "./src/processors/registry.js";
import { registerAllProcessors } from "./src/processors/index.js";
import { executeMainProcess } from "./src/core/main-process.js";
import { checkVersion } from "./src/version/check-version.js";
import { runTestCommission } from "./src/core/test-runner.js";

registerAllProcessors(stepRegistry);

(async function () {
        try {
                //检查版本
                await checkVersion();
                //执行测试
                await runTestCommission();
                //执行主流程
                await executeMainProcess(stepRegistry);
                log.info("自动委托执行完毕");
        } catch (error) {
                log.error("自动委托执行过程中发生错误: {error}", error.message);
                throw error;
        }
})();
