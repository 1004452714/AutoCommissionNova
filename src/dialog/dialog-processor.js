/**
 * 对话处理器模块（BvPage 重写）
 * 自动处理对话流程：识别NPC、选择对话选项、跳过剧情
 */
import { PATHS } from "../config/index.js";
import { ocrCaptureRegion, templateMatchCaptureRegion } from "../vision/index.js";
import { extractName } from "../utils/text-utils.js";
import { isInMainUI } from "../vision/ui-detector.js";

/**
 * 执行优化的自动对话
 * @param {Object} options - 配置选项
 * @param {string[]} [options.priorityOptions] - 优先对话选项
 * @param {string[]} [options.npcWhiteList] - NPC 白名单
 * @param {Function} [options.isInMainUI] - 主界面检测函数引用
 */
export async function executeOptimizedAutoTalk(options) {
  const priorityOptions = (options && options.priorityOptions) || [];
  const npcWhiteList = (options && options.npcWhiteList) || [];
  const checkMainUI = (options && options.isInMainUI) || isInMainUI;

  keyPress("V");

  let extractedName = null;
  const nameRegion = { X: 75, Y: 240, WIDTH: 225, HEIGHT: 60 };
  const nameResults = await ocrCaptureRegion(nameRegion);
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

  const dialogRegion = { X: 1150, Y: 300, WIDTH: 350, HEIGHT: 400 };
  const talkIconRegion = { X: 1260, Y: 300, WIDTH: 90, HEIGHT: 550 };
  const dialogResults = await ocrCaptureRegion(dialogRegion);
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
          if (!checkMainUI()) { clickedWhitelistNPC = true; break; }
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
          if (!checkMainUI()) { clickedExtractedName = true; break; }
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

  while (!checkMainUI() && attempts < maxAttempts) {
    attempts++;
    const startTime = Date.now();
    while (Date.now() - startTime < 1000) {
      keyPress("VK_SPACE");
      await sleep(200);
    }
    if (checkMainUI()) { log.info("检测到已返回主界面，结束循环"); break; }

    let foundPriorityOption = false;
    const dialogOptionsRegion = { X: 1250, Y: 250, WIDTH: 550, HEIGHT: 600 };
    const ocrResults = await ocrCaptureRegion(dialogOptionsRegion);
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

      if (!foundPriorityOption && !checkMainUI()) {
        const exitList = await templateMatchCaptureRegion(PATHS.TALK_EXIT_IMAGE, talkIconRegion, true);
        const iconList = await templateMatchCaptureRegion(PATHS.TALK_ICON_IMAGE, talkIconRegion);
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

    if (checkMainUI()) { log.info("检测到已返回主界面，结束循环"); break; }
  }

  if (checkMainUI()) {
    log.info("已返回主界面，自动剧情执行完成");
    await sleep(500);
    keyPress("V");
    await sleep(2000);
  } else {
    log.warn("已达到最大尝试次数 {attempts}，但未检测到返回主界面", maxAttempts);
  }
}
