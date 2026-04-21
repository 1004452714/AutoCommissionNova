/**
 * NPC 自动导航模块（BvPage 重写）
 * 自动导航到 NPC 对话位置
 */
import { PATHS } from "../config/index.js";
import { isInMainUI } from "../vision/ui-detector.js";

/**
 * 自动导航到 NPC 对话位置
 * @param {Object} options - 配置选项
 * @param {string} [options.npcName] - 目标 NPC 名称
 * @param {string} [options.iconType] - 图标类型 "Bigmap"|"Question"|"Task"
 * @param {boolean} [options.autoTalk] - 到达后是否自动对话
 */
export async function autoNavigateToTalk(options = {}) {
  const { npcName = "", iconType = "", autoTalk = false } = options;
  try {
    const textArray = npcName;
    let boxIconRo;

    const iconMat = loadIconMat(iconType);
    try {
      boxIconRo = RecognitionObject.TemplateMatch(iconMat);
    } finally {
      iconMat.Dispose();
    }

    let advanceNum = 0;
    middleButtonClick();
    await sleep(800);

    while (true) {
      await sleep(500);
      const captureRegion = captureGameRegion();
      try {
        const rewardTextArea = captureRegion.DeriveCrop(1210, 515, 200, 50);
        try {
          const rewardResult = rewardTextArea.find(RecognitionObject.ocrThis);
          log.debug("检测到文字: " + rewardResult.text);
          if (rewardResult.text === textArray) {
            log.info("已到达指定位置，检测到文字: " + rewardResult.text);
            if (autoTalk) keyPress("VK_F");
            return;
          } else if (advanceNum > 80) {
            throw new Error("前进时间超时");
          }
        } finally {
          rewardTextArea.Dispose();
        }
      } finally {
        captureRegion.Dispose();
      }

      for (let i = 0; i < 100; i++) {
        const cap = captureGameRegion();
        try {
          const iconRes = cap.Find(boxIconRo);
          log.info("检测到委托图标位置 ({x}, {y})", iconRes.x, iconRes.y);
          if (iconRes.x >= 920 && iconRes.x <= 980 && iconRes.y <= 540) {
            advanceNum++;
            log.info("视野已调正，前进第{num}次", advanceNum);
            break;
          } else {
            if (iconRes.y >= 520) moveMouseBy(0, 920);
            const adjustAmount = iconRes.x < 920 ? -20 : 20;
            const distanceToCenter = Math.abs(iconRes.x - 920);
            const scaleFactor = Math.max(1, Math.floor(distanceToCenter / 50));
            const adjustAmount2 = iconRes.y < 540 ? scaleFactor : 10;
            moveMouseBy(adjustAmount * adjustAmount2, 0);
            await sleep(100);
          }
          if (i > 50) throw new Error("视野调整超时");
        } finally {
          cap.Dispose();
        }
      }

      keyDown("w");
      await sleep(200);
      keyPress("VK_SPACE");
      await sleep(200);
      keyPress("VK_SPACE");
      await sleep(200);
      keyUp("w");
      await sleep(200);
    }
  } catch (error) {
    log.error("自动导航到NPC对话位置时出错: {error}", error.message);
    throw error;
  }
}

function loadIconMat(iconType) {
  const type = (iconType || "").toLowerCase();
  if (type === "bigmap") {
    log.info("使用大地图图标");
    return file.ReadImageMatSync(PATHS.ICON_BIGMAP_COMMISSION);
  } else if (type === "question") {
    log.info("使用问号任务图标");
    return file.ReadImageMatSync(PATHS.ICON_QUESTION_COMMISSION);
  }
  log.info("使用任务图标");
  return file.ReadImageMatSync(PATHS.ICON_TASK_COMMISSION);
}
