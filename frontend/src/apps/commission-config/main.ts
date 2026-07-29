import { createApp } from "vue";
import App from "@/apps/commission-config/App.vue";
import "@/shared/styles/tokens.css";

// 在开发模式注入委托配置页的本地桥接。
async function prepareDevelopmentBridge(): Promise<void> {
    if (!import.meta.env.DEV || import.meta.env.VITE_USE_MOCK_BRIDGE !== "true") return;
    // 动态导入确保生产包不包含 Mock 数据。
    const [{ installMockHtmlMask }, { mockCommissionConfigRequest }] = await Promise.all([
        import("@/shared/bridge/mock"),
        import("@/apps/commission-config/mock"),
    ]);
    installMockHtmlMask(mockCommissionConfigRequest);
}

await prepareDevelopmentBridge();

// 委托配置页使用独立 Vue 根实例。
const app = createApp(App);
app.mount("#app");
