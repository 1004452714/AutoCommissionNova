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
    return {
        type,
        commissionName,
        location,
        processSteps,
        processDir,
        stepRegistry,
        currentIndex: 0,
        resolveResource: createResolveResource({ type, commissionName, location, processDir }),
    };
}
