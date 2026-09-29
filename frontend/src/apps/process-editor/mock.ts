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
        { type: "执行子流程", category: "流程控制", dataSpec: { kind: "object", fields: { path: { type: "string", label: "子流程文件", required: true } } } },
        { type: "自动战斗", category: "战斗与队伍", dataSpec: { kind: "object", optional: true, fields: {} } },
    ],
};

// 根据请求返回与 BetterGI 流程编辑器一致的开发响应。
export async function mockProcessEditorRequest(url: string, data: unknown): Promise<unknown> {
    // 请求对象仅用于回显流程内容和当前范围。
    const request = data as { scope?: ProcessScope; fileName?: string; content?: string; path?: string; reference?: string };
    // 浏览弹窗使用的虚构 process 目录树。
    const browseTree: Record<string, Array<{ name: string; directory: boolean }>> = {
        "": [{ name: "蒙德", directory: true }, { name: "枫丹", directory: true }, { name: "说明.txt", directory: false }],
        "蒙德": [{ name: "Basic", directory: true }, { name: "NPC", directory: true }],
        "蒙德/NPC": [{ name: "示例委托", directory: true }, { name: "风之委托", directory: true }],
        "蒙德/NPC/示例委托": [{ name: "城外", directory: true }, { name: "城中", directory: true }],
        "蒙德/NPC/示例委托/城外": [{ name: "process.json", directory: false }, { name: "_path.json", directory: false }, { name: "子流程.json", directory: false }],
        "蒙德/NPC/示例委托/城中": [{ name: "process.json", directory: false }],
        "蒙德/NPC/风之委托": [{ name: "原地", directory: true }],
        "蒙德/NPC/风之委托/原地": [{ name: "process.json", directory: false }],
        "蒙德/Basic": [{ name: "示例委托", directory: true }],
        "蒙德/Basic/示例委托": [{ name: "城外", directory: true }],
        "蒙德/Basic/示例委托/城外": [{ name: "process.json", directory: false }],
        "枫丹": [{ name: "NPC", directory: true }],
    };
    if (url === "/init") return initial;
    if (url === "/browse") {
        const path = request.path ?? "";
        return { status: "ok", path, entries: (browseTree[path] ?? []).map((entry) => ({ ...entry, path: path ? `${path}/${entry.name}` : entry.name })) };
    }
    if (url === "/target") {
        const targetScope = request.scope ?? scope;
        // 示例委托视为已存在，演示重复文件提示。
        return { status: "ok", scope: targetScope, path: "process/蒙德/NPC/示例委托/城外/process.json", exists: targetScope.commissionName === "示例委托", branches: [], subProcessOptions: [{ value: "sub-process.json", label: "sub-process.json" }] };
    }
    if (url === "/targetExists") {
        const targetScope = request.scope ?? scope;
        return { status: "ok", exists: targetScope.commissionName === "示例委托", path: "process/蒙德/NPC/示例委托/城外/process.json" };
    }
    if (url === "/load") return { status: "ok", scope, path: "process/蒙德/NPC/示例委托/城外/process.json", exists: true, branches: [], recentFiles: [], content: "[]" };
    if (url === "/validateAll") return { status: "ok", errors: [], warnings: [] };
    if (url === "/save") return { status: "ok", scope: request.scope ?? scope, path: "process/蒙德/NPC/示例委托/城外/process.json", content: request.content ?? "[]", warnings: [], recentFiles: [] };
    if (url === "/clearRecents") return { status: "ok", recentFiles: [] };
    if (url === "/recordPath") return { status: "saved", fileName: "recorded.json", scope: request.scope ?? scope };
    if (url === "/openSubprocess") {
        // 回显请求的子流程引用，保持与真实后端一致。
        const reference = request.reference ?? "sub-process.json";
        return { status: "ok", path: "process/蒙德/NPC/示例委托/城外/" + reference, reference, exists: true, content: "[]", subProcessOptions: [] };
    }
    if (url === "/nextSubprocess") return { status: "ok", name: "subprocess-2.json" };
    if (url === "/validateSubprocess") return { status: "ok", errors: [], warnings: [] };
    if (url === "/saveSubprocess") return { status: "ok", path: "process/蒙德/NPC/示例委托/城外/sub-process.json", content: request.content ?? "[]", warnings: [] };
    return { status: "ok" };
}
