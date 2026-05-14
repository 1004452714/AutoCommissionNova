/**
 * AutoSkip + 对话步骤处理器
 * AutoSkip 处理剧情跳过，对话使用 DialogProcessor 处理 NPC 对话
 */
import { PATHS, UI_REGIONS, DIALOG_REGIONS } from "../config/index.js";
import { isInMainUI } from "../vision/ui-detector.js";
import { bvPageOcrRegion, templateMatchFindMulti } from "../vision/index.js";
import { extractName } from "../utils/text-utils.js";

export function register(registry) {
  registry.register("AutoSkip", async function(step, context) {
    await executeAutoSkipLogic(step.data || {}, "AutoSkip");
  });

  registry.register("对话", async function(step, context) {
    await executeDialogStep(step, context);
  });
}

/**
 * 执行优化的自动对话
 * 
 * 自动处理对话流程：识别NPC、选择对话选项、跳过剧情
 * 
 * @param {Object} options - 配置选项
 * @param {string[]} [options.priorityOptions] - 优先对话选项
 * @param {string[]} [options.npcWhiteList] - NPC 白名单
 */
async function executeOptimizedAutoTalk(options) {
  const priorityOptions = (options && options.priorityOptions) || [];
  const npcWhiteList = (options && options.npcWhiteList) || [];
  keyPress("V");

  let extractedName = null;
  const nameResults = bvPageOcrRegion(DIALOG_REGIONS.NPC_NAME);
  for (let i = 0; i < nameResults.count; i++) {
    const text = nameResults[i].text;
    log.info("任务区域识别文本: {text}", text);
    const name = extractName(text);
    if (name) {
      extractedName = name;
      log.info("提取到人名: {name}", extractedName);
      break;
    }
  }

  const dialogResults = bvPageOcrRegion(DIALOG_REGIONS.DIALOG_OPTIONS);
  const talkIconRegion = DIALOG_REGIONS.TALK_ICON;
  let clickedWhitelistNPC = false;
  let clickedExtractedName = false;

  if (dialogResults.count > 0) {
    for (let i = 0; i < dialogResults.count; i++) {
      const text = dialogResults[i].text;
      const res = dialogResults[i];
      for (let j = 0; j < npcWhiteList.length; j++) {
        if (text.includes(npcWhiteList[j])) {
          log.info("找到白名单NPC: {npc}，点击该NPC", npcWhiteList[j]);
          keyDown("VK_MENU");
          await sleep(500);
          click(res.x, res.y);
          leftButtonClick();
          keyUp("VK_MENU");
          await sleep(200);
          if (!isInMainUI()) { clickedWhitelistNPC = true; break; }
        }
      }
    }

    if (!clickedWhitelistNPC && extractedName) {
      for (let i = 0; i < dialogResults.count; i++) {
        const text = dialogResults[i].text;
        const res = dialogResults[i];
        if (text.includes(extractedName)) {
          log.info("点击包含提取到任务人名的选项: {text}", text);
          keyDown("VK_MENU");
          await sleep(500);
          click(res.x, res.y);
          leftButtonClick();
          keyUp("VK_MENU");
          await sleep(200);
          if (!isInMainUI()) { clickedExtractedName = true; break; }
        }
      }
    }
  }

  if (!clickedWhitelistNPC && !clickedExtractedName) {
    log.info("未找到匹配的NPC，使用默认触发方式");
    keyPress("F");
    await sleep(100);
    keyPress("F");
    await sleep(400);
  }

  const maxAttempts = 100;
  let attempts = 0;
  await sleep(1000);
  log.info("开始执行自动剧情");

  while (!isInMainUI() && attempts < maxAttempts) {
    attempts++;
    const startTime = Date.now();
    while (Date.now() - startTime < 1000) {
      keyPress("VK_SPACE");
      await sleep(200);
    }
    if (isInMainUI()) { log.info("检测到已返回主界面，结束循环"); break; }

    let foundPriorityOption = false;
    const ocrResults = bvPageOcrRegion(DIALOG_REGIONS.DIALOG_OPTIONS_OCR);
    if (ocrResults.count > 0) {
      for (let i = 0; i < ocrResults.count; i++) {
        const ocrText = ocrResults[i].text;
        for (let j = 0; j < priorityOptions.length; j++) {
          if (ocrText.includes(priorityOptions[j])) {
            log.info("找到优先选项: {option}，点击该选项", priorityOptions[j]);
            ocrResults[i].click();
            await sleep(500);
            foundPriorityOption = true;
            break;
          }
        }
        if (foundPriorityOption) break;
      }

      if (!foundPriorityOption && !isInMainUI()) {
        const exitList = await templateMatchFindMulti(PATHS.TALK_EXIT_IMAGE, ...talkIconRegion, true);
        const iconList = await templateMatchFindMulti(PATHS.TALK_ICON_IMAGE, ...talkIconRegion);
        let clickXY = null;

        if (exitList.count === 1) {
          log.info("发现一个退出对话选项");
          clickXY = [exitList[0].x, exitList[0].y];
        } else if (iconList.count > 0) {
          log.info("发现{count}个气泡对话选项，点击最后一个气泡选项", iconList.count);
          const sorted = Array.from(iconList).sort(function(a, b) { return b.y - a.y; });
          clickXY = [sorted[0].x, sorted[0].y];
        } else if (ocrResults.count > 0) {
          log.info("默认点击最后一个选项");
          clickXY = [ocrResults[ocrResults.count - 1].x, ocrResults[ocrResults.count - 1].y];
        }

        if (clickXY) {
          keyDown("VK_MENU");
          await sleep(300);
          click(clickXY[0], clickXY[1]);
          leftButtonClick();
          keyUp("VK_MENU");
        }
      }
    }

    if (isInMainUI()) { log.info("检测到已返回主界面，结束循环"); break; }
  }

  if (isInMainUI()) {
    log.info("已返回主界面，自动剧情执行完成");
    await sleep(500);
    keyPress("V");
    await sleep(2000);
  } else {
    log.warn("已达到最大尝试次数 {attempts}，但未检测到返回主界面", maxAttempts);
  }
}

/**
 * 执行对话步骤（使用 DialogProcessor）
 * 
 * 从步骤数据中读取 priorityOptions 和 npcWhiteList 配置，执行自动对话
 * 
 * @param {Object} step - 流程步骤
 * @param {Object} context - 执行上下文
 */
async function executeDialogStep(step, context) {
  try {
    log.info("执行对话步骤");
    let priorityOptions = [];
    let npcWhiteList = [];

    if (step.data && typeof step.data === "object") {
      if (Array.isArray(step.data.priorityOptions)) {
        priorityOptions = step.data.priorityOptions;
      }
      if (Array.isArray(step.data.npcWhiteList)) {
        npcWhiteList = step.data.npcWhiteList;
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
 * 
 * 持续按空格跳过剧情，同时检测F图标和优先选项进行智能选择
 * 
 * @param {Object} stepData - 步骤数据
 * @param {string} stepName - 步骤名称
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
      const StoryRo = RecognitionObject.TemplateMatch(storyMat, ...UI_REGIONS.STORY_ICON);

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
          const fIconRO = RecognitionObject.TemplateMatch(fIconMat, ...UI_REGIONS.F_ICON);
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

/**
 * 识别图像（带截图和错误处理）
 * 
 * 在当前游戏画面中识别指定的识别对象
 * 
 * @param {Object} recognitionObject - 识别对象
 * @returns {Promise<{success: boolean, x: number, y: number}>} 识别结果
 */
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
