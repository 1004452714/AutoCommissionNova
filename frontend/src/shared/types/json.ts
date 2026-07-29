// JSON 边界使用的递归数据类型，不允许携带函数或宿主对象。
export type JsonPrimitive = string | number | boolean | null;

// JSON 对象可包含的完整值集合。
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

// 业务 DTO 的通用可扩展对象边界。
export type DataRecord = Record<string, unknown>;
