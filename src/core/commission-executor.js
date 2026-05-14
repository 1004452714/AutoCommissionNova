/**
        * 委托执行调度模块
        * 遍历委托列表，按类型调度执行，支持重试
        *
        * 执行流程：
        * 1. 加载委托数据文件
        * 2. 预统计已完成数量（用于后续完成状态判断）
        * 3. 遍历委托列表，过滤已完成、缺少地点、不支持的委托
        * 4. 按委托类型（NPC/Basic）执行对应流程
        * 5. 执行后检查完成状态，支持重试机制
        */
import { COMMISSION_TYPE, MAX_COMMISSION_RETRY_COUNT, PATHS } from "../config/index.js";
import { isCompleted } from "../recognition/index.js";
import { executeNpcCommission } from "./npc-executor.js";
import { executeBasicCommission } from "./basic-executor.js";

/**
        * 更新分支完成进度
        * 当委托任务成功完成时调用
        *
        * @param {string} commissionName - 委托名称
        * @param {Object} context - 执行上下文（包含 branchConfigCache 和 executedBranches）
        */
async function updateBranchCompletion(commissionName, context) {
        try {
                // 从缓存中获取配置（如果有的话）
                const config = context.branchConfigCache;
                if (!config) {
                        return; // 没有缓存配置，说明没有使用分支选择
                }

                const commissionConfig = config[commissionName];
                if (!commissionConfig) {
                        return; // 没有配置该委托的分支信息
                }

                // 初始化 completed 数组
                if (!commissionConfig.completed) {
                        commissionConfig.completed = [];
                }

                // 获取本次执行的分支列表
                const executedBranches = context.executedBranches || [];

                // 更新完成进度
                let hasUpdate = false;
                for (const branch of executedBranches) {
                        if (!commissionConfig.completed.includes(branch)) {
                                commissionConfig.completed.push(branch);
                                hasUpdate = true;
                                log.info("已更新分支完成进度: {branch}", branch);
                        }
                }

                // 如果有更新，保存配置文件
                if (hasUpdate) {
                        const configPath = PATHS.CONFIG_BASE + "/commission-branches.json";
                        file.writeTextSync(configPath, JSON.stringify(config, null, 2));
                        log.info("分支配置文件已更新");
                }
        } catch (error) {
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

                // 加载委托数据
                let commissions = [];
                let completedCount = 0;

                const commissionsData = JSON.parse(file.readTextSync(PATHS.COMMISSIONS_DATA));
                if (Array.isArray(commissionsData?.commissions)) {
                        // 过滤条件：支持的委托 + 非未知地点 + 未完成
                        commissions = commissionsData.commissions.filter((c) => c.supported && c.location !== '未知地点' && c.location !== '已完成');
                        // 统计已完成的委托数量
                        const completedCommissions = commissionsData.commissions.filter((c) => c.location === '已完成');
                        completedCount = completedCommissions.length;
                } else {
                        log.error("委托数据文件格式错误");
                        return false;
                }

                if (commissions.length === 0) {
                        log.info("已完成委托数量: {count}，剩余可执行的委托为空", completedCount);
                        return false;
                }

                // 遍历执行每个委托
                for (const comm of commissions) {
                        log.info("开始执行委托：{name} ({location}) [{type}]", comm.name, comm.location, comm.type);


                        for (let tryCount = 0, success = false;
                                tryCount <= MAX_COMMISSION_RETRY_COUNT && !success;
                                tryCount++) {
                                log.info("第 {try} 次尝试执行委托 {name} ", tryCount, comm.name);


                                // 按类型执行
                                if (comm.type === COMMISSION_TYPE.NPC) {
                                        const npcResult = await executeNpcCommission(comm.name, comm.location, stepRegistry);
                                        dispatcher.ClearAllTriggers();
                                        if (npcResult.success) {
                                                const completed = await isCompleted(comm.name);
                                                if (completed) {
                                                        success = true;
                                                        completedCount++;
                                                        log.info("NPC委托 {name} 执行完成", comm.name);
                                                        // 更新分支完成进度
                                                        await updateBranchCompletion(comm.name, npcResult.context);
                                                }
                                                else { log.warn("NPC委托 {name} 执行后检查未完成，重试次数: {try}/{max}", comm.name, tryCount, MAX_COMMISSION_RETRY_COUNT); }
                                        } else {
                                                log.warn("NPC委托 {name} 执行失败，重试次数: {try}/{max}", comm.name, tryCount, MAX_COMMISSION_RETRY_COUNT);
                                        }
                                }
                                else if (comm.type === COMMISSION_TYPE.BASIC) {
                                        const basicSuccess = await executeBasicCommission(comm, stepRegistry);
                                        if (basicSuccess) {
                                                const completed = await isCompleted(comm.name);
                                                if (completed) { success = true; completedCount++; log.info("委托 {name} 已完成", comm.name); }
                                                else { log.info("委托 {name} 未完成", comm.name); }
                                        } else {
                                                log.warn("Basic委托 {name} 执行失败，重试次数: {try}/{max}", comm.name, tryCount, MAX_COMMISSION_RETRY_COUNT);
                                        }
                                }

                                if (!success && tryCount < MAX_COMMISSION_RETRY_COUNT) {
                                        await sleep(1000);
                                }
                        }

                        if (!success) {
                                log.warn("委托 {name} 重试 {try} 次后仍未完成，跳过该委托", comm.name, MAX_COMMISSION_RETRY_COUNT);
                        } else {
                                log.info("委托 {name} 执行成功", comm.name);
                        }
                }

                log.info("委托追踪全部执行完成，共执行 {count}/{total} 个委托", completedCount, commissions.length);
                return completedCount > 0;
        } catch (error) {
                log.error("执行委托追踪时出错: {error}", error.message);
                return false;
        }
}
