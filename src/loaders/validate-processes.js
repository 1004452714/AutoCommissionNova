/**
 * 流程文件静态校验
 *
 * 启动期遍历 process/蒙德/NPC/** 与 process/蒙德/Basic/** 下所有 process.json，
 * 对每个 step 检查：
 *   (1) step.type 是否已在 registry 注册
 *   (2) step.data 是否通过该 type 声明的 schema（schema 可选）
 *   (3) 用户分支选择 的 step.data[branchKey] 嵌套 step 递归校验
 *   (4) 执行子流程 / 委托描述检测 引用的子流程文件递归校验
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
    errors += validatePartyConfig();

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
            const loadSubProcess = (filename) => loadNpcProcessFile(commissionName, location, filename);
            errors += await validateProcessSteps(registry, processPath, steps, loadSubProcess);
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
            const loadSubProcess = (filename) => loadBasicProcess(subDir + "/" + filename);
            errors += await validateProcessSteps(registry, processPath, steps, loadSubProcess);
        }
    }
    return errors;
}

/**
 * 对一份流程的步骤数组做校验
 *
 * @param {Object} registry
 * @param {string} processPath - 用于日志定位
 * @param {Array} steps - loader 返回的 step 数组
 * @param {Function} loadSubProcess - (filename) => Promise<Array|null> 子流程加载器（按委托类型注入）
 * @param {Set<string>} visited - 已访问的子流程文件名，避免循环递归
 */
async function validateProcessSteps(registry, processPath, steps, loadSubProcess, visited = new Set()) {
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

        // 嵌套校验：用户分支选择 的 step.data[branchKey] 是嵌套 step 对象
        if (stepType === "用户分支选择" && step.data && typeof step.data === "object" && !Array.isArray(step.data)) {
            const nestedSteps = [];
            for (const branchKey of Object.keys(step.data)) {
                const branchStep = step.data[branchKey];
                if (branchStep && typeof branchStep === "object" && !Array.isArray(branchStep)) {
                    nestedSteps.push(branchStep);
                }
            }
            if (nestedSteps.length > 0) {
                errors += await validateProcessSteps(
                    registry,
                    `${processPath} → 用户分支选择`,
                    nestedSteps,
                    loadSubProcess,
                    visited
                );
            }
        }

        // 子流程文件校验（执行子流程 / 委托描述检测）
        let subFile = null;
        if (stepType === "执行子流程" && step.data && typeof step.data.path === "string") {
            subFile = step.data.path;
        } else if (stepType === "委托描述检测" && typeof step.run === "string") {
            subFile = step.run;
        }
        if (subFile && loadSubProcess) {
            if (visited.has(subFile)) continue;
            visited.add(subFile);
            try {
                const subSteps = await loadSubProcess(subFile);
                if (subSteps && subSteps.length > 0) {
                    errors += await validateProcessSteps(
                        registry,
                        `${processPath} → ${subFile}`,
                        subSteps,
                        loadSubProcess,
                        visited
                    );
                }
            } catch (err) {
                log.error("[{path}] 步骤 #{n} ({type}) 子流程加载失败: {file} - {error}",
                    processPath, i + 1, stepType, subFile, err.message);
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
 *   5. note 仅允许纯文本，UI 不再消费 noteLevel
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
        const completedByUid = cfg.completedByUid || {};
        if (cfg.completedByUid === undefined) {
            log.error("[{path}] 缺少 completedByUid", filePath);
            errors++;
        }
        if (cfg.completed !== undefined) {
            log.error("[{path}] completed 已废弃，请使用 completedByUid", filePath);
            errors++;
        }
        if (!completedByUid || typeof completedByUid !== "object" || Array.isArray(completedByUid)) {
            log.error("[{path}] completedByUid 必须是对象", filePath);
            errors++;
        }
        if (cfg.note !== undefined && typeof cfg.note !== "string") {
            log.error("[{path}] note 必须是字符串", filePath);
            errors++;
        }
        if (cfg.noteLevel !== undefined) {
            log.warn("[{path}] noteLevel 已废弃，请移除该字段", filePath);
        }

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

        // 4: completedByUid 中的分支必须在 conditions 中
        if (completedByUid && typeof completedByUid === "object" && !Array.isArray(completedByUid)) {
            for (const uid of Object.keys(completedByUid)) {
                if (!/^\d+$/.test(uid)) {
                    log.warn("[{path}] completedByUid 包含非数字 UID: {uid}", filePath, uid);
                }
                const completed = completedByUid[uid];
                if (!Array.isArray(completed)) {
                    log.error("[{path}] completedByUid.{uid} 必须是数组", filePath, uid);
                    errors++;
                    continue;
                }
                for (const branchKey of completed) {
                    if (!conditions[branchKey]) {
                        log.warn("[{path}] completedByUid.{uid} 包含偏好分支 {br}（未在 conditions 中声明），运行时不会被使用",
                            filePath, uid, branchKey);
                    }
                }
            }
        }
    }
    return errors;
}

function walkJsonFiles(dir) {
    const files = [];
    let entries;
    try {
        entries = Array.from(file.readPathSync(dir) || []);
    } catch (error) {
        log.debug("读取目录失败 [{path}]: {err}", dir, error.message);
        return files;
    }

    for (const entry of entries) {
        if (file.isFolder(entry)) {
            files.push(...walkJsonFiles(entry));
            continue;
        }
        if (entry.toLowerCase().endsWith(".json")) {
            files.push(entry);
        }
    }
    return files;
}

function validatePartyModeConfig(config, filePath, fieldName, { allowStrategy }) {
    let errors = 0;
    if (!config || typeof config !== "object" || Array.isArray(config)) {
        log.error("[{path}] {field} 必须是对象", filePath, fieldName);
        return 1;
    }

    if (config.mode !== undefined && config.mode !== "global" && config.mode !== "custom") {
        log.error("[{path}] {field}.mode 只能是 global 或 custom", filePath, fieldName);
        errors++;
    }
    if (config.teamMode !== undefined && config.teamMode !== "teamName" && config.teamMode !== "roles") {
        log.error("[{path}] {field}.teamMode 只能是 teamName 或 roles", filePath, fieldName);
        errors++;
    }
    if (config.teamName !== undefined && typeof config.teamName !== "string") {
        log.error("[{path}] {field}.teamName 必须是字符串", filePath, fieldName);
        errors++;
    }
    if (config.roles !== undefined) {
        if (!config.roles || typeof config.roles !== "object" || Array.isArray(config.roles)) {
            log.error("[{path}] {field}.roles 必须是对象", filePath, fieldName);
            errors++;
        } else {
            for (const key of Object.keys(config.roles)) {
                if (!["1", "2", "3", "4"].includes(key)) {
                    log.error("[{path}] {field}.roles 只能包含 1-4 键", filePath, fieldName);
                    errors++;
                    continue;
                }
                if (typeof config.roles[key] !== "string") {
                    log.error("[{path}] {field}.roles.{key} 必须是字符串", filePath, fieldName, key);
                    errors++;
                }
            }
        }
    }
    if (allowStrategy) {
        if (config.strategy !== undefined && typeof config.strategy !== "string") {
            log.error("[{path}] {field}.strategy 必须是字符串", filePath, fieldName);
            errors++;
        }
    } else if (config.strategy !== undefined) {
        log.warn("[{path}] {field}.strategy 不会被使用，建议移除", filePath, fieldName);
    }

    return errors;
}

function validatePartyConfig() {
    if (!file.isFolder(PATHS.PARTY_CONFIG_DIR)) {
        return 0;
    }

    const files = walkJsonFiles(PATHS.PARTY_CONFIG_DIR);
    if (files.length === 0) {
        return 0;
    }

    let errors = 0;
    for (const filePath of files) {
        let config;
        try {
            const raw = file.readTextSync(filePath);
            config = JSON.parse(raw);
        } catch (error) {
            log.error("[{path}] 队伍配置 JSON 解析失败: {error}", filePath, error.message);
            errors++;
            continue;
        }

        if (baseName(filePath) === "global.json") {
            if (!config || typeof config !== "object" || Array.isArray(config)) {
                log.error("[{path}] 全局队伍配置必须是对象", filePath);
                errors++;
                continue;
            }
            if (config.battleTeamName !== undefined && typeof config.battleTeamName !== "string") {
                log.error("[{path}] battleTeamName 必须是字符串", filePath);
                errors++;
            }
            if (config.elementTeamName !== undefined && typeof config.elementTeamName !== "string") {
                log.error("[{path}] elementTeamName 必须是字符串", filePath);
                errors++;
            }
            if (config.battleStrategy !== undefined && typeof config.battleStrategy !== "string") {
                log.error("[{path}] battleStrategy 必须是字符串", filePath);
                errors++;
            }
            continue;
        }

        if (!config || typeof config !== "object" || Array.isArray(config)) {
            log.error("[{path}] 委托队伍配置必须是对象", filePath);
            errors++;
            continue;
        }

        errors += validatePartyModeConfig(config.battle || {}, filePath, "battle", { allowStrategy: true });
        errors += validatePartyModeConfig(config.collect || {}, filePath, "collect", { allowStrategy: false });
    }
    return errors;
}
