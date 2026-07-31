/**
 * 路径录制器的稳定选项和点位转换。
 *
 * 本模块不发送宿主请求，供页面与测试共同使用。
 */
import type { CombatSyntax, MoveMode, PathPoint, PointType, RecorderSettings, RouteAuthor } from "@/apps/path-recorder/types";

// 点位类型同时提供后端值和中文显示名。
export const POINT_TYPES: Array<{ value: PointType; label: string }> = [
    { value: "teleport", label: "传送" }, { value: "path", label: "途经" },
    { value: "target", label: "目标" }, { value: "orientation", label: "朝向" },
];
// 移动方式保持 BetterGI 路径文件枚举。
export const MOVE_MODES: Array<{ value: MoveMode; label: string }> = [
    { value: "walk", label: "行走" }, { value: "dash", label: "间歇冲刺" },
    { value: "run", label: "持续奔跑" }, { value: "fly", label: "飞行" },
    { value: "swim", label: "游泳" }, { value: "climb", label: "攀爬" }, { value: "jump", label: "跳跃" },
];
// 动作选项覆盖后端允许的完整集合。
export const ACTION_GROUPS = [
    { label: "常用", items: [["", "无"], ["fight", "战斗"], ["combat_script", "简易策略脚本"], ["stop_flying", "下落攻击"], ["up_down_grab_leaf", "四叶印"], ["use_gadget", "使用小道具"]] },
    { label: "采集拾取", items: [["nahida_collect", "纳西妲长E采集"], ["mining", "挖矿"], ["linnea_mining", "莉奈娅挖矿"], ["fishing", "钓鱼"], ["pick_up_collect", "聚集材料"], ["pick_around", "在附近拾取"]] },
    { label: "元素采集", items: [["hydro_collect", "水元素力采集"], ["electro_collect", "雷元素力采集"], ["anemo_collect", "风元素力采集"], ["pyro_collect", "火元素力采集"]] },
    { label: "系统动作", items: [["force_tp", "强制传送"], ["log_output", "输出日志"], ["exit_and_relogin", "退出重新登录"], ["wonderland_cycle", "进出千星奇域"], ["set_time", "设置时间"]] },
] as const;
// 只有这些动作会向 BetterGI 发送动作参数。
export const PARAMETER_ACTIONS = new Set(["combat_script", "log_output", "stop_flying", "up_down_grab_leaf", "mining", "linnea_mining", "pick_up_collect", "pick_around", "use_gadget", "set_time"]);
// 新安装使用的快捷键和路线设置。
export const DEFAULT_SETTINGS: RecorderSettings = {
    addKey: "NumPad2", finishKey: "NumPad1", toggleKey: "Oem3",
    authors: [], mapMatchMethod: "TemplateMatch", combatScripts: [],
};

// 深拷贝后端点位，避免推送对象与表单共享不可控引用。
export function clonePoints(points: PathPoint[]): PathPoint[] {
    return points.map((point, index) => ({
        ...structuredClone(point),
        id: index + 1,
        x: Number(point.x), y: Number(point.y), type: point.type,
        move_mode: point.move_mode, action: point.action ?? "", action_params: point.action_params ?? "",
    }));
}

// 新建一个可直接由后端校验的坐标点。
export function createPoint(x = 0, y = 0, index = 0): PathPoint {
    return { id: index + 1, x, y, type: index === 0 ? "teleport" : "path", move_mode: "walk", action: "", action_params: "" };
}

// 重排后连续更新点位 id。
export function renumberPoints(points: PathPoint[]): PathPoint[] {
    return points.map((point, index) => ({ ...point, id: index + 1 }));
}

// 复制指定点位并插入原点位之后。
export function duplicatePoint(points: PathPoint[], index: number): PathPoint[] {
    if (!points[index]) return renumberPoints(points);
    const next = points.map((point) => ({ ...point }));
    next.splice(index + 1, 0, { ...points[index] });
    return renumberPoints(next);
}

// 切换动作时清空不兼容参数并填入默认简易策略。
export function changePointAction(point: PathPoint, action: string, settings: RecorderSettings): PathPoint {
    const changed = point.action !== action;
    const next = { ...point, action };
    if (changed || !PARAMETER_ACTIONS.has(action)) next.action_params = "";
    if (action === "combat_script" && !next.action_params.trim()) next.action_params = settings.combatScripts.find((script) => script.def)?.value ?? "";
    return next;
}

// 返回动作参数输入的业务提示。
export function actionParameterHint(action: string): string {
    // 提示与旧版参数语义保持一致。
    const hints: Record<string, string> = {
        combat_script: "输入简易策略，例如 keydown(w),wait(0.2),keyup(w)", log_output: "需要输出的日志",
        stop_flying: "下落攻击等待时间（毫秒）", up_down_grab_leaf: "方向 up 或 down（可选）", mining: "可填 disablePickupAround",
        set_time: "选择时间", linnea_mining: "射箭次数,旋转寻矿次数，例如 1,5", pick_up_collect: "可填角色或动作，例如 琴-短E",
        pick_around: "拾取轮数（正整数）", use_gadget: "最大等待秒数或 not_wait",
    };
    return hints[action] ?? "动作参数（可选）";
}

// 将兼容的一至两位小时和分钟转换为原生时间控件要求的 HH:MM。
export function timeControlValue(value: string): string {
    const match = /^(\d{1,2}):(\d{1,2})$/.exec(String(value || "").trim());
    if (!match) return "";
    const hour = Number(match[1]);
    const minute = Number(match[2]);
    if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return "";
    return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

// 根据已保存作者预设清理当前路线的失效作者。
export function reconcileRouteAuthors(authors: RouteAuthor[], settings: RecorderSettings): RouteAuthor[] {
    const available = new Map(settings.authors.map((author) => [`${author.name}\n${author.links}`, author]));
    return authors.flatMap((author) => {
        const matched = available.get(`${author.name}\n${author.links}`);
        return matched ? [{ name: matched.name, links: matched.links }] : [];
    });
}

// 从光标前文本生成方法或参数补全候选。
export function combatCompletions(source: string, cursor: number, syntax: CombatSyntax[]): Array<{ value: string; label: string; hint: string }> {
    const before = source.slice(0, cursor);
    const parameterMatch = before.match(/([\w\u4e00-\u9fff]+)\(([^,()]*)$/);
    if (parameterMatch) {
        const method = syntax.find((item) => item.code === parameterMatch[1] || item.aliases.includes(parameterMatch[1]));
        return (method?.params ?? []).filter((value) => value.toLowerCase().includes(parameterMatch[2].trim().toLowerCase())).map((value) => ({ value, label: value, hint: method?.hint ?? "" }));
    }
    const query = before.match(/[\w\u4e00-\u9fff]+$/)?.[0]?.toLowerCase() ?? "";
    return syntax.filter((item) => !query || [item.code, ...item.aliases].some((value) => value.toLowerCase().includes(query))).map((item) => ({ value: item.template, label: item.code, hint: item.hint }));
}
