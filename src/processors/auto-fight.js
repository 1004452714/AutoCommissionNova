/**
 * 定时自动战斗步骤处理器
 * 使用 BvPage 重写战斗结束检测
 */
import { PATHS } from "../config/index.js";

export function register(registry) {
  registry.register("定时自动战斗", async function(step, context) {
    const timeout = (step.data && step.data.timeout) || 30000;
    const intervals = (step.data && step.data.intervals) || 5000;

    let cts = new CancellationTokenSource();
    try {
      log.info("开始战斗");
      let fightTask = dispatcher.RunTask(new SoloTask("AutoFight"), cts);
      await waitFight(timeout, intervals);
      cts.cancel();
      return true;
    } catch (error) {
      log.error("处理自动战斗步骤时出错: {error}", error.message);
      return false;
    } finally {
      cts.Dispose();
    }
  });
}

async function waitFight(timeout, intervals) {
  const teamMat = file.ReadImageMatSync(PATHS.TEAM_IMAGE);
  try {
    const teamRO = RecognitionObject.TemplateMatch(teamMat);
    teamRO.useMask = true;
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      keyPress("l");
      await sleep(1000);
      const page = new BvPage();
      const results = await page.Locator(teamRO).TryWaitFor(2000);
      if (results.length > 0) {
        log.info("识别到战斗结束");
        keyPress("l");
        return true;
      }
      log.info("未识别到战斗结束");
      await sleep(intervals);
    }
    return false;
  } finally {
    teamMat.Dispose();
  }
}
