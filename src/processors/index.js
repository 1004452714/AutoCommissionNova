/**
 * 步骤处理器汇总注册入口
 * 统一导入所有步骤处理器并注册到注册表
 */
import { register as registerWait } from "./wait.js";
import { register as registerWaitMainUi } from "./wait-main-ui.js";
import { register as registerKeyPress } from "./key-press.js";
import { register as registerKeyMouseScript } from "./key-mouse-script.js";
import { register as registerMapTracking } from "./map-tracking.js";
import { register as registerTeleport } from "./teleport.js";
import { register as registerAutoSkip } from "./auto-skip.js";
import { register as registerAutoFight } from "./auto-fight.js";
import { register as registerAutoTask } from "./auto-task.js";
import { register as registerSwitchTeam } from "./switch-team.js";
import { register as registerSwitchRole } from "./switch-role.js";
import { register as registerCommissionTracking } from "./commission-tracking.js";
import { register as registerLocationDetection } from "./location-detection.js";
import { register as registerCommissionDescDetect } from "./commission-desc-detect.js";
import { register as registerUserBranchSelect } from "./user-branch-select.js";

const allProcessors = [
    registerWait,
    registerWaitMainUi,
    registerKeyPress,
    registerKeyMouseScript,
    registerMapTracking,
    registerTeleport,
    registerAutoSkip,
    registerAutoFight,
    registerAutoTask,
    registerSwitchTeam,
    registerSwitchRole,
    registerCommissionTracking,
    registerLocationDetection,
    registerCommissionDescDetect,
    registerUserBranchSelect,
];

/**
 * 注册所有步骤处理器
 * @param {Object} registry - StepProcessorRegistry 实例
 */
export function registerAllProcessors(registry) {
    for (const registerFn of allProcessors) {
        registerFn(registry);
    }
}
