/**
 * Basic 攀高危险 - 摧毁哨塔步骤处理器
 */
import { PATHS } from "../config/index.js";
import { RO } from "../vision/index.js";
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
    /** 攻击阶段超时时间（毫秒）：超过后中心图标仍未消失则返回失败。 */ 
    attackTimeout: 30 * 1000,
    /** 普攻间隔（毫秒）：每轮检测中心图标后，若图标仍存在则点击一次普攻。 */
    attackInterval: 300,
    /** 单次前进时长（毫秒）：视角对准图标后按住 W 前进的时间。 */
    forwardMs: 600,
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

const MELEE_WEAPONS = ["单手剑", "双手剑", "长柄武器"];

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
 * 读取角色信息配置。
 * @returns {Object}
 */
function loadAvatarInfo() {
    return JSON.parse(file.readTextSync(PATHS.AVATAR_INFO));
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
 * 回到主界面，读取当前队伍并切换到第一个近战武器角色。
 * @returns {Promise<boolean>} 是否成功切换
 */
async function switchToMeleeAvatar() {
    await genshin.returnMainUi();
    await sleep(500);

    const avatars = getAvatars();
    const avatarCount = avatars.Length;
    const avatarInfo = loadAvatarInfo();
    let target = null;

    for (let i = 0; i < avatarCount; i++) {
        const name = getAvatarName(avatars, i);
        const info = avatarInfo[name];
        if (!info) {
            log.warn("未在 avatar_info.json 中找到角色: {name}", name);
            continue;
        }
        log.debug("第 {index} 个角色为 {name}，武器: {weapon}", i + 1, name, info.Weapon);
        if (!target && MELEE_WEAPONS.includes(info.Weapon)) {
            target = { index: i + 1, name, weapon: info.Weapon };
        }
    }

    if (!target) {
        log.error("当前队伍未找到单手剑/双手剑/长柄武器角色");
        return false;
    }

    log.info("切换到近战角色: {name} ({weapon})，队伍序号: {index}", target.name, target.weapon, target.index);
    keyPress(String(target.index));
    await sleep(800);
    return true;
}

/**
 * 判断 RO.iconBase 限定区域内是否存在基础委托图标。
 * @returns {boolean}
 */
function hasCenterBaseIcon() {
    const cap = captureGameRegion();
    try {
        const iconRes = cap.Find(RO.iconBase);
        return iconRes.isExist();
    } finally {
        cap.Dispose();
    }
}

/**
 * 持续普通攻击，直到中心窄区域内的任务图标连续消失。
 * @returns {Promise<boolean>} 是否成功打到图标消失
 */
async function attackUntilCenterIconDisappear() {
    const startTime = Date.now();
    let missingCount = 0;
    while (Date.now() - startTime < WATCHTOWER_CONFIG.attackTimeout) {
        const exists = hasCenterBaseIcon();
        if (!exists) {
            missingCount++;
            if (missingCount >= 3) {
                log.info("正前方任务图标已消失，停止攻击");
                return true;
            }
        } else {
            missingCount = 0;
            leftButtonClick();
        }
        await sleep(WATCHTOWER_CONFIG.attackInterval);
    }

    log.warn("攻击哨塔超时");
    return false;
}

/**
 * 循环摧毁所有识别到图标的哨塔。
 * 每轮先全屏确认仍有图标，再靠近当前目标并攻击，直到中心限定区域图标消失；
 * 当前目标消失后继续下一轮，直到全屏找不到图标或达到 maxDestroyCount。
 * @returns {Promise<boolean>} 是否成功处理到全屏无图标
 */
async function destroyAllWatchtowers() {
    let switchedToMelee = false;
    let destroyedCount = 0;

    while (destroyedCount < WATCHTOWER_CONFIG.maxDestroyCount && hasAnyBaseIcon()) {
        log.info("发现基础委托图标，开始处理第 {count} 个哨塔", destroyedCount + 1);

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

        if (!switchedToMelee) {
            if (!(await switchToMeleeAvatar())) {
                return false;
            }
            switchedToMelee = true;
        }

        if (!(await attackUntilCenterIconDisappear())) {
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
    run: async () => {
        try {
            log.info("开始执行摧毁哨塔步骤");

            return await destroyAllWatchtowers();
        } catch (error) {
            if (isCancellationError(error)) throw error;
            log.error("执行摧毁哨塔步骤时出错: {error}", error.message);
            log.debug("详情: {error}", error.stack);
            throw error;
        }
    },
});
