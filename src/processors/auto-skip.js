/**
 * AutoSkip + 对话步骤处理器
 * AutoSkip 处理剧情跳过，对话使用 DialogProcessor 处理 NPC 对话
 */
import { PATHS } from "../config/index.js";
import { isInMainUI } from "../vision/ui-detector.js";
import { executeOptimizedAutoTalk } from "../dialog/dialog-processor.js";

export function register(registry) {
  registry.register("AutoSkip", async function(step, context) {
    await executeAutoSkipLogic(step.data || {}, "AutoSkip");
  });

  registry.register("对话", async function(step, context) {
    await executeDialogStep(step, context);
  });
}

/**
 * 执行对话步骤（使用 DialogProcessor）
 * 优先使用步骤数据中的配置，回退到上下文中的配置
 */
async function executeDialogStep(step, context) {
  try {
    log.info("执行对话步骤");
    let priorityOptions = context.priorityOptions || [];
    let npcWhiteList = context.npcWhiteList || [];

    if (step.data && typeof step.data === "object") {
      if (Array.isArray(step.data.priorityOptions)) {
        priorityOptions = step.data.priorityOptions;
      }
      if (Array.isArray(step.data.npcWhiteList)) {
        npcWhiteList = step.data.npcWhiteList;
      }
      if (typeof step.data.skipCount === "number") {
        log.debug("对话步骤包含 skipCount 参数: {count}，已忽略（新版使用自动检测）", step.data.skipCount);
      }
    }

    await executeOptimizedAutoTalk({
      priorityOptions: priorityOptions,
      npcWhiteList: npcWhiteList,
    });
  } catch (error) {
    log.error("执行对话步骤时出错: {error}", error.message);
    throw error;
  }
}

/**
 * 执行 AutoSkip 剧情跳过逻辑
 */
async function executeAutoSkipLogic(stepData, stepName) {
  try {
    log.info("执行{stepName}步骤", stepName);
    const customPriorityOptions = stepData.priorityOptions || [];
    const customBlacklist = stepData.blacklist || [];
    const customPriorityIcons = stepData.priorityIcons || [];
    const customNpcWhiteList = stepData.npcWhiteList || [];

    const storyMat = file.ReadImageMatSync(PATHS.DISABLED_UI_IMAGE);
    try {
      const StoryRo = RecognitionObject.TemplateMatch(storyMat, 265, 37, 30, 22);

      const mergedPriorityOptions = customNpcWhiteList.concat(customPriorityOptions);
      const effectivePriorityOptions = mergedPriorityOptions;
      const effectiveBlacklist = customBlacklist;

      const priorityIconROs = [];
      for (const iconName of customPriorityIcons) {
        try {
          const iconMat = file.ReadImageMatSync("Data/RecognitionObject/" + iconName);
          if (iconMat) {
            const ro = RecognitionObject.TemplateMatch(iconMat);
            priorityIconROs.push(ro);
          }
        } catch (error) {
          log.warn("无法加载优先图标 {iconName}: {error}", iconName, error.message);
        }
      }

      await sleep(1000);
      let maxAttempts = 1200;
      let attempts = 0;
      let SkipTime = 100;
      let storyIconDetectedOnce = false;

      while (attempts < maxAttempts) {
        const StoryResult = await recognizeImage(StoryRo);
        if (storyIconDetectedOnce) {
          if (!StoryResult.success) { log.info("剧情图标消失，结束AutoSkip"); return; }
        } else {
          if (StoryResult.success) { storyIconDetectedOnce = true; log.info("检测到剧情图标首次出现，启用图标检测机制"); }
        }
        attempts++;
        const startTime = Date.now();
        while (Date.now() - startTime < 1000) { keyPress("VK_SPACE"); await sleep(SkipTime); }

        const fIconMat = file.ReadImageMatSync(PATHS.F_ICON_IMAGE);
        try {
          const fIconRO = RecognitionObject.TemplateMatch(fIconMat, 1207, 0, 43, 850);
          let fIconFound = false;
          let fIconY = 0;
          const fIconResult = await recognizeImage(fIconRO);
          if (fIconResult.success) { fIconFound = true; fIconY = fIconResult.y; }

          let priorityIconClicked = false;
          if (fIconFound) {
            for (const iconRO of priorityIconROs) {
              const iconResult = await recognizeImage(iconRO);
              if (iconResult.success) {
                log.info("找到优先图标点击");
                click(iconResult.x, iconResult.y);
                priorityIconClicked = true;
                break;
              }
            }
          }

          if (fIconFound && !priorityIconClicked) {
            const ocrStartY = fIconY + 10;
            const ocrHeight = 850 - ocrStartY;
            if (ocrHeight > 0) {
              const captureRegion = captureGameRegion();
              try {
                const dialogArea = captureRegion.DeriveCrop(1250, ocrStartY, 550, ocrHeight);
                try {
                  const ocrRo = RecognitionObject.Ocr(0, 0, dialogArea.width, dialogArea.height);
                  const ocrResults = dialogArea.FindMulti(ocrRo);
                  if (ocrResults && ocrResults.count > 0) {
                    let foundValidOption = false;
                    let firstNonBlacklistOption = null;
                    for (let i = 0; i < ocrResults.count; i++) {
                      const ocrText = ocrResults[i].text;
                      log.debug("选项 {index}: {text}", i + 1, ocrText);
                      for (const priorityOption of effectivePriorityOptions) {
                        if (ocrText.includes(priorityOption)) {
                          log.info("找到优先选项: {option}，点击该选项", priorityOption);
                          ocrResults[i].click();
                          foundValidOption = true;
                          break;
                        }
                      }
                      if (foundValidOption) break;
                      if (!firstNonBlacklistOption) {
                        let isBlacklisted = false;
                        for (const blackOption of effectiveBlacklist) {
                          if (ocrText.includes(blackOption)) { isBlacklisted = true; break; }
                        }
                        if (!isBlacklisted) firstNonBlacklistOption = ocrResults[i];
                      }
                    }
                    if (!foundValidOption && firstNonBlacklistOption) { firstNonBlacklistOption.click(); foundValidOption = true; }
                    if (!foundValidOption) keyPress("F");
                  } else { keyPress("F"); }
                } finally {
                  dialogArea.Dispose();
                }
              } finally {
                captureRegion.Dispose();
              }
            }
          }
        } finally {
          fIconMat.Dispose();
        }
      }
    } finally {
      storyMat.Dispose();
    }
    log.info("{stepName}步骤执行完成", stepName);
  } catch (error) {
    log.error("执行{stepName}步骤时出错: {error}", stepName, error.message);
    throw error;
  }
}

async function recognizeImage(recognitionObject) {
  try {
    const captureRegion = captureGameRegion();
    try {
      const imageResult = captureRegion.find(recognitionObject);
      if (imageResult && imageResult.x !== 0 && imageResult.y !== 0 && imageResult.width !== 0 && imageResult.height !== 0) {
        return { success: true, x: imageResult.x, y: imageResult.y };
      }
    } finally {
      captureRegion.Dispose();
    }
  } catch (error) {
    log.error("识别图像时发生异常: {error}", error.message);
  }
  return { success: false };
}
