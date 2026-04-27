/**
 * 传送步骤处理器
 * 支持的数据格式: {x, y, force?}
 *   - x: number (浮点数) - 目标X坐标
 *   - y: number (浮点数) - 目标Y坐标
 *   - force: boolean - 是否强制传送，默认 false，可选
 */
export function register(registry) {
  const handler = async function(step, context) {
    log.info("执行传送操作");

    // 验证数据格式必须为对象
    if (!step.data || typeof step.data !== 'object' || Array.isArray(step.data)) {
      log.error("传送步骤必须使用对象格式: {x, y, force?}");
      return;
    }

    const x = step.data.x;
    const y = step.data.y;
    const force = step.data.force ?? false;

    // 类型校验
    if (typeof x !== 'number' || typeof y !== 'number') {
      log.error("传送坐标 x 和 y 必须是数字类型");
      return;
    }

    if (typeof force !== 'boolean') {
      log.error("传送参数 force 必须是布尔类型");
      return;
    }

    log.info("传送到坐标: ({x}, {y}), 强制: {force}", x, y, force);
    await genshin.tp(x, y, force);
    log.info("传送完成");
    await sleep(2000);
  };

  registry.register("tp", handler);
  registry.register("传送", handler);
}
