/**
 * OCR 识别工具
 * 封装 BvPage 和手动截图两种 OCR 识别方式
 */
import { OCR_REGIONS } from "../config/index.js";

/**
 * 简单 OCR 识别（手动截图模式，适用于需要精确控制区域的场景）
 * @param {Object} ocrRegion - OCR 区域 { X, Y, WIDTH, HEIGHT }
 * @returns {Promise<Object>} OCR 识别结果集合
 */
export async function easyOCR(ocrRegion) {
  try {
    if (!ocrRegion || typeof ocrRegion !== "object") {
      log.error("OCR区域参数不能为空且必须是对象");
      return { count: 0 };
    }
    const { X, Y, WIDTH, HEIGHT } = ocrRegion;
    if (typeof X !== "number" || typeof Y !== "number" || typeof WIDTH !== "number" || typeof HEIGHT !== "number") {
      log.error("OCR区域的X、Y、WIDTH、HEIGHT必须都是数字");
      return { count: 0 };
    }
    if (X < 0 || Y < 0 || WIDTH <= 0 || HEIGHT <= 0) {
      log.error("OCR区域参数必须为正数");
      return { count: 0 };
    }

    const ocrRo = RecognitionObject.Ocr(X, Y, WIDTH, HEIGHT);
    const captureRegion = captureGameRegion();
    try {
      const results = await captureRegion.findMulti(ocrRo);
      log.debug("OCR结果: {results}", Array.from(results).map((r) => r.text));
      return results;
    } finally {
      captureRegion.Dispose();
    }
  } catch (error) {
    log.error("easyOCR识别出错: {error}", error.message);
    return { count: 0 };
  }
}

/**
 * 单个 OCR 识别（返回第一个结果的文本）
 * @param {Object} ocrRegion - OCR 区域
 * @returns {Promise<string>} 识别到的文本
 */
export async function easyOCROne(ocrRegion) {
  const results = await easyOCR(ocrRegion);
  if (results.count > 0) {
    return results[0].text.trim();
  }
  return "";
}

/**
 * 使用 BvPage 进行区域 OCR 识别
 * @param {Object} rect - 区域 { X, Y, WIDTH, HEIGHT }（可选，默认全屏）
 * @returns {Array} OCR 结果列表
 */
export function bvPageOcr(rect) {
  const page = new BvPage();
  if (rect) {
    return page.Ocr(new Rect(rect.X, rect.Y, rect.WIDTH, rect.HEIGHT));
  }
  return page.Ocr();
}
