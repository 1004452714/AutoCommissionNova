import { createApp } from "vue";
import App from "@/apps/path-recorder/App.vue";
import "@/shared/styles/tokens.css";

// 在开发服务器中安装路径录制器模拟桥接。
async function prepareDevelopmentBridge(): Promise<void> {
    if (!import.meta.env.DEV || import.meta.env.VITE_USE_MOCK_BRIDGE !== "true") return;
    // 动态导入确保生产包不包含 Mock 会话。
    const [{ installMockHtmlMask }, { mockPathRecorderRequest }] = await Promise.all([
        import("@/shared/bridge/mock"),
        import("@/apps/path-recorder/mock"),
    ]);
    installMockHtmlMask(mockPathRecorderRequest);
}

await prepareDevelopmentBridge();

// 路径录制器使用独立 Vue 根实例。
const app = createApp(App);
app.mount("#app");
