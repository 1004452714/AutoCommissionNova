import { createApp } from "vue";
import App from "@/apps/process-editor/App.vue";
import "@/shared/styles/tokens.css";

// 在开发服务器中安装流程编辑器模拟桥接。
async function prepareDevelopmentBridge(): Promise<void> {
    if (!import.meta.env.DEV || import.meta.env.VITE_USE_MOCK_BRIDGE !== "true") return;
    // 动态导入从生产构建中移除测试响应。
    const [{ installMockHtmlMask }, { mockProcessEditorRequest }] = await Promise.all([
        import("@/shared/bridge/mock"),
        import("@/apps/process-editor/mock"),
    ]);
    installMockHtmlMask(mockProcessEditorRequest);
}

await prepareDevelopmentBridge();

// 流程编辑器使用独立 Vue 根实例。
const app = createApp(App);
app.mount("#app");
