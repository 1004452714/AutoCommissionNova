/**
        * 测试执行模块
        * 跳过识别流程，直接运行流程文件
        *
        * 使用方式：在设置中将"元素采集的队伍名称"填入 114514 即可启用测试模式
        */
import {  PATHS } from "../config/index.js";
import { prepareForCommission } from "./main-process.js";
import { loadNpcProcessFile } from "./npc-executor.js";
import { buildTestContext, executeProcessSteps } from "./process-executor.js";

/**
        * 测试配置区
        * 修改这里的配置来切换测试模式
        * 启用方式：在BGI设置中将"元素采集的队伍名称"填入 114514
        */
const TEST_CONFIG = {
        mode: "commission",                         // 测试模式: "case"=测试用例, "commission"=真实委托
        caseName: "用户分支选择测试",           // mode="case" 时生效，对应 test/process/ 下的目录名
        commissionName: "餐品订单",             // mode="commission" 时生效，对应 process/NPC/ 下的目录名
        location: "蒙德城",                   // mode="commission" 时生效，委托地点
        processFile: "process.json",          // mode="commission" 时生效，流程文件名
};

/**
        * 执行测试
        * @returns {Promise<boolean>} 执行是否成功
        */
export async function runTestCommission() {
        if (settings.elementTeam !== "114514") {
                return false;
        }

        log.info("=== 测试模式已启用 ===");

        if (TEST_CONFIG.mode === "case") {
                return await runTestCase(TEST_CONFIG.caseName);
        } else {
                return await runCommission(TEST_CONFIG.commissionName, TEST_CONFIG.location, TEST_CONFIG.processFile);
        }
}

/**
        * 运行测试用例（从 test/process/ 加载）
        * @param {string} caseName - 测试用例名称
        * @returns {Promise<boolean>}
        */
async function runTestCase(caseName) {
        const testCasePath = `test/process/${caseName}/process.json`;
        log.info("=== 开始运行测试用例: {name} ===", caseName);

        try {
                const processContent = file.readTextSync(testCasePath);
                const processSteps = JSON.parse(processContent);
                log.info("加载流程步骤数量: {count}", processSteps.length);

                const context = buildTestContext({
                        commissionName: caseName,
                        location: "测试位置",
                        processSteps,
                });

                const success = await executeProcessSteps(processSteps, context, 1000);
                log.info("=== 测试用例执行完成: {success} ===", success ? "成功" : "失败");
                return success;
        } catch (error) {
                log.error("测试用例执行失败: {error}", error.message);
                return false;
        }
}

/**
        * 运行真实委托（从 process/NPC/ 加载）
        * @param {string} commissionName - 委托名称
        * @param {string} location - 委托地点
        * @param {string} processFile - 流程文件名
        * @returns {Promise<boolean>}
        */
async function runCommission(commissionName, location, processFile) {
        log.info("=== 开始测试委托: {name} ({location}) ===", commissionName, location);

        try {
                await genshin.returnMainUi();
                await prepareForCommission();

                const processSteps = await loadNpcProcessFile(commissionName, location, processFile);
                if (!processSteps || processSteps.length === 0) {
                        log.error("未找到流程文件: {path}",
                                PATHS.NPC_PROCESS_BASE + "/" + commissionName + "/" + location + "/" + processFile);
                        return false;
                }

                log.info("加载流程步骤数量: {count}", processSteps.length);

                const context = buildTestContext({
                        commissionName,
                        location,
                        processSteps,
                });

                const success = await executeProcessSteps(processSteps, context);
                log.info("=== 测试委托执行完成: {success} ===", success ? "成功" : "失败");
                return success;
        } catch (error) {
                log.error("测试委托执行失败: {error}", error.message);
                return false;
        }
}
