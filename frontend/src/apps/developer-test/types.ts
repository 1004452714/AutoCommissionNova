// 开发者测试页从 BetterGI 读取的委托范围。
export interface TestScope {
    mode: "basic" | "npc";
    country: string;
    commissionName: string;
    location: string;
    processFiles: string[];
}

// 开发者测试页初始化选项。
export interface TestOptions {
    modes: Array<"case" | "basic" | "npc">;
    scopes: TestScope[];
    cases: string[];
}

// BetterGI 接受的测试配置。
export type TestConfig =
    | { mode: "case"; caseName: string; branchCondition: unknown }
    | { mode: "basic" | "npc"; country: string; commissionName: string; location: string; processFile: string };

// 通用操作响应。
export interface OperationResult {
    status: "ok" | "error";
    message?: string;
}
