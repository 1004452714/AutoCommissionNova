/**
 * 委托描述检测步骤处理器
 */
import { OCR_REGIONS } from "../config/index.js";
import { bvPageOcrRegionText } from "../vision/index.js";
import { loadNpcProcessFile } from "../loaders/index.js";

export function register(registry) {
    registry.register("委托描述检测", async function(step, context) {
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
                    if (ocrResult === context.commissionName || ocrResult === "") {
                        await sleep(1000);
                        log.debug("检测到委托名称或空文本，继续等待...");
                    } else if ((!useKeyword && ocrResult === targetDescription) || (useKeyword && ocrResult.includes(targetDescription))) {
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
    });
}
