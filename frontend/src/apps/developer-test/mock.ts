/**
 * 开发者测试页的本地开发响应。
 *
 * 数据仅用于验证级联和错误状态，不会进入生产构建。
 */
import type { TestOptions } from "@/apps/developer-test/types";

// 开发模式下覆盖 case、basic 和 npc 三种选择路径。
const options: TestOptions = {
    modes: ["case", "basic", "npc"],
    cases: ["流程校验测试", "交互步骤测试"],
    scopes: [
        { mode: "basic", country: "蒙德", commissionName: "示例委托", location: "城外", processFiles: ["process.json"] },
        { mode: "npc", country: "璃月", commissionName: "示例对话", location: "港口", processFiles: ["process.json", "branch.json"] },
    ],
};

// 根据页面请求返回稳定的开发数据。
export async function mockDeveloperTestRequest(url: string): Promise<unknown> {
    if (url === "/loadTestOptions") return options;
    if (url === "/runTest" || url === "/close") return { status: "ok" };
    return { status: "error", message: `未知请求：${url}` };
}
