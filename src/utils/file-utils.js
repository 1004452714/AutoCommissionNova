/**
 * 文件工具模块
 * 提供文件扫描、路径处理等通用文件操作
 */

/**
 * 转义正则表达式特殊字符
 * @param {string} string - 需要转义的字符串
 * @returns {string} 转义后的字符串
 */
function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * 扫描指定委托和地点的脚本文件
 * @param {string} basePath - 基础路径 (如 assets/)
 * @param {string} commissionName - 委托名称
 * @param {string} location - 地点名称
 * @returns {string[]} 按序号排序的脚本文件路径列表
 */
export function scanCommissionScripts(basePath, commissionName, location) {
  const scripts = [];
  const dirPath = `${basePath}/${commissionName}`;

  try {
    const items = Array.from(file.readPathSync(dirPath));
    const pattern = new RegExp(`^${escapeRegExp(location)}-(\\d+)\\.json$`);

    for (const item of items) {
      if (item.endsWith('.json')) {
        const fileName = item.split('/').pop().split('\\').pop();
        const match = fileName.match(pattern);
        if (match) {
          scripts.push({
            path: item,
            index: parseInt(match[1], 10)
          });
        }
      }
    }

    scripts.sort((a, b) => a.index - b.index);
    return scripts.map(s => s.path);
  } catch (error) {
    log.warn("扫描委托脚本目录失败: {error}", error.message);
    return [];
  }
}
