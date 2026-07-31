// 路径点类型。
export type PointType = "teleport" | "path" | "target" | "orientation";

// 点位移动方式。
export type MoveMode = "walk" | "dash" | "run" | "fly" | "swim" | "climb" | "jump";

// BetterGI 路径点编辑结构。
export interface PathPoint {
    id: number;
    x: number;
    y: number;
    type: PointType;
    move_mode: MoveMode;
    action: string;
    action_params: string;
    // BetterGI 新增的点位扩展字段在编辑和保存期间保持透传。
    [key: string]: unknown;
}

// 路线作者信息。
export interface RouteAuthor {
    name: string;
    links: string;
    def?: boolean;
}

// 可复用的简易策略预设。
export interface CombatScript {
    name: string;
    value: string;
    def?: boolean;
}

// 路径录制器持久化设置。
export interface RecorderSettings {
    addKey: string;
    finishKey: string;
    toggleKey: string;
    authors: RouteAuthor[];
    mapMatchMethod: "TemplateMatch" | "SIFT";
    combatScripts: CombatScript[];
}

// 简易策略脚本方法的补全元数据。
export interface CombatSyntax {
    code: string;
    aliases: string[];
    params?: string[];
    template: string;
    hint: string;
}

// 录制器服务端会话视图。
export interface RecorderState {
    phase: "idle" | "recording" | "stopped" | "saved";
    settings: RecorderSettings;
    points: PathPoint[];
    sampling: boolean;
    running: boolean;
    displayMode: "normal" | "compact" | "compact-edit";
    suggestedFileName: string;
    targetDir?: string;
    commissionMode?: boolean;
    routeAuthors?: RouteAuthor[];
    routeMapMatchMethod?: "TemplateMatch" | "SIFT";
    combatSyntax?: CombatSyntax[];
    warning?: string;
    message?: string;
    error?: string;
}

// 录制器通用操作响应。
export interface RecorderResult {
    status: "ok" | "error" | "saved";
    message?: string;
    path?: string;
    fileName?: string;
    phase?: RecorderState["phase"];
    settings?: RecorderSettings;
    points?: PathPoint[];
    running?: boolean;
    displayMode?: RecorderState["displayMode"];
}
