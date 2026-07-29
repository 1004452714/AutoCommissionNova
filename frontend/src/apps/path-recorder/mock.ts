// 路径录制器开发后端，支持基本录制、点位同步和保存工作流。
import { DEFAULT_SETTINGS, createPoint } from "@/apps/path-recorder/model";
import type { PathPoint, RecorderState } from "@/apps/path-recorder/types";

// Mock 会话在开发请求间保存点位和阶段。
const state: RecorderState = {
    phase: "idle", settings: structuredClone(DEFAULT_SETTINGS), points: [], sampling: false, running: false,
    displayMode: "normal", suggestedFileName: "未命名路线.json", routeAuthors: [], routeMapMatchMethod: "TemplateMatch",
};

// 根据前端请求推进本地录制状态。
export async function mockPathRecorderRequest(url: string, data: unknown): Promise<unknown> {
    // 点位请求体用于同步开发页面编辑。
    const request = data as { points?: PathPoint[]; index?: number; active?: boolean };
    if (url === "/init") return state;
    if (url === "/start") { state.phase = "recording"; state.points = [createPoint(100, 200, 0)]; return state; }
    if (url === "/sample") { state.points.push(createPoint(100 + state.points.length, 200 + state.points.length, state.points.length)); return { status: "ok" }; }
    if (url === "/finish") { state.phase = "stopped"; return state; }
    if (url === "/points") { state.points = request.points ?? []; state.phase = state.points.length ? "stopped" : "idle"; return { status: "ok", phase: state.phase }; }
    if (url === "/resample") return { status: "ok", points: state.points };
    if (url === "/settings") return { status: "ok", settings: data };
    if (url === "/save") { state.phase = "saved"; return { status: "ok", path: "pathing/未命名路线.json", fileName: "未命名路线.json" }; }
    if (url === "/runFromPoint") return { status: "ok", running: true, displayMode: "compact" };
    return { status: "ok" };
}
