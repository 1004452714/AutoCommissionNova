/**
 * 地图追踪步骤处理器
 * 路径通过 context.resolveResource 解析，自动适配 NPC / Basic 委托
 */
export default {
    type: "地图追踪",
    handler: async function(step, context) {
        const scriptName = step.data || step;
        const fullPath = context.resolveResource(scriptName);

        log.info("执行地图追踪: {path}", fullPath);
        try {
            await pathingScript.runFile(fullPath);
            log.info("地图追踪执行完成");
        } catch (error) {
            log.error("执行地图追踪时出错: {error}", error.message);
            throw error;
        }
    },
};
