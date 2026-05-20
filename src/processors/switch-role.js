/**
 * 切换角色步骤处理器
 *
 * 流程：
 *   1. 解析并校验 step.data → roles 数组
 *   2. 预读 avatar_info.json + 头像模板目录，任一 role 缺资源就直接 return false，
 *      避免后面打开 UI 后才暴露问题、留下半成品界面
 *   3. 打开队伍配置 → 清空 4 个槽位
 *   4. 对每个 role：打开筛选 → 选元素 + 武器 → SIFT 在头像网格里找到角色并点击 → 清除筛选
 *   5. 保存配置并返回主界面
 */
import { PATHS, UI_REGIONS } from "../config/index.js";
import { defineStep } from "./define-step.js";
import { isCancellationError } from "../utils/error-utils.js";
import { matchSift } from "../vision/sift.js";
const page = new BvPage();

/** SIFT 在头像网格里找角色的最大尝试轮数，超过则放弃此角色避免死循环 */
const MAX_SIFT_ATTEMPTS = 5;
/** 每轮 SIFT 之间的间隔（ms），给 UI 一点时间稳定 */
const SIFT_RETRY_INTERVAL = 500;

/** 元素类型 → 筛选面板内的点击坐标 */
const ELEMENT_CLICK_MAP = {
    "火元素": { x: 70, y: 200 }, "水元素": { x: 450, y: 200 },
    "草元素": { x: 70, y: 290 }, "雷元素": { x: 450, y: 290 },
    "风元素": { x: 70, y: 380 }, "冰元素": { x: 450, y: 380 },
    "岩元素": { x: 70, y: 470 },
};

/** 武器类型 → 筛选面板内的点击坐标 */
const WEAPON_CLICK_MAP = {
    "单手剑": { x: 70, y: 610 }, "双手剑": { x: 450, y: 610 },
    "弓":     { x: 70, y: 700 }, "长柄武器": { x: 450, y: 700 },
    "法器":   { x: 70, y: 790 },
};

/**
 * 解析 step.data → 排序后的角色数组 [{num, name}]
 * 任何校验失败一律返回 null，由调用方 return false（不抛错）
 */
function parseRoles(data) {
    if (!data || typeof data !== "object" || Array.isArray(data)) {
        log.warn("切换角色步骤需要对象格式的 data");
        return null;
    }
    const entries = Object.entries(data);
    if (entries.length === 0) {
        log.warn("切换角色步骤没有指定任何角色");
        return null;
    }
    if (entries.length > 4) {
        log.warn("切换角色步骤最多只能指定 4 个角色，当前指定了 {count} 个", entries.length);
        return null;
    }
    const seen = new Set();
    const roles = [];
    for (const [key, name] of entries) {
        const num = Number(key);
        if (!Number.isInteger(num) || num < 1 || num > 4 || String(num) !== key) {
            log.warn("角色键必须是 1-4 的数字字符串，当前键: {key}", key);
            return null;
        }
        if (seen.has(num)) {
            log.warn("角色键不能重复，重复的键: {key}", key);
            return null;
        }
        if (typeof name !== "string" || !name) {
            log.warn("角色 {key} 的名称无效", key);
            return null;
        }
        seen.add(num);
        roles.push({ num, name });
    }
    return roles.sort((a, b) => a.num - b.num);
}

/** 读取 avatar_info.json 并解析 */
function loadAvatarInfo() {
    const text = file.readTextSync(PATHS.AVATAR_INFO);
    return JSON.parse(text);
}

/**
 * 预加载并校验所有 role 所需资源（avatarInfo + 头像模板图）
 * 任一缺失都直接返回 null —— 让调用方在打开 UI 之前 return false，避免留下半成品界面
 * @returns {Array<{role, avatarData, templatePaths: string[]}> | null}
 */
function prepareRoleResources(roles) {
    const avatarInfo = loadAvatarInfo();
    const missing = [];
    const resources = [];
    for (const role of roles) {
        const avatarData = avatarInfo[role.name];
        if (!avatarData) {
            missing.push(`${role.name}(avatarInfo)`);
            continue;
        }
        let templatePaths = [];
        try {
            templatePaths = Array.from(file.readPathSync(`${PATHS.AVATAR_TEMPLATE_DIR}/${role.name}`) || []);
        } catch (err) {
            log.debug("读取 {name} 模板目录失败: {error}", role.name, err.message);
        }
        if (templatePaths.length === 0) {
            missing.push(`${role.name}(头像模板图)`);
            continue;
        }
        resources.push({ role, avatarData, templatePaths });
    }
    if (missing.length > 0) {
        log.error("以下角色资源缺失，已跳过整个切换: {names}", missing.join(", "));
        return null;
    }
    return resources;
}

/**
 * 进入队伍配置 → 切到角色列表
 *   按 L 打开队伍配置（若提示当前状态不可配置，传送到神像后重试）
 *   等"队伍配置"标题 → 点击"快速编队" → 等"元素共鸣"出现表示已切到角色列表
 */
async function openTeamConfigPage() {
    const mainUIMat = file.readImageMatSync(PATHS.PAIMON_MENU_IMAGE);
    try {
        const mainUIRo = RecognitionObject.TemplateMatch(mainUIMat);
        await page.locator(mainUIRo).withRetryAction(async () => {
            keyPress("l");
            await sleep(500);
            if (page.locator("当前状态不可进行队伍配置", UI_REGIONS.TEAM_DISABLED_HINT).isExist()) {
                log.warn("当前状态不可进行队伍配置，传送到神像后重试");
                await genshin.tpToStatueOfTheSeven();
            }
        }).waitForDisappear();
        await page.locator("队伍配置", UI_REGIONS.TEAM_CONFIG_TITLE).waitFor();
        await page.locator("元素共鸣", UI_REGIONS.TEAM_ELEMENT_RESONANCE).withRetryAction(async () => {
            await page.locator("快速编队", UI_REGIONS.TEAM_QUICK_FORMATION).click();
        }).waitFor();
    } finally {
        mainUIMat.Dispose();
    }
}

/** 依次点击对应队员槽位将其移出队伍 */
async function clearTeamSlots(roles) {
    for (const role of roles) {
        const slotMat = file.readImageMatSync(`${PATHS.SWITCH_ROLE_SLOT_DIR}/${role.num}.png`);
        try {
            const slotRo = RecognitionObject.TemplateMatch(slotMat);
            await page.locator(slotRo).click();
        } finally {
            slotMat.Dispose();
        }
    }
}

/**
 * 在筛选面板中按 元素 + 武器 筛选，再 SIFT 在头像网格里找到角色头像并点击
 * 找不到时最多尝试 MAX_SIFT_ATTEMPTS 轮，避免死循环；放弃后清除筛选给下一个角色让路
 *
 * @returns {Promise<boolean>} 是否找到并点击成功
 */
async function filterAndPickAvatar(role, avatarData, templatePaths) {
    log.info("切换角色: {num}. {name} - 武器: {weapon}, 元素: {element}",
        role.num, role.name, avatarData.Weapon, avatarData.VisionBefore);

    // 打开筛选菜单
    await page.locator("筛选", UI_REGIONS.FILTER_BUTTON)
        .withRetryAction(() => { click(50, 40); })
        .waitFor();

    // 点击元素类型（通过底部白色 tag 是否出现来判断是否生效）
    await page.locator(avatarData.VisionBefore, UI_REGIONS.FILTER_ELEMENT_TAG)
        .withRetryInterval(350)
        .withRetryAction(async () => {
            const p = ELEMENT_CLICK_MAP[avatarData.VisionBefore];
            click(p.x, p.y);
        })
        .waitFor();

    // 点击武器类型
    await page.locator(avatarData.Weapon, UI_REGIONS.FILTER_WEAPON_TAG)
        .withRetryInterval(350)
        .withRetryAction(async () => {
            const p = WEAPON_CLICK_MAP[avatarData.Weapon];
            click(p.x, p.y);
        })
        .waitFor();

    // 确认筛选
    await page.locator("确认筛选", new OpenCvSharp.OpenCvSharp.Rect(360, 999, 128, 40)).clickUntilDisappears();

    // SIFT 在头像网格里找角色（templatePaths 已在主流程预校验，必非空）
    let found = false;
    for (let attempt = 0; attempt < MAX_SIFT_ATTEMPTS && !found; attempt++) {
        if (attempt > 0) {
            log.debug("角色 {name} SIFT 第 {n}/{max} 轮尝试", role.name, attempt + 1, MAX_SIFT_ATTEMPTS);
            await sleep(SIFT_RETRY_INTERVAL);
        }
        for (const templatePath of templatePaths) {
            const templateMat = file.readImageMatSync(templatePath);
            try {
                const result = await matchSift(templateMat, UI_REGIONS.AVATAR_GRID, { maxInstances: 1, scale: 1 });
                if (result.length > 0) {
                    const r = result[0];
                    log.debug("找到角色 {name} (score={score})", role.name, r.score.toFixed(3));
                    click(Math.round(r.center.x), Math.round(r.center.y));
                    found = true;
                    break;
                }
                log.debug("未找到角色 {name} (template={path})", role.name, templatePath);
            } catch (err) {
                if (isCancellationError(err)) throw err;
                log.warn("SIFT 匹配角色 {name} 出错: {error}", role.name, err.message);
            } finally {
                try { templateMat.Dispose(); } catch (e) { }
            }
        }
    }
    if (!found) {
        log.error("角色 {name} 在 {max} 轮尝试后仍未找到，跳过此角色", role.name, MAX_SIFT_ATTEMPTS);
    }

    // 无论成功失败，都清除筛选
    await page.locator("清除", UI_REGIONS.FILTER_CLEAR_BUTTON).ClickUntilDisappears();
    return found;
}

export default defineStep({
    type: "切换角色",
    run: async (step, context) => {
        try {
            const roles = parseRoles(step.data);
            if (!roles) return false;

            log.info("开始切换角色，共 {count} 个角色", roles.length);

            // 预校验：所有 role 必须有 avatarInfo 和头像模板图，缺一个就直接退出
            const resources = prepareRoleResources(roles);
            if (!resources) return false;

            await openTeamConfigPage();
            await clearTeamSlots(roles);

            for (const { role, avatarData, templatePaths } of resources) {
                await filterAndPickAvatar(role, avatarData, templatePaths);
            }
            await page.locator("保存配置", new OpenCvSharp.OpenCvSharp.Rect(360, 999, 128, 40)).clickUntilDisappears();
            await genshin.returnMainUi();
            return true;
        } catch (error) {
            if (isCancellationError(error)) throw error;
            log.error("执行切换角色步骤时出错: {error}", error.message);
            log.debug("详情: {error}", error.stack);
            throw error;
        }
    },
});
