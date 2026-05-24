/**
 * 委托分支配置编辑器(HTML 遮罩)
 * @description 打开委托分支配置的可视化配置面板,阻塞至用户点击关闭。
 *              通过 ~ 键(Oem3)切换显示/隐藏,隐藏时遮罩自动开启点击穿透,
 *              不影响游戏交互。修改即时写回文件。
 *
 *              磁盘存储为 process/config/branches/{委托名}.json 多文件结构，
 *              本编辑器透过 loadAllBranchConfigs / writeAllBranchConfigs 在
 *              composite 对象（与历史单文件结构一致）与多文件之间转换，
 *              HTML 侧无需感知拆分
 */

import { isCancellationError } from "../utils/error-utils.js";
import { loadAllBranchConfigs, writeAllBranchConfigs } from "../loaders/branch-config.js";

const HTML_PATH = "commission-config-mask.html";
const WINDOW_TAG = "commission-config";

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
        if (isCancellationError(err)) return;
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
            if (isCancellationError(err)) return;
            log.debug("切换分支面板显示失败: {0}", err.message);
        }
    });

    const cancelToken = dispatcher.getLinkedCancellationToken();

    try {
        while (htmlMask.exists(windowId)) {
            if (cancelToken.isCancellationRequested) {
                htmlMask.close(windowId);
                break;
            }

            let raw;
            try {
                raw = await htmlMask.receive(windowId, 1000);
            } catch (err) {
                if (isCancellationError(err)) {
                    htmlMask.close(windowId);
                    break;
                }
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

            if (!msg || !msg.url) continue;

            if (msg.url === "/loadConfig") {
                try {
                    const composite = loadAllBranchConfigs();
                    const payload = msg.requestId
                        ? JSON.stringify({ requestId: msg.requestId, data: composite })
                        : JSON.stringify(composite);
                    htmlMask.send(windowId, "/loadConfig", payload);
                    log.debug("已发送分支配置到面板（{n} 个委托）", Object.keys(composite).length);
                } catch (err) {
                    if (isCancellationError(err)) {
                        htmlMask.close(windowId);
                        break;
                    }
                    log.warn("读取分支配置失败: {0}", err.message);
                    const payload = msg.requestId
                        ? JSON.stringify({ requestId: msg.requestId, data: {} })
                        : "{}";
                    htmlMask.send(windowId, "/loadConfig", payload);
                }
            } else if (msg.url === "/saveConfig") {
                let status = "ok";
                let errMsg = "";
                try {
                    const content = msg.data && msg.data.content;
                    if (typeof content !== "string") {
                        throw new Error("缺少 content 字段");
                    }
                    const composite = JSON.parse(content);
                    if (!composite || typeof composite !== "object") {
                        throw new Error("content 必须解析为对象");
                    }
                    writeAllBranchConfigs(composite);
                    log.debug("分支配置已保存（{n} 个委托）", Object.keys(composite).length);
                } catch (err) {
                    if (isCancellationError(err)) {
                        htmlMask.close(windowId);
                        break;
                    }
                    status = "error";
                    errMsg = err.message;
                    log.warn("保存分支配置失败: {0}", err.message);
                }
                if (msg.requestId) {
                    try {
                        htmlMask.send(windowId, "/saveConfig", JSON.stringify({
                            requestId: msg.requestId,
                            data: { status, message: errMsg },
                        }));
                    } catch (err) {
                        if (isCancellationError(err)) {
                            htmlMask.close(windowId);
                            break;
                        }
                        log.debug("回复保存结果失败: {0}", err.message);
                    }
                }
            } else if (msg.url === "/close") {
                try {
                    if (msg.requestId) {
                        htmlMask.send(windowId, "/close", JSON.stringify({
                            requestId: msg.requestId,
                            data: { status: "ok" },
                        }));
                    }
                } catch (err) {
                    if (isCancellationError(err)) {
                        htmlMask.close(windowId);
                        break;
                    }
                    log.debug("回复关闭确认失败: {0}", err.message);
                }
                htmlMask.close(windowId);
                break;
            }

            await sleep(1);
        }
    } catch (error) {
        // 最外层兜底:取消异常静默退出,其他异常记录后继续走 finally 清理
        if (!isCancellationError(error)) {
            log.error("分支配置面板执行异常: {0}", error.message);
        }
    } finally {
        log.debug("释放分支面板键鼠钩子...");
        try { hook.dispose(); } catch (e) {}
        try {
            if (htmlMask.exists(windowId)) {
                htmlMask.close(windowId);
            }
        } catch (e) {}
        log.info("分支配置面板已关闭");
    }
}
