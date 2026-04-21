/**
 * 准备逻辑模块
 * 委托执行前的准备工作
 */
import { GAME_RESOLUTION } from "../config/index.js";
import { getSetting } from "../utils/settings-utils.js";

/**
 * 委托前准备工作：设置分辨率、前往七天神像、切换队伍
 */
export async function prepareForLeyLineRun() {
  log.info("开始执行委托前准备");
  setGameMetrics(GAME_RESOLUTION.WIDTH, GAME_RESOLUTION.HEIGHT, GAME_RESOLUTION.DPI);
  try {
    await genshin.returnMainUi();
    const setting = await getSetting();
    if (!setting.prepare) {
      await genshin.tpToStatueOfTheSeven();
    }
    if (setting.team) {
      log.info("切换至队伍 {team}", setting.team);
      await genshin.switchParty(setting.team);
    }
  } catch (error) {
    log.error("prepareForLeyLineRun函数出现错误: {error}", error.message);
  }
}
