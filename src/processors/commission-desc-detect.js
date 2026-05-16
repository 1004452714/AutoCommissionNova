/**
 * 委托描述检测步骤处理器
 */
import { OCR_REGIONS, THRESHOLDS } from "../config/index.js";
import { bvPageOcrRegionText } from "../vision/index.js";
import { loadNpcProcessFile } from "../loaders/index.js";
import { defineStep } from "./define-step.js";
import { standardizeCommissionName } from "../recognition/commission-standardizer.js";
import { calculateSimilarity } from "../recognition/text-similarity.js";
import { cleanText } from "../utils/text-utils.js";

/**
 * 比较 OCR 识别的描述文本与期望描述
 * 先用 cleanText 去掉空白与标点，再用编辑距离判断相似度
 * @param {string} ocrText - OCR 原始识别文本
 * @param {string} expected - 期望描述（用户配置）
 * @param {boolean} useKeyword - true 表示关键字子串匹配（清理后的子串包含），false 表示整段相似度匹配
 * @returns {boolean}
 */
function matchesDescription(ocrText, expected, useKeyword) {
    const cleanedOcr = cleanText(ocrText);
    const cleanedExpected = cleanText(expected);
    if (!cleanedExpected) return false;
    if (useKeyword) {
        return cleanedOcr.includes(cleanedExpected);
    }
    return calculateSimilarity(cleanedOcr, cleanedExpected) >= THRESHOLDS.COMMISSION_DESC;
}

export default defineStep({
    type: "委托描述检测",
    run: async (step, context) => {
        try {
            log.info("执行委托描述检测");

            let targetDescription = "";
            let executeFile = step.run || "";
            let runType = "process";
            let useKeyword = false;

            if (typeof step.data === "string") {
                targetDescription = step.data;
            } else if (typeof step.data === "object") {
                targetDescription = step.data.description || step.data.keyword || "";
                executeFile = step.data.executeFile || executeFile;
                runType = step.data.runType || "process";
                useKeyword = step.data.useKeyword || false;
            }

            if (!targetDescription || !executeFile) {
                log.error("描述文本 与 json文件 为必填项！");
                return;
            }

            log.info("委托描述检测: {description}", targetDescription);
            keyPress("v");
            await sleep(300);

            for (let c = 0; c < 13; c++) {
                try {
                    const ocrResult = bvPageOcrRegionText(OCR_REGIONS.COMMISSION_DETAIL);
                    // OCR 可能识别出与委托名一致（说明详情还没刷新出来）或空文本 → 继续等
                    // 使用标准化后比较，容忍 OCR 抖动
                    if (ocrResult === "" || standardizeCommissionName(ocrResult) === context.commissionName) {
                        await sleep(1000);
                        log.debug("检测到委托名称或空文本，继续等待...");
                    } else if (matchesDescription(ocrResult, targetDescription, useKeyword)) {
                        log.info("委托描述检测成功，执行后续步骤");
                        if (executeFile && runType === "process") {
                            const nextSteps = await loadNpcProcessFile(context.commissionName, context.location, executeFile);
                            if (nextSteps && Array.isArray(nextSteps)) {
                                context.processSteps.splice(context.currentIndex + 1, 0, ...nextSteps);
                                log.info("已插入 {count} 个后续步骤", nextSteps.length);
                            }
                        } else if (executeFile && runType === "path") {
                            const filePath = context.resolveResource(executeFile);
                            try { await pathingScript.runFile(filePath); }
                            catch (error) { log.warn("未找到地图追踪文件: {path}", filePath); return false; }
                        }
                        break;
                    } else {
                        log.warn("委托描述不匹配,识别：{actual},期望：{expected}", ocrResult, targetDescription);
                        break;
                    }
                } catch (ocrError) {
                    log.error("委托描述OCR识别出错: {error}", ocrError.message);
                    break;
                }
            }
        } catch (error) {
            log.error("执行委托描述检测步骤时出错: {error}", error.message);
            throw error;
        }
    },
});
