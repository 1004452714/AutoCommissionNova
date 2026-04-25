/**
 * 文件工具模块
 * 提供文件扫描、路径处理等通用文件操作
 */

/**
 * 转义正则表达式特殊字符
 * @param {string} string - 需要转义的字符串
 * @returns {string} 转义后的字符串
 */
export function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
