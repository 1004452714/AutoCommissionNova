/**
 * 测试运行器
 * 从 testScript/process.json 加载测试步骤并执行
 */
import { stepRegistry } from "../src/processors/registry.js";
import { registerAllProcessors } from "../src/processors/index.js";
import { loadAndParseProcessFile } from "../src/core/talk-executor.js";
import { isInMainUI } from "../src/vision/ui-detector.js";

registerAllProcessors(stepRegistry);

const test = async function() {
  log.info("=== 开始测试执行脚本 ===");
  try {
    const testScriptPath = "testScript/process.json";
    const processContent = await file.readText(testScriptPath);
    const processSteps = JSON.parse(processContent);

    log.info("成功加载测试脚本文件: {path}", testScriptPath);
    log.info("测试步骤数量: {count}", processSteps.length);

    const context = {
      commissionName: "测试委托",
      location: "测试位置",
      processSteps: processSteps,
      currentIndex: 0,
      isInMainUI: isInMainUI,
      priorityOptions: [],
      npcWhiteList: [],
    };

    for (let i = 0; i < processSteps.length; i++) {
      const step = processSteps[i];
      log.info("执行测试步骤 {step}: {type}", i + 1, step.type || step);
      context.currentIndex = i;
      await stepRegistry.process(step, context);
      await sleep(1000);
    }

    log.info("=== 测试执行脚本完成 ===");
    return true;
  } catch (error) {
    log.error("测试执行过程中发生错误: {error}", error.message);
    return false;
  }
};

test();
