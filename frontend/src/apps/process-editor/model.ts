/**
 * 流程编辑器的纯数据转换。
 *
 * 本模块负责默认步骤、JSON 草稿和诊断文字，不执行宿主请求。
 */
import type { DiagnosticResult, FieldSpec, ProcessStep, ProcessorMeta } from "@/apps/process-editor/types";

// 步骤类型之外的公共字段在类型转换时完整保留。
const COMMON_STEP_FIELDS = new Set(["type", "desc", "note", "loc", "retry", "retryOn"]);

// 克隆流程 JSON 值并解除 Vue 响应式代理。
export function cloneProcessValue<T>(value: T): T {
    return JSON.parse(JSON.stringify(value)) as T;
}

// 按声明式字段规范生成可编辑默认值。
function defaultField(spec: FieldSpec): unknown {
    if ("default" in spec) return cloneProcessValue(spec.default);
    const type = spec.type ?? spec.kind;
    if (type === "number") return 0;
    if (type === "boolean") return false;
    if (type === "array") return [];
    if (type === "object") return {};
    return "";
}

// 将未知输入收窄为可编辑普通对象。
export function editableRecord(value: unknown): Record<string, unknown> {
    return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

// 读取字符串或带显示名选项的实际值。
export function fieldOptionValue(option: string | { value: string; label: string }): string {
    return typeof option === "string" ? option : option.value;
}

// 根据字段类型解析输入并保留未声明对象字段。
export function coerceFieldValue(value: unknown, spec: FieldSpec): unknown {
    const type = spec.type ?? spec.kind;
    if (type === "number") {
        const numberValue = typeof value === "number" ? value : Number(value);
        if (!Number.isFinite(numberValue)) throw new Error(`${spec.label ?? "数值"}必须是有限数字`);
        if (spec.integer && !Number.isInteger(numberValue)) throw new Error(`${spec.label ?? "数值"}必须是整数`);
        if (spec.min !== undefined && numberValue < spec.min) throw new Error(`${spec.label ?? "数值"}不能小于 ${spec.min}`);
        if (spec.max !== undefined && numberValue > spec.max) throw new Error(`${spec.label ?? "数值"}不能大于 ${spec.max}`);
        return numberValue;
    }
    if (type === "boolean") return value === true || value === "true";
    if (type === "array") return Array.isArray(value) ? value : [];
    if (type === "object") return editableRecord(value);
    return String(value ?? "");
}

// 切换步骤类型时仅迁移新旧对象 dataSpec 共同声明的字段。
export function convertStepType(step: ProcessStep, previous: ProcessorMeta | undefined, next: ProcessorMeta): ProcessStep {
    // 公共字段和未知步骤级扩展字段不属于 dataSpec，必须继续透传。
    const converted = Object.fromEntries(Object.entries(step).filter(([name]) => name !== "data" && (COMMON_STEP_FIELDS.has(name) || name !== "type"))) as ProcessStep;
    converted.type = next.type;
    const previousSpec = previous?.dataSpec;
    const nextSpec = next.dataSpec;
    if (previousSpec?.kind === "object" && nextSpec.kind === "object") {
        const source = editableRecord(step.data);
        // 交集字段使用深拷贝，避免转换前后步骤共享嵌套引用。
        const shared = Object.fromEntries(Object.keys(nextSpec.fields ?? {})
            .filter((name) => Object.hasOwn(previousSpec.fields ?? {}, name) && Object.hasOwn(source, name))
            .map((name) => [name, cloneProcessValue(source[name])]));
        converted.data = { ...editableRecord(defaultStep(next).data), ...shared };
    } else {
        const initial = defaultStep(next);
        if (initial.data !== undefined) converted.data = initial.data;
    }
    return converted;
}

// 为新步骤生成后端能够继续校验的最小 data。
export function defaultStep(processor: ProcessorMeta): ProcessStep {
    // 步骤始终先保留唯一类型。
    const step: ProcessStep = { type: processor.type };
    // none 和可选 data 不强行写入空值。
    const spec = processor.dataSpec;
    if (spec.kind === "none" || spec.optional) return step;
    if (spec.kind === "object") {
        // 对象只生成必填字段或带默认值字段。
        const data = Object.fromEntries(Object.entries(spec.fields ?? {})
            .filter(([, field]) => field.required || "default" in field)
            .map(([name, field]) => [name, defaultField(field)]));
        step.data = data;
    } else if (spec.kind === "custom") {
        step.data = spec.editor === "key" ? "" : {};
    } else {
        step.data = defaultField(spec);
    }
    return step;
}

// 将选中步骤转换为表单可以安全编辑的 JSON 草稿。
export function stepToDraft(step: ProcessStep): { data: string; loc: string } {
    return {
        data: step.data === undefined ? "" : JSON.stringify(step.data, null, 4),
        loc: step.loc === undefined ? "" : JSON.stringify(step.loc, null, 4),
    };
}

// 解析可选 JSON 字段，空文本表示删除该字段。
export function parseOptionalJson(source: string, label: string): unknown {
    if (!source.trim()) return undefined;
    try {
        return JSON.parse(source) as unknown;
    } catch (error) {
        throw new Error(`${label} JSON 格式错误：${error instanceof Error ? error.message : String(error)}`, { cause: error });
    }
}

// 将后端错误和警告合成为紧凑状态文字。
export function diagnosticText(result: DiagnosticResult, successText = "校验通过"): string {
    // 错误和警告分别保留标题，方便 BetterGI 中快速定位。
    const sections: string[] = [];
    if (result.errors?.length) sections.push(`错误：\n${result.errors.join("\n")}`);
    if (result.warnings?.length) sections.push(`警告：\n${result.warnings.join("\n")}`);
    return sections.join("\n") || result.message || successText;
}
