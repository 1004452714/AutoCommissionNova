/**
 * 主流程模块
 * 脚本的主入口逻辑
 */
import { GAME_RESOLUTION, PATHS } from "../config/index.js";
import { getSetting } from "../utils/settings-utils.js";
import { loadSupportedCommissions, saveCommissionsData, initSkipCommissionsList } from "../data/index.js";
import { recognizeCommissions, initCommissionReferenceData } from "../recognition/index.js";
import { prepareForLeyLineRun } from "./preparation.js";
import { executeCommissionTracking } from "./commission-executor.js";
import { enterCommissionScreen } from "../vision/ui-detector.js";

/**
 * 委托识别主函数
 * @returns {Promise<Array>} 识别到的委托列表
 */
export async function identification() {
  log.info("开始执行原神每日委托识别脚本");
  try {
    setGameMetrics(GAME_RESOLUTION.WIDTH, GAME_RESOLUTION.HEIGHT, GAME_RESOLUTION.DPI);
    await genshin.returnMainUi();

    await initSkipCommissionsList();
    const supportedCommissions = await loadSupportedCommissions();
    await initCommissionReferenceData(supportedCommissions);

    for (const commission of supportedCommissions.fight) {
      ensureDirectoryExists(PATHS.FIGHT_SCRIPT_BASE + "/" + commission);
    }
    for (const commission of supportedCommissions.talk) {
      ensureDirectoryExists(PATHS.TALK_PROCESS_BASE + "/" + commission);
    }

    const enterSuccess = await enterCommissionScreen();
    if (!enterSuccess) {
      log.error("无法进入委托界面，脚本终止");
      return [];
    }
    await sleep(1000);

    const commissions = await recognizeCommissions(supportedCommissions);

    if (commissions && commissions.length > 0) {
      log.info("委托识别成功，开始保存数据");
      await saveCommissionsData(commissions);
      log.info("委托识别完成，共识别到 {total} 个委托，其中 {supported} 个受支持",
        commissions.length, commissions.filter(function(c) { return c.supported; }).length);
    } else {
      log.warn("委托识别失败或未识别到任何委托，跳过保存数据");
    }
    return commissions;
  } catch (error) {
    log.error("identification函数出现错误: {error}", error.message);
    return [];
  }
}

/**
 * 主流程执行函数
 * @param {Object} stepRegistry - 步骤处理器注册表
 */
export async function executeMainProcess(stepRegistry) {
  try {
    const setting = await getSetting();
    if (setting.skipRecognition) {
      log.info("跳过识别，直接加载数据");
    } else {
      log.info("开始执行委托识别");
      await identification();
    }

    await prepareForLeyLineRun();
    await executeCommissionTracking(stepRegistry);

    if (!setting.prepare) {
      log.info("每日委托执行完成，前往安全地点");
      await genshin.tpToStatueOfTheSeven();
    } else {
      log.info("每日委托执行完成");
    }
  } catch (error) {
    log.error("执行出错: {error}", error.message);
  }
}

function ensureDirectoryExists(dirPath) {
  try {
    const tempFilePath = dirPath + "/.temp";
    file.writeTextSync(tempFilePath, "");
    return true;
  } catch (error) {
    return false;
  }
}
