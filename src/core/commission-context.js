/**
 * 委托执行上下文工厂
 * NPC 与 Basic 委托共享同一构造路径，避免字段缺失导致的隐式不对称
 *
 * 运行时由 step 按需写入的字段（不在工厂初始化）：
 *   branchConfigCache  — 分支配置缓存（user-branch-select 首次读后缓存）
 *   executedBranches   — 本次执行过的分支列表（commission-executor 用于回写完成状态）
 *   locationDetected   — 位置检测命中标志（location-detection）
 *   detectedPosition   — 位置检测命中的坐标（location-detection）
 */
import { COMMISSION_TYPE, PATHS } from "../config/index.js";
import { isCancellationError } from "../utils/error-utils.js";

/**
 * 构造 resolveResource 解析器
 * NPC 委托解析 process/NPC/{commissionName}/{location}/{filename}
 * Basic 委托解析 {processDir}/{filename}
 *
 * 处理器只需调 context.resolveResource(filename) 取得绝对路径，
 * 不再各自硬编码 PATHS.NPC_PROCESS_BASE 拼接逻辑
 */
function createResolveResource({ type, commissionName, location, processDir }) {
    if (type === COMMISSION_TYPE.BASIC) {
        return (filename) => processDir + "/" + filename;
    }
    return (filename) => PATHS.NPC_PROCESS_BASE + "/" + commissionName + "/" + location + "/" + filename;
}

/**
 * 创建委托执行上下文
 * @param {Object} options
 * @param {string} options.type - COMMISSION_TYPE.NPC | COMMISSION_TYPE.BASIC
 * @param {string} options.commissionName - 委托名称
 * @param {string} options.location - 委托地点
 * @param {Array}  options.processSteps - 流程步骤数组
 * @param {Object} options.stepRegistry - 步骤处理器注册表
 * @param {string} [options.processDir] - Basic 委托的流程目录；NPC 委托省略
 * @returns {Object} 共享上下文对象
 */
export function createCommissionContext({ type, commissionName, location, processSteps, stepRegistry, processDir }) {
    const context = {
        type,
        commissionName,
        location,
        processSteps,
        processDir,
        stepRegistry,
        currentIndex: 0,
        currentStepLabel: null,
        resolveResource: createResolveResource({ type, commissionName, location, processDir }),
        // 运行时由 step 写入的字段，工厂统一初始化以保持 context shape 稳定
        branchConfigCache: null,
        executedBranches: [],
        locationDetected: false,
        detectedPosition: null,
    };

    // 把子流程 step 数组 splice 到当前 step 之后，并为每个 sub-step 打上 _indexPath，
    // 让 runStepsWithContext 输出层级序号（父序号.子序号），例如 "1.1" / "1.2"
    // 嵌套子流程时，父 step 自身的 currentStepLabel 即已是 "1.1" 等层级值，递归生成 "1.1.1" / "1.1.2"
    context.insertSubSteps = (subSteps) => {
        const parentLabel = context.currentStepLabel || String(context.currentIndex + 1);
        for (let j = 0; j < subSteps.length; j++) {
            subSteps[j]._indexPath = parentLabel + "." + (j + 1);
        }
        context.processSteps.splice(context.currentIndex + 1, 0, ...subSteps);
        return subSteps.length;
    };

    return context;
}

/**
 * 执行 context.processSteps 中的所有步骤
 *
 * 由 npc-executor / basic-executor / test-runner 共用，避免每个 executor 各自维护一份循环主体
 *
 * @param {Object} context - 共享执行上下文（必须包含 processSteps 和 stepRegistry）
 * @param {Object} [options]
 * @param {number} [options.sleepMs=250] - 每步之间的等待毫秒
 * @param {boolean} [options.stopOnError=true] - 单步抛错时是否中断后续步骤
 * @returns {Promise<boolean>} 全部步骤未抛错时返回 true
 */
export async function runStepsWithContext(context, options = {}) {
    const { sleepMs = 250, stopOnError = true } = options;
    const { processSteps, stepRegistry } = context;

    let topLevelCounter = 0;
    for (let i = 0; i < processSteps.length; i++) {
        const step = processSteps[i];
        // 子流程 splice 时已写入 _indexPath（如 "1.1"），顶层 step 沿用 1, 2, 3... 顺序
        let stepLabel;
        if (step._indexPath) {
            stepLabel = step._indexPath;
        } else {
            topLevelCounter++;
            stepLabel = String(topLevelCounter);
        }
        log.info("执行流程步骤 {step}: {type}", stepLabel, step.type);
        context.currentIndex = i;
        context.currentStepLabel = stepLabel;

        try {
            await stepRegistry.process(step, context);
        } catch (stepError) {
            if (isCancellationError(stepError)) { throw stepError; }
            log.error("执行步骤 {step} 时出错: {error}", stepLabel, stepError.message);
            if (stopOnError) return false;
        }

        await sleep(sleepMs);
    }
    return true;
}
