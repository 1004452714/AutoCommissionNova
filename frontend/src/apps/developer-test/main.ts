import { createApp } from "vue";
import App from "@/apps/developer-test/App.vue";
import "@/shared/styles/tokens.css";

// 在开发服务器中按需安装测试页宿主模拟器。
async function prepareDevelopmentBridge(): Promise<void> {
    if (!import.meta.env.DEV || import.meta.env.VITE_USE_MOCK_BRIDGE !== "true") return;
    // 动态导入确保模拟数据不会进入生产构建。
    const [{ installMockHtmlMask }, { mockDeveloperTestRequest }] = await Promise.all([
        import("@/shared/bridge/mock"),
        import("@/apps/developer-test/mock"),
    ]);
    installMockHtmlMask(mockDeveloperTestRequest);
}

await prepareDevelopmentBridge();

// 测试页 Vue 根实例只负责当前独立遮罩窗口。
const app = createApp(App);
app.mount("#app");
