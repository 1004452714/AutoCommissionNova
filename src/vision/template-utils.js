/**
 * 模板匹配工具
 * 封装 Mat + BvPage 混合的模板匹配操作
 */
import { PATHS, THRESHOLDS } from "../config/index.js";

/**
 * 模板匹配识别（手动截图模式）
 * @param {string} imgPath - 模板图片路径
 * @param {Object} ocrRegion - 搜索区域 { X, Y, WIDTH, HEIGHT }
 * @param {boolean} useMask - 是否使用掩码
 * @returns {Promise<Object>} 匹配结果
 */
export async function easyTemplateMatch(imgPath, ocrRegion, useMask = false) {
  try {
    if (!ocrRegion || typeof ocrRegion !== "object") {
      log.error("TemplateMatch区域参数不能为空且必须是对象");
      return { count: 0 };
    }
    const { X, Y, WIDTH, HEIGHT } = ocrRegion;
    if (typeof X !== "number" || typeof Y !== "number" || typeof WIDTH !== "number" || typeof HEIGHT !== "number") {
      log.error("TemplateMatch区域的X、Y、WIDTH、HEIGHT必须都是数字");
      return { count: 0 };
    }

    const mat = file.readImageMatSync(imgPath);
    try {
      const templateMatchRo = RecognitionObject.TemplateMatch(mat, X, Y, WIDTH, HEIGHT);
      templateMatchRo.UseMask = useMask;
      const captureRegion = captureGameRegion();
      try {
        const results = await captureRegion.findMulti(templateMatchRo);
        return results;
      } finally {
        captureRegion.Dispose();
      }
    } finally {
      mat.Dispose();
    }
  } catch (error) {
    log.error("TemplateMatch识别出错: {error}", error.message);
    return { count: 0 };
  }
}

/**
 * 使用 BvPage + RecognitionObject 进行模板匹配
 * @param {string} imgPath - 模板图片路径
 * @param {Object} [roi] - 搜索区域 { X, Y, WIDTH, HEIGHT }
 * @param {number} [timeout] - 等待超时（毫秒）
 * @returns {Promise<Array>} 匹配结果列表
 */
export async function bvPageTemplateMatch(imgPath, roi, timeout = 3000) {
  const mat = file.ReadImageMatSync(imgPath);
  try {
    let ro = RecognitionObject.TemplateMatch(mat);
    if (roi) {
      ro = RecognitionObject.TemplateMatch(mat, roi.X, roi.Y, roi.WIDTH, roi.HEIGHT);
    }
    const page = new BvPage();
    const locator = page.Locator(ro);
    const results = await locator.TryWaitFor(timeout);
    return Array.from(results);
  } finally {
    mat.Dispose();
  }
}
