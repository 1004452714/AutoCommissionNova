/**
 * 委托地址识别公共工具
 */
import { calculateDistance, findCommissionTarget } from "../navigation/index.js";

const DEFAULT_LOC_TOLERANCE = 15;

function isFiniteNumber(value) {
    return typeof value === "number" && Number.isFinite(value);
}

/**
 * 解析 step.loc 通用条件字段。
 * loc 格式：[x, y] 或 [x, y, tolerance]，tolerance 默认 15。
 * @param {any} loc
 * @returns {{present: false, ok: true} | {present: true, ok: true, value: {x: number, y: number, tolerance: number}} | {present: true, ok: false, error: string}}
 */
export function parseStepLoc(loc) {
    if (loc === undefined) {
        return { present: false, ok: true };
    }
    if (!Array.isArray(loc)) {
        return { present: true, ok: false, error: "loc 必须是数组格式 [x, y] 或 [x, y, tolerance]" };
    }
    if (loc.length !== 2 && loc.length !== 3) {
        return { present: true, ok: false, error: "loc 必须包含 2 或 3 个元素：[x, y] 或 [x, y, tolerance]" };
    }
    if (!isFiniteNumber(loc[0]) || !isFiniteNumber(loc[1])) {
        return { present: true, ok: false, error: "loc 前两个元素必须是数字坐标 x 和 y" };
    }

    const tolerance = loc.length === 3 ? loc[2] : DEFAULT_LOC_TOLERANCE;
    if (!isFiniteNumber(tolerance)) {
        return { present: true, ok: false, error: "loc 第三个元素 tolerance 必须是数字" };
    }

    return {
        present: true,
        ok: true,
        value: { x: loc[0], y: loc[1], tolerance },
    };
}

/**
 * 检测当前委托目标位置是否命中指定坐标。
 * @param {{x: number, y: number, tolerance: number}} target
 * @param {Object} context
 * @param {string} label - 日志标签
 * @returns {Promise<boolean>}
 */
export async function detectCommissionLocation(target, context, label = "地址检测") {
    const { x: targetX, y: targetY, tolerance } = target;

    log.info(label + ": 目标({x}, {y}), 容差: {tolerance}",
        Math.round(targetX), Math.round(targetY), Math.round(tolerance));

    const commissionTarget = await findCommissionTarget(context.commissionName);
    if (!commissionTarget) {
        log.warn("无法获取委托目标位置，" + label + "失败");
        context.locationDetected = false;
        return false;
    }

    const distance = calculateDistance(commissionTarget, { x: targetX, y: targetY });
    log.info(label + " - 委托位置: ({x}, {y}), 目标位置: ({tx}, {ty}), 距离: {d}",
        Math.round(commissionTarget.x),
        Math.round(commissionTarget.y),
        Math.round(targetX),
        Math.round(targetY),
        Math.round(distance));

    if (distance >= tolerance) {
        log.info(label + "失败，距离过远: {distance}", Math.round(distance));
        context.locationDetected = false;
        return false;
    }

    log.info(label + "成功，距离在容差范围内");
    context.locationDetected = true;
    context.detectedPosition = commissionTarget;
    return true;
}

/**
 * 判断带 loc 的 step 是否应执行。
 * loc 采用坐标距离匹配：[x, y] 或 [x, y, tolerance]，容差默认 15。
 * @param {Object} step
 * @param {Object} context
 * @returns {Promise<boolean>}
 */
export async function shouldExecuteStepByLoc(step, context) {
    const parsed = parseStepLoc(step.loc);
    if (!parsed.present) return true;

    if (!parsed.ok) {
        log.error("步骤 loc 配置错误，跳过步骤: {error}", parsed.error);
        context.locationDetected = false;
        return false;
    }

    const matched = await detectCommissionLocation(parsed.value, context, "步骤 loc 地址检测");
    if (!matched) {
        log.info("步骤 loc 不匹配，跳过步骤。目标({x}, {y}), 容差: {tolerance}",
            Math.round(parsed.value.x),
            Math.round(parsed.value.y),
            Math.round(parsed.value.tolerance));
    }
    return matched;
}
