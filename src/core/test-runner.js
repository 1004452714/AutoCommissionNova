/**
 * 测试执行模块
 * 跳过识别流程，直接运行流程文件或单元测试
 *
 * 启用方式：在BGI设置中将"选择运行模式"设为"测试"
 *
 * 测试用例（mode="case"）使用 BASIC 类型构造 context，让 resolveResource
 * 指向 test/process/{caseName}/，从而支持依赖 context.resolveResource 的 step
 */
import { PATHS, COMMISSION_TYPE } from "../config/index.js";
import { prepareForCommission } from "./main-process.js";
import { loadNpcProcessFile } from "../loaders/index.js";
import { createCommissionContext, runStepsWithContext } from "./commission-context.js";
import { stepRegistry } from "../processors/registry.js";

/**
 * 测试配置区
 * 修改这里的配置来切换测试模式
 */
const TEST_CONFIG = {
    mode: "case",             // 测试模式: "case"=测试用例, "commission"=真实委托, "unit"=纯函数单元测试
    caseName: "摧毁哨塔测试",       // mode="case" 时生效，对应 test/process/ 下的目录名
    commissionName: "餐品订单",         // mode="commission" 时生效，对应 process/NPC/ 下的目录名
    location: "蒙德城",           // mode="commission" 时生效，委托地点
    processFile: "process.json",      // mode="commission" 时生效，流程文件名
    /**
     * 仅 case 模式有效：测试探针 step（成就检测 / 对话探针 等）时，绕过 用户分支选择
     * step 锁定流程，直接给 context.branchCondition 注入指定 condition。
     * 不需要时置 null
     * 示例：{ type: "achievement", name: "迷踪猎人" }
     *       { type: "dialog", keywords: ["偷偷吃了"] }
     *       { type: "completion" }
     */
    branchCondition: { type: "achievement", name: "这不是应急食品" },
};

/**
 * 执行测试
 * @returns {Promise<boolean>} 执行是否成功
 */
export async function runTestCommission() {
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
    const testCaseDir = `test/process/${caseName}`;
    const testCasePath = `${testCaseDir}/process.json`;
    log.info("=== 开始运行测试用例: {name} ===", caseName);

    try {
        const processContent = file.readTextSync(testCasePath);
        const processSteps = JSON.parse(processContent);
        log.info("加载流程步骤数量: {count}", processSteps.length);

        // 用 BASIC 类型构造 context，让 resolveResource 指向测试用例目录
        const context = createCommissionContext({
            type: COMMISSION_TYPE.BASIC,
            commissionName: caseName,
            location: "测试位置",
            processSteps,
            stepRegistry,
            processDir: testCaseDir,
        });

        // 测试探针 step 时直接注入 branchCondition，跳过 用户分支选择 决策
        // dispatchExplicit / dispatchOnDialogOcr / dispatchOnCommissionComplete 都依赖
        // context.branchCondition 非空才会派发到对应探针
        if (TEST_CONFIG.branchCondition) {
            context.branchCondition = TEST_CONFIG.branchCondition;
            context.activeBranch = "test-branch";
            log.info("测试模式注入 branchCondition: {cond}", JSON.stringify(TEST_CONFIG.branchCondition));
        }

        const success = await runStepsWithContext(context, { sleepMs: 1000, stopOnError: false });
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

        const context = createCommissionContext({
            type: COMMISSION_TYPE.NPC,
            commissionName,
            location,
            processSteps,
            stepRegistry,
        });

        const success = await runStepsWithContext(context, { sleepMs: 2000, stopOnError: false });
        log.info("=== 测试委托执行完成: {success} ===", success ? "成功" : "失败");
        return success;
    } catch (error) {
        log.error("测试委托执行失败: {error}", error.message);
        return false;
    }
}
