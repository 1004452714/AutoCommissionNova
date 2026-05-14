/**
 * 模板匹配识别
 * 
 * 对指定游戏区域进行模板匹配，返回所有匹配结果
 * 自动进行截图、匹配、资源释放的完整流程
 * 
 * @param {string} imgPath - 模板图片路径
 * @param {number} X - 搜索区域 X 坐标
 * @param {number} Y - 搜索区域 Y 坐标
 * @param {number} W - 搜索区域宽度
 * @param {number} H - 搜索区域高度
 * @param {boolean} useMask - 是否使用掩码
 * @returns {Promise<Object>} 匹配结果
 */
export async function templateMatchFindMulti(imgPath, X, Y, W, H, useMask = false) {
  try {
    const mat = file.readImageMatSync(imgPath);
    const cap = captureGameRegion();
    try {
      const Ro = RecognitionObject.TemplateMatch(mat, X, Y, W, H);
      Ro.UseMask = useMask;
      return await cap.findMulti(Ro);
    } finally {
      mat?.Dispose();
      cap?.Dispose();
    }
  } catch (error) {
    log.error("TemplateMatch 识别出错：{error}", error.message);
    return { count: 0 };
  }
}

