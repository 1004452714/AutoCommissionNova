/**
 * Basic 攀高危险 - 摧毁哨塔步骤处理器
 */
import { PATHS } from "../config/index.js";
import { RO } from "../vision/index.js";
import { bvPageOcrRegionText } from "../vision/ocr-utils.js";
import { defineStep } from "./define-step.js";
import { isCancellationError } from "../utils/error-utils.js";

const WATCHTOWER_CONFIG = {
    /** 单次执行最多摧毁的哨塔数量；攀高危险最多两个，之后的任务图标可能属于其他委托。 */
    maxDestroyCount: 2,
    /** 距离阈值：OCR 识别到哨塔距离小于该值时，停止靠近并进入攻击阶段。 */
    distanceThreshold: 3,
    /** 距离文字连续识别失败上限：达到后认为当前图标不是哨塔，直接结束步骤。 */
    missingDistanceLimit: 5,
    /** 靠近阶段超时时间（毫秒）：超过后仍未进入距离阈值则返回失败。 */
    approachTimeout: 45 * 1000,
    /** 攻击阶段超时时间（毫秒）：进度未变化且未识别到完成提示时停止攻击。 */
    attackTimeout: 30 * 1000,
    /** 单次前进时长（毫秒）：视角对准图标后按住 W 前进的时间。 */
    forwardMs: 600,
    /** 委托描述区域，显示“摧毁丘丘人哨塔 0/2”等进度。 */
    descriptionRegion: new OpenCvSharp.OpenCvSharp.Rect(80, 250, 380, 65),
    /** 与乐流奔引一致的“委托完成”提示区域。 */
    completionRegion: new OpenCvSharp.OpenCvSharp.Rect(880, 165, 160, 45),
    /** 距离文字 OCR 区域：以任务图标坐标为基准偏移后裁剪，识别形如 23m 的整数距离。 */
    distanceRegion: {
        /** OCR 区域相对图标 x 坐标的偏移。 */
        offsetX: -55,
        /** OCR 区域相对图标 y 坐标的偏移。 */
        offsetY: 32,
        /** OCR 区域宽度。 */
        width: 130,
        /** OCR 区域高度。 */
        height: 45,
    },
};

const NAVIGATION_ICON = "图标寻路";
const NAVIGATION_PATH = "路径追踪";

function resolveStepOptions(step) {
    if (step.data === undefined || step.data === null) {
        return { navigation: NAVIGATION_ICON, path: null };
    }
    if (typeof step.data !== "object" || Array.isArray(step.data)) {
        throw new Error("摧毁哨塔步骤 data 必须是对象");
    }

    const navigation = step.data.navigation || NAVIGATION_ICON;
    if (navigation !== NAVIGATION_ICON && navigation !== NAVIGATION_PATH) {
        throw new Error(`摧毁哨塔步骤 navigation 只能是“${NAVIGATION_ICON}”或“${NAVIGATION_PATH}”`);
    }
    if (navigation === NAVIGATION_PATH && (typeof step.data.path !== "string" || !step.data.path.trim())) {
        throw new Error("摧毁哨塔步骤使用路径追踪时必须配置 data.path");
    }
    return { navigation, path: navigation === NAVIGATION_PATH ? step.data.path.trim() : null };
}

/**
 * 解析“摧毁丘丘人哨塔0/2”一类委托描述。
 * @returns {{current: number, total: number}|null}
 */
export function parseWatchtowerProgress(text) {
    const normalized = String(text || "")
        .replace(/\s/g, "")
        .replace(/[oO]/g, "0")
        .replace(/[|\\]/g, "/");
    const match = normalized.match(/摧毁丘丘人哨塔.*?(\d+)\/(\d+)/);
    if (!match) return null;
    return { current: Number(match[1]), total: Number(match[2]) };
}

function readDestroyStatus() {
    let descriptionText = "";
    let completionText = "";
    try {
        descriptionText = bvPageOcrRegionText(WATCHTOWER_CONFIG.descriptionRegion);
        completionText = bvPageOcrRegionText(WATCHTOWER_CONFIG.completionRegion);
    } catch (error) {
        log.debug("摧毁哨塔状态 OCR 失败: {error}", error.message);
    }
    return {
        progress: parseWatchtowerProgress(descriptionText),
        completed: completionText.includes("委托完成"),
        descriptionText,
        completionText,
    };
}

/**
 * 从 OCR 文本中解析整数米距离，例如 23m。
 * @param {string} text - OCR 文本
 * @returns {number|null}
 */
function parseDistance(text) {
    const match = String(text || "").replace(/[oO]/g, "0").match(/(\d+)\s*m/i);
    return match ? Number(match[1]) : null;
}

/**
 * 查找任务图标，优先使用中心限定区域基础委托图标，失败后回退到全屏基础委托图标。
 * @param {Object} cap - captureGameRegion() 返回的截图对象
 * @returns {Object|null} 图标匹配结果
 */
function findTaskIcon(cap) {
    const centerIconRes = cap.Find(RO.iconBase);
    if (centerIconRes && !centerIconRes.isEmpty()) return centerIconRes;

    const iconRes = cap.Find(RO.iconBaseFull);
    if (!iconRes || iconRes.isEmpty()) return null;
    return iconRes;
}

/**
 * 判断全屏范围内是否仍存在基础委托图标。
 * @returns {boolean}
 */
function hasAnyBaseIcon() {
    const cap = captureGameRegion();
    try {
        const iconRes = cap.Find(RO.iconBaseFull);
        return !!iconRes && !iconRes.isEmpty();
    } finally {
        cap.Dispose();
    }
}

/**
 * 根据任务图标位置计算距离文字 OCR 裁剪区域。
 * @param {Object} iconRes - 任务图标匹配结果
 * @returns {{x: number, y: number, width: number, height: number}}
 */
function makeDistanceRegion(iconRes) {
    const cfg = WATCHTOWER_CONFIG.distanceRegion;
    const x = Math.round(iconRes.x + cfg.offsetX);
    const y = Math.round(iconRes.y + cfg.offsetY);
    const { width, height } = cfg;
    return { x, y, width, height };
}

/**
 * 从任务图标下方 OCR 距离文本。
 * @param {Object} cap - captureGameRegion() 返回的截图对象
 * @param {Object} iconRes - 任务图标匹配结果
 * @returns {{text: string, distance: number|null}}
 */
function readDistanceFromCapture(cap, iconRes) {
    const region = makeDistanceRegion(iconRes);
    const area = cap.DeriveCrop(region.x, region.y, region.width, region.height);
    try {
        const result = area.find(RecognitionObject.ocrThis);
        const text = result && result.text ? result.text.trim() : "";
        return { text, distance: parseDistance(text) };
    } finally {
        area.Dispose();
    }
}

/**
 * 根据任务图标位置调整镜头朝向。
 * @param {Object} iconRes - 任务图标匹配结果
 * @param {Object} state - 靠近阶段的临时状态
 * @returns {boolean} true 表示图标已在正前方范围，可前进
 */
function adjustViewToIcon(iconRes, state) {
    if (iconRes.x >= 900 && iconRes.x <= 1020 && iconRes.y < 540) {
        return true;
    }

    if (iconRes.y >= 600 && !state.lookedDownOnce) {
        state.lookedDownOnce = true;
        log.debug("图标位于画面下方，先下拉镜头后重新判断");
        moveMouseBy(0, 540);
        return false;
    }

    const distanceToCenter = iconRes.x - 960;
    moveMouseBy(parseInt(Math.round(distanceToCenter) * 0.8), 0);
    return false;
}

/**
 * 按住 W 前进指定时间，并确保最后释放按键。
 * @param {number} duration - 前进时长（毫秒）
 * @returns {Promise<void>}
 */
async function walkForward(duration) {
    keyDown("w");
    try {
        await sleep(duration);
    } finally {
        keyUp("w");
    }
}

/**
 * 持续识别任务图标、调整镜头并向哨塔靠近，直到距离小于阈值。
 * @returns {Promise<boolean|null>} true 表示成功靠近哨塔，null 表示当前图标不是哨塔
 */
async function approachWatchtower() {
    middleButtonClick();
    await sleep(800);

    const startTime = Date.now();
    let failCount = 0;
    let missingDistanceCount = 0;
    const adjustState = { lookedDownOnce: false };
    while (Date.now() - startTime < WATCHTOWER_CONFIG.approachTimeout) {
        const cap = captureGameRegion();
        try {
            const iconRes = findTaskIcon(cap);
            if (!iconRes) {
                failCount++;
                log.warn("任务图标识别失败，连续失败次数: {count}/8", failCount);
                if (failCount >= 8) return false;
                await sleep(300);
                continue;
            }

            failCount = 0;
            if (!adjustViewToIcon(iconRes, adjustState)) {
                await sleep(250);
                continue;
            }

            const { text, distance } = readDistanceFromCapture(cap, iconRes);
            if (distance !== null) {
                missingDistanceCount = 0;
                log.debug("哨塔距离: {distance}m", distance);
                if (distance < WATCHTOWER_CONFIG.distanceThreshold) {
                    return true;
                }
            } else {
                missingDistanceCount++;
                log.warn("未解析到哨塔距离文本: {text}，连续失败次数: {count}/{limit}", text, missingDistanceCount, WATCHTOWER_CONFIG.missingDistanceLimit);
                if (missingDistanceCount >= WATCHTOWER_CONFIG.missingDistanceLimit) {
                    log.info("连续未识别到距离文字，判断当前图标不是哨塔，结束摧毁哨塔步骤");
                    return null;
                }
                await sleep(300);
                continue;
            }

            await walkForward(WATCHTOWER_CONFIG.forwardMs);
        } finally {
            cap.Dispose();
        }
        await sleep(1);
    }

    log.warn("靠近哨塔超时");
    return false;
}

/**
 * 获取 ClearScript 暴露的 C# string[] 中的角色名。
 * @param {Object} avatars - getAvatars() 返回值
 * @param {number} index - 0 基索引
 * @returns {string}
 */
function getAvatarName(avatars, index) {
    return String(avatars.GetValue(index));
}

/**
 * 从独立 TXT 文件加载简易策略，并筛选当前队伍中的角色。
 * @returns {string[]} 按策略文件顺序排列的当前队伍策略行
 */
function loadCurrentTeamStrategies() {
    const avatars = getAvatars();
    const currentNames = new Set();
    for (let i = 0; i < avatars.Length; i++) {
        currentNames.add(getAvatarName(avatars, i));
    }

    const strategies = [];
    const configuredNames = new Set();
    for (const strategyPath of PATHS.WATCHTOWER_STRATEGY_FILES) {
        if (!file.isFile(strategyPath)) {
            throw new Error(`哨塔简易策略文件不存在: ${strategyPath}`);
        }

        const lines = file.readTextSync(strategyPath).split(/\r?\n/);
        for (let lineNumber = 0; lineNumber < lines.length; lineNumber++) {
            const line = lines[lineNumber].trim();
            if (!line || line.startsWith("#") || line.startsWith("//")) continue;

            const match = line.match(/^(\S+)\s+(.+)$/);
            if (!match) {
                throw new Error(`哨塔简易策略格式错误: ${strategyPath}:${lineNumber + 1}`);
            }
            const avatarName = match[1];
            if (configuredNames.has(avatarName)) {
                throw new Error(`哨塔简易策略角色重复: ${avatarName}`);
            }
            configuredNames.add(avatarName);
            if (currentNames.has(avatarName)) {
                strategies.push(line);
            }
        }
    }

    if (strategies.length === 0) {
        throw new Error("当前队伍没有匹配到哨塔简易策略");
    }
    log.info("当前队伍匹配到 {count} 条哨塔简易策略", strategies.length);
    return strategies;
}

/**
 * 执行简易策略，直到委托描述中的摧毁数量增加、OCR 到“委托完成”或软超时。
 * @param {number|null} initialCount - 开始攻击前识别到的已摧毁数量
 * @param {string[]} strategies - 当前队伍匹配到的策略行
 * @returns {Promise<boolean>} 是否识别到摧毁进度更新
 */
async function attackUntilDestroyed(initialCount, strategies) {
    const startTime = Date.now();
    const fullScript = strategies.join("\n");
    const outputStrategy = strategies.find((line) => /\b(?:attack|charge)\s*\(/i.test(line));
    let firstRound = true;

    while (true) {
        const status = readDestroyStatus();
        if (status.completed) {
            log.info("识别到委托完成文本: {text}", status.completionText);
            return true;
        }
        if (status.progress && initialCount !== null && status.progress.current > initialCount) {
            log.info("哨塔摧毁进度已更新: {current}/{total}", status.progress.current, status.progress.total);
            return true;
        }

        if (Date.now() - startTime >= WATCHTOWER_CONFIG.attackTimeout) {
            log.warn("攻击哨塔超过 {seconds} 秒，判定软超时", WATCHTOWER_CONFIG.attackTimeout / 1000);
            return false;
        }

        const script = firstRound ? fullScript : (outputStrategy || fullScript);
        log.info("执行哨塔简易策略，共 {count} 行", script.split("\n").length);
        await dispatcher.RunCombatScript(script);
        firstRound = false;
    }
}

/**
 * 图标寻路会循环处理剩余哨塔；路径追踪只处理路径终点处的一座哨塔。
 * 每座哨塔均在到达后才切换近战角色并开始普通攻击。
 * @returns {Promise<boolean>} 是否成功处理到全屏无图标
 */
async function destroyAllWatchtowers(options, context) {
    let destroyedCount = 0;
    let attackStrategies = null;

    if (options.navigation === NAVIGATION_PATH) {
        const fullPath = context.resolveResource(options.path);
        log.info("使用路径追踪前往哨塔: {path}", fullPath);
        await pathingScript.runFile(fullPath);
        log.info("已到达路径终点，开始准备攻击哨塔");
    }

    while (destroyedCount < WATCHTOWER_CONFIG.maxDestroyCount &&
        (options.navigation === NAVIGATION_PATH ? destroyedCount === 0 : hasAnyBaseIcon())) {
        log.info("发现基础委托图标，开始处理第 {count} 个哨塔", destroyedCount + 1);

        if (options.navigation === NAVIGATION_ICON) {
            const approachResult = await approachWatchtower();
            if (approachResult === null) {
                return true;
            }
            if (!approachResult) {
                if (!hasAnyBaseIcon()) {
                    log.info("靠近过程中全屏基础委托图标已消失，结束摧毁哨塔步骤");
                    return true;
                }
                return false;
            }
        }

        const initialStatus = readDestroyStatus();
        const initialCount = initialStatus.progress ? initialStatus.progress.current : null;
        if (initialStatus.completed) return true;
        if (initialStatus.progress) {
            log.info("攻击前哨塔摧毁进度: {current}/{total}", initialStatus.progress.current, initialStatus.progress.total);
        } else {
            log.warn("攻击前未识别到哨塔摧毁进度，将继续等待委托完成提示");
        }

        if (!attackStrategies) {
            await genshin.returnMainUi();
            await sleep(500);
            attackStrategies = loadCurrentTeamStrategies();
        }

        if (!(await attackUntilDestroyed(initialCount, attackStrategies))) {
            return false;
        }

        destroyedCount++;
        await sleep(500);
    }

    if (destroyedCount >= WATCHTOWER_CONFIG.maxDestroyCount) {
        log.info("已达到最大摧毁次数 {count}，停止继续识别任务图标", WATCHTOWER_CONFIG.maxDestroyCount);
        return true;
    }

    log.info("全屏未识别到剩余基础委托图标，摧毁哨塔步骤完成，共处理 {count} 个", destroyedCount);
    return true;
}

export default defineStep({
    type: "摧毁哨塔",
    run: async (step, context) => {
        try {
            const options = resolveStepOptions(step);
            log.info("开始执行摧毁哨塔步骤，寻路方式: {navigation}", options.navigation);

            return await destroyAllWatchtowers(options, context);
        } catch (error) {
            if (isCancellationError(error)) throw error;
            log.error("执行摧毁哨塔步骤时出错: {error}", error.message);
            log.debug("详情: {error}", error.stack);
            throw error;
        }
    },
});
