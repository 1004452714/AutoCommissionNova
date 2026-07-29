// 流程目录的稳定定位信息。
export interface ProcessScope {
    country: string;
    typeDir: "Basic" | "NPC";
    commissionName: string;
    locationDir: string;
}

// 最近打开的流程记录。
export interface RecentProcess {
    scope: ProcessScope;
    fileName: string;
    path: string;
}

// 声明式数据字段规范。
export interface FieldSpec {
    type?: "string" | "number" | "boolean" | "object" | "array";
    kind?: "none" | "string" | "number" | "boolean" | "object" | "array" | "custom";
    label?: string;
    hint?: string;
    default?: unknown;
    required?: boolean;
    optional?: boolean;
    alwaysVisible?: boolean;
    nonEmpty?: boolean;
    integer?: boolean;
    min?: number;
    max?: number;
    minItems?: number;
    maxItems?: number;
    additionalProperties?: boolean;
    options?: Array<string | { value: string; label: string }>;
    fields?: Record<string, FieldSpec>;
    items?: FieldSpec;
    editor?: "key" | "roles" | "waves" | "branches" | string;
    resource?: string;
    [key: string]: unknown;
}

// 步骤处理器供编辑器使用的元数据。
export interface ProcessorMeta {
    type: string;
    category: string;
    dataSpec: FieldSpec;
}

// 流程中的单个步骤，未知扩展字段保持透传。
export interface ProcessStep {
    type: string;
    data?: unknown;
    note?: string;
    desc?: string;
    loc?: unknown;
    retry?: number;
    retryOn?: "throw" | "return-false" | "all";
    [key: string]: unknown;
}

// 流程编辑器初始化数据。
export interface ProcessEditorInit {
    scopes: ProcessScope[];
    processors: ProcessorMeta[];
    roles: string[];
    recentFiles: RecentProcess[];
}

// 目标路径探测响应。
export interface TargetResult {
    status: "ok" | "error";
    message?: string;
    scope: ProcessScope;
    path: string;
    exists: boolean;
    branches: Array<{ key: string; label: string }>;
}

// 流程读取响应。
export interface LoadResult extends TargetResult {
    content: string;
    recentFiles: RecentProcess[];
}

// 流程诊断响应。
export interface DiagnosticResult {
    status: "ok" | "warning" | "error";
    message?: string;
    errors?: string[];
    warnings?: string[];
}

// 流程保存响应。
export interface SaveResult extends DiagnosticResult {
    path: string;
    content: string;
    scope: ProcessScope;
}

// 路径录制器返回的流程步骤数据。
export interface RecordPathResult {
    status: "saved" | "ok" | "error";
    fileName?: string;
    message?: string;
    scope?: ProcessScope;
}
