/**
 * 用户分支选择步骤处理器
 * 根据用户配置文件选择并执行对应的分支步骤
 * 
 * 支持同一 process 中多个分支选择 step 共享配置，
 * 只在第一次时读取配置文件，后续从 context 缓存中获取
 * 
 * 分支选择逻辑：
 * 1. 如果 selected 为空，使用 step.default
 * 2. 如果 selected 中的分支都已完成，使用 step.default
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
      
      // 2. 获取默认分支（从 step 定义中读取）
      const defaultBranch = step.default;
      if (!defaultBranch) {
        log.warn("用户分支选择步骤未设置 default 字段");
      }
      
      // 3. 查找当前委托配置
      const commissionConfig = config[context.commissionName];
      
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
          log.info("selected为空或已全部完成，使用默认分支: {branch}", defaultBranch);
        } else {
          log.warn("未设置默认分支，跳过");
          return;
        }
      } else {
        // 选择第一个未完成的分支
        branchToExecute = unfinishedBranches[0];
        log.info("选择第一个未完成的分支: {branch}", branchToExecute);
      }
      
      // 5. 执行分支的 step
      const branchStep = step.data[branchToExecute];
      if (!branchStep) {
        log.warn("未找到分支 {branch} 的step定义", branchToExecute);
        return;
      }
      
      log.info("执行用户选择的分支: {branch}", branchToExecute);
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
