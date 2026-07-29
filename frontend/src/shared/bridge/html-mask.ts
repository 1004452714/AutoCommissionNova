/**
 * BetterGI htmlMask 的浏览器侧通信适配器。
 *
 * 本模块只处理传输、响应兼容和订阅生命周期，不持有页面业务状态。
 */
import type { DataRecord } from "@/shared/types/json";

// BetterGI 推送到页面的统一消息结构。
export interface HtmlMaskMessage<T = unknown> {
    url: string;
    data?: T;
    requestId?: string;
}

// BetterGI 注入对象及当前版本保留的请求回调字段。
export interface HtmlMaskHost {
    request: (url: string, data: unknown) => Promise<unknown> | unknown;
    onMessage: ((message: HtmlMaskMessage) => unknown) | null;
    _seq?: number;
    _callbacks?: Record<string, { resolve: (value: unknown) => void; reject: (reason: unknown) => void }>;
}

declare global {
    interface Window {
        htmlMask?: HtmlMaskHost;
    }
}

// 将未知异常转为可直接展示的错误实例。
export function toError(error: unknown, fallback = "操作失败"): Error {
    if (error instanceof Error) return error;
    if (typeof error === "string" && error.trim()) return new Error(error);
    return new Error(fallback);
}

// 逐层解开 BetterGI 新旧版本产生的 data 响应包装。
export function unwrapBridgeData<T>(response: unknown): T {
    // 当前待解包值最多向内展开三层，避免业务对象恰有 data 字段时被误拆。
    let value = response;
    for (let depth = 0; depth < 3; depth += 1) {
        if (typeof value === "string") {
            try {
                value = JSON.parse(value) as unknown;
                continue;
            } catch {
                break;
            }
        }
        if (!value || typeof value !== "object" || Array.isArray(value)) break;
        // 包含请求标识或响应 URL 的对象属于桥接包装层。
        const record = value as DataRecord;
        if ((typeof record.requestId === "string" || typeof record.url === "string") && "data" in record) {
            value = record.data;
            continue;
        }
        break;
    }
    return value as T;
}

// 向 BetterGI 发起带超时和旧回调清理的类型化请求。
export async function requestHtmlMask<TResponse, TRequest = DataRecord>(
    url: string,
    data: TRequest,
    timeoutMs = 10000,
): Promise<TResponse> {
    // 当前窗口的宿主桥接由 BetterGI 在页面创建前注入。
    const host = window.htmlMask;
    if (!host || typeof host.request !== "function") throw new Error("当前环境不支持 htmlMask");
    // 预测请求标识只用于超时后清理宿主遗留回调。
    const requestId = typeof host._seq === "number" ? `__req_${host._seq + 1}` : "";
    // 定时句柄确保无响应时页面可以恢复交互。
    let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
    try {
        // 原生请求可能同步抛错，也可能返回 Promise。
        const nativeRequest = Promise.resolve(host.request(url, data));
        if (timeoutMs <= 0) return unwrapBridgeData<TResponse>(await nativeRequest);
        // 超时 Promise 与宿主响应竞争，避免永久挂起。
        const timeoutRequest = new Promise<never>((_, reject) => {
            timeoutHandle = setTimeout(() => reject(new Error(`请求超时：${url}`)), timeoutMs);
        });
        return unwrapBridgeData<TResponse>(await Promise.race([nativeRequest, timeoutRequest]));
    } catch (error) {
        throw toError(error);
    } finally {
        if (timeoutHandle) clearTimeout(timeoutHandle);
        if (requestId && host._callbacks?.[requestId]) delete host._callbacks[requestId];
    }
}

// 注册页面唯一的宿主推送处理器，并返回精确的卸载函数。
export function subscribeHtmlMask(handler: (message: HtmlMaskMessage) => void): () => void {
    // 注册时捕获宿主，避免窗口对象被开发 Mock 替换后误清理。
    const host = window.htmlMask;
    if (!host) return () => undefined;
    // 包装器隔离处理器异常，避免打断宿主消息分发。
    const listener = (message: HtmlMaskMessage): void => {
        try {
            handler(message);
        } catch (error) {
            console.error("处理 htmlMask 推送失败", error);
        }
    };
    host.onMessage = listener;
    return () => {
        if (host.onMessage === listener) host.onMessage = null;
    };
}
