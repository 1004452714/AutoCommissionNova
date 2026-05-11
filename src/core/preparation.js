/**
 * 准备逻辑模块
 * 委托执行前的准备工作
 */
import { getSetting } from "../utils/settings-utils.js";

/**
 * 委托前准备工作：设置分辨率、前往七天神像、切换队伍
 */
export async function prepareForCommission() {
  log.info("开始执行委托前准备");
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
    log.error("prepareForCommission函数出现错误: {error}", error.message);
  }
}
