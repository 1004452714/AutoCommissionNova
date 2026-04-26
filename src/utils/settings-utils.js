/**
 * 设置读取工具
 * 从 BGI settings 全局对象读取用户配置
 */

/**
 * 获取用户设置配置
 * @returns {Promise<Object>} 设置对象
 */
export async function getSetting() {
  try {
    const skipRecognition = settings.skipRecognition || false;
    const prepare = settings.prepare || false;
    const team = settings.team || "";
    const elementTeam = settings.elementTeam || "";
    const result = { skipRecognition, prepare, team, elementTeam };
    log.debug("setting:{index}", result);
    return result;
  } catch (error) {
    log.error("getSetting函数出现错误,将使用默认配置");
    return {
      skipRecognition: false,
      prepare: true,
      team: "",
      elementTeam: "",
    };
  }
}
