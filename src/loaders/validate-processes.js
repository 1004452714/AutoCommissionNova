/**
 * 流程文件静态校验
 *
 * 启动期遍历 process/NPC/** 与 process/Basic/** 下所有 process.json，
 * 对每个 step 检查：
 *   (1) step.type 是否已在 registry 注册
 *   (2) step.data 是否通过该 type 声明的 schema（schema 可选）
 *
 * 发现问题只 log.error，不阻断启动 —— 用户仍可跑其他正常委托，
 * 但启动日志会明确指出问题文件 + 步骤索引 + 错误描述
 */
import { PATHS } from "../config/index.js";
import { validateSchema } from "../processors/define-step.js";
import { loadNpcProcessFile, loadBasicProcess } from "./index.js";
import { probeRegistry } from "../probes/index.js";
import { loadAllBranchConfigs } from "./branch-config.js";

/**
 * 启动期遍历所有 process.json 做静态校验
 * @param {Object} registry - StepProcessorRegistry 实例
 * @returns {Promise<number>} 发现的错误数（0 表示全部通过）
 */
export async function validateAllProcesses(registry) {
    log.info("开始静态校验流程文件...");
    let errors = 0;
    errors += await validateNpcProcesses(registry);
    errors += await validateBasicProcesses(registry);
    errors += validateBranchConfig();

    if (errors > 0) {
        log.error("流程文件静态校验发现 {n} 处问题，详见上面的日志", errors);
    } else {
        log.info("流程文件静态校验通过");
    }
    return errors;
}

function baseName(path) {
    return path.split("/").pop().split("\\").pop();
}

async function validateNpcProcesses(registry) {
    let errors = 0;
    let commissionDirs;
    try {
        commissionDirs = Array.from(file.readPathSync(PATHS.NPC_PROCESS_BASE));
    } catch (error) {
        log.warn("无法读取 NPC 流程目录 {dir}: {error}", PATHS.NPC_PROCESS_BASE, error.message);
        return 0;
    }

    for (const commissionDir of commissionDirs) {
        if (!file.isFolder(commissionDir)) continue;
        const commissionName = baseName(commissionDir);

        let locationDirs;
        try {
            locationDirs = Array.from(file.readPathSync(commissionDir));
        } catch {
            continue;
        }

        for (const locationDir of locationDirs) {
            if (!file.isFolder(locationDir)) continue;
            const location = baseName(locationDir);
            const steps = await loadNpcProcessFile(commissionName, location, "process.json");
            if (!steps || steps.length === 0) continue;

            const processPath = PATHS.NPC_PROCESS_BASE + "/" + commissionName + "/" + location + "/process.json";
            errors += validateProcessSteps(registry, processPath, steps);
        }
    }
    return errors;
}

async function validateBasicProcesses(registry) {
    let errors = 0;
    let commissionDirs;
    try {
        commissionDirs = Array.from(file.readPathSync(PATHS.BASIC_SCRIPT_BASE));
    } catch (error) {
        log.warn("无法读取 Basic 流程目录 {dir}: {error}", PATHS.BASIC_SCRIPT_BASE, error.message);
        return 0;
    }

    for (const commissionDir of commissionDirs) {
        if (!file.isFolder(commissionDir)) continue;

        let subDirs;
        try {
            subDirs = Array.from(file.readPathSync(commissionDir));
        } catch {
            continue;
        }

        for (const subDir of subDirs) {
            if (!file.isFolder(subDir)) continue;
            const processPath = subDir + "/process.json";
            const steps = await loadBasicProcess(processPath);
            if (!steps || steps.length === 0) continue;
            errors += validateProcessSteps(registry, processPath, steps);
        }
    }
    return errors;
}

/**
 * 对一份流程的步骤数组做校验
 * @param {Object} registry
 * @param {string} processPath - 用于日志定位
 * @param {Array} steps - loader 返回的 step 数组
 */
function validateProcessSteps(registry, processPath, steps) {
    let errors = 0;
    for (let i = 0; i < steps.length; i++) {
        const step = steps[i];

        if (!step || typeof step !== "object" || Array.isArray(step)) {
            log.error("[{path}] 步骤 #{n} 必须是对象格式，收到: {value}", processPath, i + 1, step);
            errors++;
            continue;
        }

        const stepType = step.type;
        if (!registry.has(stepType)) {
            log.error("[{path}] 步骤 #{n} 未知 type: {type}", processPath, i + 1, stepType);
            errors++;
            continue;
        }

        const schema = registry.getSchema(stepType);
        if (schema) {
            const result = validateSchema(step.data, schema, stepType);
            if (!result.ok) {
                log.error("[{path}] 步骤 #{n} ({type}) 校验失败: {error}", processPath, i + 1, stepType, result.error);
                errors++;
            }
        }
    }
    return errors;
}

/**
 * 校验 process/config/branches/ 下的所有分支配置文件
 *
 * 检查项：
 *   1. conditions[branchKey].type 必须在 probeRegistry 中注册
 *   2. 委托给探针自己的 validate(cond)（schema 检查下沉到探针）
 *   3. conditions / default 中出现的分支 key 必须在 descriptions 中（孤儿告警）
 *   4. completed 中的分支必须在 conditions 中（偏好分支不应进 completed）
 *
 * 加载错误（目录不存在 / 单文件 JSON 解析失败）由 loadAllBranchConfigs 自己 log.error，
 * 此处只校验已成功解析的内容
 */
function validateBranchConfig() {
    const composite = loadAllBranchConfigs();
    if (!composite || Object.keys(composite).length === 0) {
        log.warn("分支配置为空，跳过校验: {dir}", PATHS.BRANCHES_DIR);
        return 0;
    }

    let errors = 0;
    const registeredTypes = probeRegistry.types().join(", ");
    for (const commissionName of Object.keys(composite)) {
        const cfg = composite[commissionName];
        const filePath = PATHS.BRANCHES_DIR + "/" + commissionName + ".json";
        if (!cfg || typeof cfg !== "object") {
            log.error("[{path}] 配置必须是对象", filePath);
            errors++;
            continue;
        }

        const descriptions = cfg.descriptions || {};
        const conditions = cfg.conditions || {};
        const completed = Array.isArray(cfg.completed) ? cfg.completed : [];

        // 1-2: 每个 condition 用探针注册表校验
        for (const branchKey of Object.keys(conditions)) {
            const cond = conditions[branchKey];
            if (!cond || typeof cond !== "object") {
                log.error("[{path}] conditions.{br} 必须是对象", filePath, branchKey);
                errors++;
                continue;
            }
            if (!probeRegistry.has(cond.type)) {
                log.error("[{path}] conditions.{br}.type 未注册: {t}（已注册类型: {list}）",
                    filePath, branchKey, cond.type, registeredTypes);
                errors++;
                continue;
            }
            const probe = probeRegistry.get(cond.type);
            if (probe.validate) {
                const result = probe.validate(cond);
                if (!result.ok) {
                    log.error("[{path}] conditions.{br} ({t}) 校验失败: {error}",
                        filePath, branchKey, cond.type, result.error);
                    errors++;
                }
            }
        }

        // 3: 孤儿分支告警（key 不在 descriptions 中）
        for (const branchKey of Object.keys(conditions)) {
            if (!descriptions[branchKey]) {
                log.warn("[{path}] conditions.{br} 不在 descriptions 中，UI 将无法显示该分支",
                    filePath, branchKey);
            }
        }
        if (cfg.default && !descriptions[cfg.default]) {
            log.warn("[{path}] default = {br} 不在 descriptions 中", filePath, cfg.default);
        }

        // 4: completed 中的分支必须在 conditions 中（否则偏好分支被错误标记完成）
        for (const branchKey of completed) {
            if (!conditions[branchKey]) {
                log.warn("[{path}] completed 包含偏好分支 {br}（未在 conditions 中声明），运行时不会被使用",
                    filePath, branchKey);
            }
        }
    }
    return errors;
}
