// 流程编辑器开发模式后端，覆盖加载、目标探测、校验和保存。
import type { ProcessEditorInit, ProcessScope } from "@/apps/process-editor/types";

// Mock 范围用于验证现有流程级联。
const scope: ProcessScope = { country: "蒙德", typeDir: "NPC", commissionName: "示例委托", locationDir: "城外" };
// Mock 初始化元数据保留三类常用 data 形状。
const initial: ProcessEditorInit = {
    scopes: [scope],
    roles: ["示例角色"],
    recentFiles: [],
    processors: [
        { type: "等待", category: "流程控制", dataSpec: { kind: "number", label: "等待毫秒", default: 1000 } },
        { type: "地图追踪", category: "路径与定位", dataSpec: { kind: "string", label: "路径文件" } },
        { type: "自动战斗", category: "战斗与队伍", dataSpec: { kind: "object", optional: true, fields: {} } },
    ],
};

// 根据请求返回与 BetterGI 流程编辑器一致的开发响应。
export async function mockProcessEditorRequest(url: string, data: unknown): Promise<unknown> {
    // 请求对象仅用于回显流程内容和当前范围。
    const request = data as { scope?: ProcessScope; fileName?: string; content?: string };
    if (url === "/init") return initial;
    if (url === "/target") return { status: "ok", scope: request.scope ?? scope, path: "process/蒙德/NPC/示例委托/城外/process.json", exists: true, branches: [] };
    if (url === "/load") return { status: "ok", scope, path: "process/蒙德/NPC/示例委托/城外/process.json", exists: true, branches: [], recentFiles: [], content: "[]" };
    if (url === "/validate") return { status: "ok", errors: [], warnings: [] };
    if (url === "/save") return { status: "ok", scope: request.scope ?? scope, path: "process/蒙德/NPC/示例委托/城外/process.json", content: request.content ?? "[]", warnings: [] };
    if (url === "/recordPath") return { status: "saved", fileName: "recorded.json", scope: request.scope ?? scope };
    return { status: "ok" };
}
