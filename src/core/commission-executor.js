/**
 * 委托执行调度模块
 * 遍历委托列表，按类型调度执行，支持重试
 *
 * 执行流程：
 * 1. 加载委托数据文件
 * 2. 预统计已完成数量（用于后续完成状态判断）
 * 3. 遍历委托列表，过滤已完成、缺少地点、不支持的委托
 * 4. 按委托类型（NPC/Basic）通过 executorMap 调度执行
 * 5. 执行后检查完成状态，支持重试机制
 */
import { COMMISSION_TYPE, COMMISSION_STATUS, MAX_COMMISSION_RETRY_COUNT, PATHS } from "../config/index.js";
import { isCompleted } from "../recognition/index.js";
import { executeNpcCommission } from "./npc-executor.js";
import { executeBasicCommission } from "./basic-executor.js";
import { isCancellationError } from "../utils/error-utils.js";
import { dispatchOnCommissionComplete } from "../probes/index.js";
import { writeBranchConfig } from "../loaders/branch-config.js";

/**
 * 委托类型 → 执行器映射
 * 新增委托类型时只需追加一行，无需改 executeCommissionTracking 主循环
 */
const executorMap = {
    [COMMISSION_TYPE.NPC]: (comm, stepRegistry) => executeNpcCommission(comm.name, comm.location, stepRegistry),
    [COMMISSION_TYPE.BASIC]: (comm, stepRegistry) => executeBasicCommission(comm, stepRegistry),
};

/**
 * 更新分支完成进度
 * 委托任务成功完成后调用
 *
 * 仅当满足以下全部条件时把 context.activeBranch 写入 completed：
 *   - context.branchCondition 非空（即 activeBranch 是带条件的成就分支，不是 default 兜底的偏好分支）
 *   - context.branchConditionMet === true（探针 step 检测到本次条件已达成）
 *
 * 偏好分支（branchCondition === null）永远不进 completed，每次都可重新跑
 *
 * @param {string} commissionName - 委托名称
 * @param {Object} context - 执行上下文
 */
async function updateBranchCompletion(commissionName, context) {
    try {
        const config = context.branchConfigCache;
        if (!config) {
            return;
        }

        const commissionConfig = config[commissionName];
        if (!commissionConfig) {
            return;
        }

        const activeBranch = context.activeBranch;
        if (!activeBranch || !context.branchCondition || !context.branchConditionMet) {
            return;
        }

        if (!commissionConfig.completed) {
            commissionConfig.completed = [];
        }
        if (commissionConfig.completed.includes(activeBranch)) {
            return;
        }

        commissionConfig.completed.push(activeBranch);
        log.info("已更新分支完成进度: {branch}", activeBranch);

        // 只写当前委托对应的单个文件，避免一次保存把整个 BRANCHES_DIR 都覆盖
        writeBranchConfig(commissionName, commissionConfig);
        log.info("分支配置文件已更新: {name}.json", commissionName);
    } catch (error) {
        if (isCancellationError(error)) { throw error; }
        log.error("更新分支完成进度时出错: {error}", error.message);
    }
}

/**
 * 执行委托追踪（遍历+重试）
 *
 * 遍历识别到的委托列表，按类型（NPC/Basic）执行对应流程
 * 每个委托支持重试机制，执行完成后检查状态
 *
 * @param {Object} stepRegistry - 步骤处理器注册表
 * @returns {Promise<boolean>} 是否有委托执行成功
 */
export async function executeCommissionTracking(stepRegistry) {
    try {
        log.info("开始执行委托追踪");
        await genshin.returnMainUi();

        let commissions = [];
        let completedCount = 0;

        try {
            const commissionsData = JSON.parse(file.readTextSync(PATHS.COMMISSIONS_DATA));
            if (Array.isArray(commissionsData?.commissions)) {
                commissions = commissionsData.commissions.filter((c) => c.supported && c.status === COMMISSION_STATUS.UNCOMPLETED);
                const completedCommissions = commissionsData.commissions.filter((c) => c.status === COMMISSION_STATUS.COMPLETED);
                completedCount = completedCommissions.length;
            } else {
                log.error("委托数据文件格式错误");
                return false;
            }
        } catch (error) {
            log.error("解析委托数据文件失败: {path}, 错误: {error}", PATHS.COMMISSIONS_DATA, error.message);
            return false;
        }

        if (commissions.length === 0) {
            log.info("已完成委托数量: {count}，剩余可执行的委托为空", completedCount);
            return false;
        }

        for (const comm of commissions) {
            log.info("开始执行委托：{name} ({location}) [{type}]", comm.name, comm.location, comm.type);

            const executor = executorMap[comm.type];
            if (!executor) {
                log.warn("未知委托类型 {type}，跳过委托 {name}", comm.type, comm.name);
                continue;
            }

            // tryCount 0 是首次尝试，1..MAX 是重试；总尝试数 = MAX+1
            const totalAttempts = MAX_COMMISSION_RETRY_COUNT + 1;
            let success = false;
            for (let tryCount = 0; tryCount <= MAX_COMMISSION_RETRY_COUNT && !success; tryCount++) {
                log.info("第 {attempt}/{total} 次尝试执行委托 {name}", tryCount + 1, totalAttempts, comm.name);

                const result = await executor(comm, stepRegistry);
                dispatcher.ClearAllTriggers();

                if (result.success) {
                    const completed = await isCompleted(comm.name);
                    if (completed) {
                        success = true;
                        completedCount++;
                        log.info("委托 {name} 执行完成", comm.name);
                        // 给完成型探针（type: "completion" 等）一个写 branchConditionMet 的机会
                        // 必须在 updateBranchCompletion 之前，否则进度永远不会被写入 completed
                        dispatchOnCommissionComplete(result.context);
                        await updateBranchCompletion(comm.name, result.context);
                    } else {
                        log.warn("委托 {name} 执行后检查未完成（第 {attempt}/{total} 次）", comm.name, tryCount + 1, totalAttempts);
                    }
                } else {
                    log.warn("委托 {name} 执行失败（第 {attempt}/{total} 次）", comm.name, tryCount + 1, totalAttempts);
                }

                if (!success && tryCount < MAX_COMMISSION_RETRY_COUNT) {
                    await sleep(1000);
                }
            }

            if (!success) {
                log.warn("委托 {name} 共 {total} 次尝试后仍未完成，跳过该委托", comm.name, totalAttempts);
            } else {
                log.info("委托 {name} 执行成功", comm.name);
            }
            await sleep(1);
        }

        log.info("委托追踪全部执行完成，共执行 {count}/{total} 个委托", completedCount, commissions.length);
        return completedCount > 0;
    } catch (error) {
        if (isCancellationError(error)) { throw error; }
        log.error("执行委托追踪时出错: {error}", error.message);
        return false;
    }
}
