import { requestHtmlMask, unwrapBridgeData } from "@/shared/bridge/html-mask";

describe("htmlMask bridge", () => {
    it("unwraps native and legacy response layers", () => {
        // 原生响应包含 URL、请求标识和 data 包装。
        const native = { url: "/__response__", requestId: "r1", data: { status: "ok" } };
        expect(unwrapBridgeData<{ status: string }>(native)).toEqual({ status: "ok" });
        // 旧响应可能在 data 内再次携带请求包装。
        const legacy = { url: "/response", data: { requestId: "r2", data: { value: 3 } } };
        expect(unwrapBridgeData<{ value: number }>(legacy)).toEqual({ value: 3 });
    });

    it("requests the host with typed data", async () => {
        // 测试宿主回显请求 URL，验证适配器没有改变协议。
        window.htmlMask = {
            onMessage: null,
            request: async (url) => ({ url: "/__response__", requestId: "r1", data: { value: url } }),
        };
        await expect(requestHtmlMask<{ value: string }>("/init", {})).resolves.toEqual({ value: "/init" });
    });
});
