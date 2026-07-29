/**
 * 开发服务器使用的 htmlMask 模拟器。
 *
 * 模拟器只接受页面提供的处理函数，生产构建会移除对应动态导入分支。
 */
import type { HtmlMaskHost, HtmlMaskMessage } from "@/shared/bridge/html-mask";

// 安装轻量宿主模拟器并返回主动推送方法。
export function installMockHtmlMask(
    requestHandler: (url: string, data: unknown) => unknown | Promise<unknown>,
): (message: HtmlMaskMessage) => void {
    // 递增序号保持开发行为与 BetterGI 请求标识一致。
    let sequence = 0;
    // 模拟宿主仅实现页面实际依赖的请求和推送字段。
    const host: HtmlMaskHost = {
        _seq: sequence,
        _callbacks: {},
        onMessage: null,
        request: async (url, data) => {
            sequence += 1;
            host._seq = sequence;
            return {
                url: "/__response__",
                requestId: `__req_${sequence}`,
                data: await requestHandler(url, data),
            };
        },
    };
    window.htmlMask = host;
    return (message) => host.onMessage?.(message);
}
