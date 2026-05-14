/**
 * 获取分支的描述名称
 * 如果 descriptions 中存在该分支的描述，返回描述值；否则返回分支 key
 * 
 * @param {Object} descriptions - 分支描述对象
 * @param {string} branchKey - 分支标识
 * @returns {string} 分支描述名称
 */
function getBranchName(descriptions, branchKey) {
    if (descriptions && descriptions[branchKey]) {
        return descriptions[branchKey];
    }
    return branchKey;
}

/**
 * 用户分支选择步骤处理器
 * 根据用户配置文件选择并执行对应的分支步骤
 * 
 * 支持同一 process 中多个分支选择 step 共享配置，
 * 只在第一次时读取配置文件，后续从 context 缓存中获取
 * 
 * default 优先级逻辑：
 * 1. 优先使用用户配置文件中的 default（commissionConfig.default）
 * 2. 其次使用 step 定义中的 default（step.default）
 * 
 * 分支选择逻辑：
 * 1. 如果 selected 为空，使用 default
 * 2. 如果 selected 中的分支都已完成，使用 default
 * 3. 否则，选择 selected 中第一个未完成的分支
 */
import { PATHS } from "../config/index.js";

export function register(registry) {
    registry.register("用户分支选择", async function(step, context) {
        try {
            // 1. 读取或获取缓存的配置文件
            let config;
            if (context.branchConfigCache) {
                // 已有缓存，直接使用
                config = context.branchConfigCache;
                log.debug("使用缓存的分支配置");
            } else {
                // 首次读取，加载并缓存
                const configPath = PATHS.CONFIG_BASE + "/commission-branches.json";
                try {
                    const configContent = file.readTextSync(configPath);
                    config = JSON.parse(configContent);
                    context.branchConfigCache = config; // 缓存到 context
                    log.info("已加载分支配置文件并缓存");
                } catch (error) {
                    log.warn("读取分支配置文件失败，使用空配置: {error}", error.message);
                    config = {};
                    context.branchConfigCache = config;
                }
            }
      
            // 2. 查找当前委托配置
            const commissionConfig = config[context.commissionName];
            const descriptions = commissionConfig ? commissionConfig.descriptions : {};
      
            // 3. 获取默认分支（用户配置优先，step 定义次之）
            let defaultBranch = null;
      
            // 先查找用户配置的 default
            if (commissionConfig && commissionConfig.default) {
                defaultBranch = commissionConfig.default;
                const branchName = getBranchName(descriptions, defaultBranch);
                log.debug("使用用户配置的默认分支: {branch}", branchName);
            } 
            // 再查找 step 定义的 default
            else if (step.default) {
                defaultBranch = step.default;
                const branchName = getBranchName(descriptions, defaultBranch);
                log.debug("使用step定义的默认分支: {branch}", branchName);
            }
      
            if (!defaultBranch) {
                log.warn("未设置默认分支（用户配置和step均未设置）");
            }
      
            // 4. 确定要执行的分支
            let selectedBranches = [];
            let completed = [];
      
            if (commissionConfig) {
                selectedBranches = commissionConfig.selected || [];
                completed = commissionConfig.completed || [];
            }
      
            // 确保 selected 是数组
            if (!Array.isArray(selectedBranches)) {
                selectedBranches = [selectedBranches];
            }
      
            // 过滤出未完成的分支
            const unfinishedBranches = selectedBranches.filter(
                branch => !completed.includes(branch)
            );
      
            // 确定最终要执行的分支
            let branchToExecute;
            if (unfinishedBranches.length === 0) {
                // selected 为空或已全部完成，使用默认分支
                if (defaultBranch) {
                    branchToExecute = defaultBranch;
                    const branchName = getBranchName(descriptions, defaultBranch);
                    log.info("selected为空或已全部完成，使用默认分支: {branch}", branchName);
                } else {
                    log.warn("未设置默认分支，跳过");
                    return;
                }
            } else {
                // 选择第一个未完成的分支
                branchToExecute = unfinishedBranches[0];
                const branchName = getBranchName(descriptions, branchToExecute);
                log.info("选择第一个未完成的分支: {branch}", branchName);
            }
      
            // 5. 执行分支的 step
            const branchStep = step.data[branchToExecute];
            if (!branchStep) {
                const branchName = getBranchName(descriptions, branchToExecute);
                log.warn("未找到分支 {branch} 的step定义", branchName);
                return;
            }
      
            const branchName = getBranchName(descriptions, branchToExecute);
            log.info("执行用户选择的分支: {branch}", branchName);
            await context.stepRegistry.process(branchStep, context);
      
            // 记录当前执行的分支到context中，用于委托完成时更新进度
            if (!context.executedBranches) {
                context.executedBranches = [];
            }
            context.executedBranches.push(branchToExecute);
      
        } catch (error) {
            log.error("执行用户分支选择步骤时出错: {error}", error.message);
        }
    });
}
