/**
 * OCR 识别工具
 * 封装 BvPage 和手动截图两种 OCR 识别方式
 */
import { OCR_REGIONS } from "../config/index.js";

/**
 * OCR区域识别（手动截图模式，适用于需要精确控制区域的场景）
 * 
 * 对指定游戏区域进行OCR识别，返回所有识别到的文本结果
 * 自动进行截图、识别、资源释放的完整流程
 * 
 * @param {Object} ocrRegion - OCR 区域 { X, Y, WIDTH, HEIGHT }
 * @returns {Promise<Object>} OCR 识别结果集合
 * 
 * @example
 * const results = await ocrCaptureRegion({ X: 100, Y: 200, WIDTH: 300, HEIGHT: 50 });
 * for (let i = 0; i < results.count; i++) {
 *   console.log(results[i].text);
 * }
 */
export async function ocrCaptureRegion(ocrRegion) {
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
    log.error("OCR区域识别出错: {error}", error.message);
    return { count: 0 };
  }
}

/**
 * OCR区域识别（返回第一个结果的文本）
 * 
 * 对指定游戏区域进行OCR识别，仅返回第一个识别到的文本
 * 适用于只需要单个文本结果的场景
 * 
 * @param {Object} ocrRegion - OCR 区域 { X, Y, WIDTH, HEIGHT }
 * @returns {Promise<string>} 识别到的文本，未识别到返回空字符串
 * 
 * @example
 * const text = await ocrCaptureRegionText(OCR_REGIONS.LOCATION);
 * console.log("识别结果:", text);
 */
export async function ocrCaptureRegionText(ocrRegion) {
  const results = await ocrCaptureRegion(ocrRegion);
  if (results.count > 0) {
    return results[0].text.trim();
  }
  return "";
}

/**
 * BvPage区域OCR识别
 * 
 * 使用BvPage进行区域OCR识别，支持指定区域或全屏
 * 适用于需要高性能OCR识别的场景
 * 
 * @param {Object} rect - 区域 { X, Y, WIDTH, HEIGHT }（可选，默认全屏）
 * @returns {Array} OCR 结果列表
 * 
 * @example
 * // 识别指定区域
 * const results = bvPageOcrRegion({ X: 100, Y: 200, WIDTH: 300, HEIGHT: 50 });
 * 
 * @example
 * // 全屏识别
 * const results = bvPageOcrRegion();
 */
export function bvPageOcrRegion(rect) {
  const page = new BvPage();
  if (rect) {
    return page.Ocr(new Rect(rect.X, rect.Y, rect.WIDTH, rect.HEIGHT));
  }
  return page.Ocr();
}
