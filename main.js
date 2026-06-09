import { stepRegistry } from "./src/processors/registry.js";
import { registerAllProcessors } from "./src/processors/index.js";
import { registerAllProbes } from "./src/probes/index.js";
import { validateAllProcesses } from "./src/loaders/index.js";
import { executeMainProcess } from "./src/core/main-process.js";
import { checkVersion } from "./src/version/check-version.js";
import { runTestCommission } from "./src/core/test-runner.js";
import { getSetting } from "./src/utils/settings-utils.js";
import { openCommissionConfigEditor } from "./src/core/commission-config-editor.js";
import { releaseAllTemplates } from "./src/vision/index.js";

registerAllProcessors(stepRegistry);
registerAllProbes();

(async function () {
    try {
        setGameMetrics(1920, 1080, genshin.ScreenDpiScale); 
        //检查版本
        await checkVersion();
        //静态校验所有流程文件
        await validateAllProcesses(stepRegistry);

        //获取设置判断运行模式
        const setting = getSetting();

        //根据设置决定是否打开分支配置面板,阻塞至用户关闭
        if (setting.showConfigEditor) {
            await openCommissionConfigEditor();
        }

        if (setting.runMode === "测试") {
            //执行测试
            await runTestCommission();
        } else {
            //执行主流程
            await executeMainProcess(stepRegistry);
        }

        log.info("自动委托执行完毕");
    } catch (error) {
        log.error("自动委托执行过程中发生错误: {error}", error.message);
        throw error;
    } finally {
        // 释放所有懒加载的 RO 模板 mat（脚本退出统一回收）
        releaseAllTemplates();
    }
})();
