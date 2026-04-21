/**
 * 传送步骤处理器
 */
export function register(registry) {
  const handler = async function(step, context) {
    log.info("执行传送操作");
    if (!step.data || !Array.isArray(step.data) || step.data.length < 2) {
      log.warn("传送步骤缺少有效的坐标数据");
      return;
    }
    const x = step.data[0];
    const y = step.data[1];
    const force = step.data.length > 2 ? step.data[2] : false;
    log.info("传送到坐标: ({x}, {y}), 强制: {force}", x, y, force);
    await genshin.tp(x, y, force);
    log.info("传送完成");
    await sleep(2000);
  };

  registry.register("tp", handler);
  registry.register("传送", handler);
}
