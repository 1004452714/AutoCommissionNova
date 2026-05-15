/**
 * 键鼠脚本步骤处理器
 * 路径通过 context.resolveResource 解析，自动适配 NPC / Basic 委托
 */
export function register(registry) {
    registry.register("键鼠脚本", async function(step, context) {
        log.info("执行键鼠脚本: {path}", step.data);
        const fullPath = context.resolveResource(step.data);
        try {
            await keyMouseScript.runFile(fullPath);
            log.info("键鼠脚本执行完成");
        } catch (error) {
            log.error("执行键鼠脚本时出错: {error}", error.message);
            throw error;
        }
    });
}
