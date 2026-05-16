/**
 * 委托分支配置编辑器(HTML 遮罩)
 * @description 打开 commission-branches.json 的可视化配置面板,阻塞至用户点击关闭。
 *              通过 ~ 键(Oem3)切换显示/隐藏,隐藏时遮罩自动开启点击穿透,
 *              不影响游戏交互。修改即时写回文件。
 */

import { PATHS } from "../config/game-constants.js";

const HTML_PATH = "commission-config-mask.html";
const WINDOW_TAG = "commission-config";
const CONFIG_FILE = PATHS.CONFIG_BASE + "/commission-branches.json";

/**
 * 判断异常是否为取消相关的异常
 * @param {Error} error
 * @returns {boolean}
 */
function isCancellationError(error) {
    if (!error) return false;
    const msg = (error.message || error.toString() || "").toLowerCase();
    return msg.includes("取消自动任务")
        || msg.includes("task was canceled")
        || msg.includes("operationcanceledexception")
        || msg.includes("normalendexception");
}

/**
 * 打开委托分支配置编辑器并阻塞至关闭
 * @description 显示遮罩窗口,注册 ~ 键钩子,进入消息循环直到用户点击"关闭"
 *              或脚本被取消。阻塞期间用户对分支状态的修改会即时写回文件。
 * @returns {Promise<void>}
 */
export async function openCommissionConfigEditor() {
    if (typeof htmlMask === "undefined") {
        log.warn("当前环境不支持 htmlMask,跳过分支配置面板");
        return;
    }

    if (htmlMask.exists(WINDOW_TAG)) {
        log.debug("分支配置面板已存在,跳过重复打开");
        return;
    }

    let windowId;
    try {
        windowId = htmlMask.show(HTML_PATH, WINDOW_TAG);
    } catch (err) {
        log.warn("打开分支配置面板失败: {0}", err.message);
        return;
    }

    htmlMask.setClickThrough(windowId, false);
    log.info("分支配置面板已打开,按 ~ 键切换显示,点击关闭按钮继续主流程");

    const hook = new KeyMouseHook();
    let isVisible = true;

    hook.onKeyDown(function (keyCode) {
        if (keyCode !== "Oem3") return;
        if (!htmlMask.exists(windowId)) return;
        try {
            if (isVisible) {
                htmlMask.setClickThrough(windowId, true);
                htmlMask.send(windowId, "/toggleVisibility", JSON.stringify({ visible: false }));
            } else {
                htmlMask.setClickThrough(windowId, false);
                htmlMask.send(windowId, "/toggleVisibility", JSON.stringify({ visible: true }));
            }
            isVisible = !isVisible;
        } catch (err) {
            log.debug("切换分支面板显示失败: {0}", err.message);
        }
    });

    const cancelToken = dispatcher.getLinkedCancellationToken();

    try {
        while (htmlMask.exists(windowId)) {
            if (cancelToken.isCancellationRequested) {
                break;
            }

            let raw;
            try {
                raw = await htmlMask.receive(windowId, 1000);
            } catch (err) {
                if (isCancellationError(err)) break;
                log.debug("接收分支面板消息失败: {0}", err.message);
                await sleep(200);
                continue;
            }

            if (!raw) {
                await sleep(1);
                continue;
            }

            let msg;
            try {
                msg = JSON.parse(raw);
            } catch (err) {
                log.debug("解析分支面板消息失败: {0}", err.message);
                continue;
            }

            const shouldClose = await handleMessage(windowId, msg);
            if (shouldClose) {
                break;
            }
        }
    } catch (err) {
        if (!isCancellationError(err)) {
            log.warn("分支配置面板循环异常: {0}", err.message);
        }
    } finally {
        try { hook.dispose(); } catch (e) {}
        try {
            if (htmlMask.exists(windowId)) {
                htmlMask.close(windowId);
            }
        } catch (e) {}
        log.info("分支配置面板已关闭");
    }
}

/**
 * 处理来自 HTML 的单条消息
 * @param {string} windowId
 * @param {{url: string, data?: any, requestId?: string}} msg
 * @returns {Promise<boolean>} 返回 true 时由调用方退出循环
 */
async function handleMessage(windowId, msg) {
    if (!msg || !msg.url) return false;

    if (msg.url === "/loadConfig") {
        try {
            const content = file.readTextSync(CONFIG_FILE);
            JSON.parse(content);
            const payload = msg.requestId
                ? JSON.stringify({ requestId: msg.requestId, data: JSON.parse(content) })
                : content;
            htmlMask.send(windowId, "/loadConfig", payload);
            log.debug("已发送分支配置到面板");
        } catch (err) {
            if (isCancellationError(err)) throw err;
            log.warn("读取分支配置失败: {0}", err.message);
            const payload = msg.requestId
                ? JSON.stringify({ requestId: msg.requestId, data: {} })
                : "{}";
            htmlMask.send(windowId, "/loadConfig", payload);
        }
        return false;
    }

    if (msg.url === "/saveConfig") {
        let status = "ok";
        let errMsg = "";
        try {
            const content = msg.data && msg.data.content;
            if (typeof content !== "string") {
                throw new Error("缺少 content 字段");
            }
            JSON.parse(content);
            file.writeTextSync(CONFIG_FILE, content);
            log.debug("分支配置已保存");
        } catch (err) {
            if (isCancellationError(err)) throw err;
            status = "error";
            errMsg = err.message;
            log.warn("保存分支配置失败: {0}", err.message);
        }
        if (msg.requestId) {
            htmlMask.send(windowId, "/saveConfig", JSON.stringify({
                requestId: msg.requestId,
                data: { status, message: errMsg },
            }));
        }
        return false;
    }

    if (msg.url === "/close") {
        if (msg.requestId) {
            htmlMask.send(windowId, "/close", JSON.stringify({
                requestId: msg.requestId,
                data: { status: "ok" },
            }));
        }
        return true;
    }

    return false;
}
