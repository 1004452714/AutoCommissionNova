/**
 * 战斗流程加载器模块
 * 负责加载并解析 process.json 流程文件
 */

/**
 * 加载并解析流程文件
 * @param {string} processPath - 流程文件路径
 * @returns {Promise<Array|false>} 步骤数组，失败返回 false
 */
export async function loadFightProcess(processPath) {
  try {
    const processContent = await file.readText(processPath);
    log.info("加载战斗流程文件: {path}", processPath);
    
    try {
      const jsonData = JSON.parse(processContent);
      if (Array.isArray(jsonData)) {
        log.debug("流程文件解析成功，共 {count} 个步骤", jsonData.length);
        return jsonData;
      }
      log.error("流程文件格式错误，应为数组: {path}", processPath);
      return false;
    } catch (parseError) {
      log.error("流程文件 JSON 解析失败: {path}, 错误: {error}", processPath, parseError.message);
      return false;
    }
  } catch (error) {
    log.warn("未找到流程文件: {path}, 错误: {error}", processPath, error.message);
    return false;
  }
}
