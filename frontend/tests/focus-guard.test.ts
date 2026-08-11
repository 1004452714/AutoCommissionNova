import { nextTick } from "vue";
import { mount } from "@vue/test-utils";
import FocusGuard from "@/shared/components/FocusGuard.vue";

describe("focus guard", () => {
    it("keeps the guard after focus and consumes the first click", async () => {
        // 点击冒泡计数用于确认解除操作不会传递给底层界面。
        const bubbledClicks = vi.fn();
        document.addEventListener("click", bubbledClicks);
        // 真实挂载保证窗口事件和文档冒泡路径与入口一致。
        const wrapper = mount(FocusGuard, { attachTo: document.body });

        expect(wrapper.find(".focus-guard").exists()).toBe(false);
        window.dispatchEvent(new Event("blur"));
        await nextTick();
        expect(wrapper.find(".focus-guard").exists()).toBe(true);

        window.dispatchEvent(new Event("focus"));
        await nextTick();
        expect(wrapper.find(".focus-guard").exists()).toBe(true);

        await wrapper.find(".focus-guard").trigger("click");
        expect(bubbledClicks).not.toHaveBeenCalled();
        expect(wrapper.find(".focus-guard").exists()).toBe(false);

        document.body.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        expect(bubbledClicks).toHaveBeenCalledOnce();

        wrapper.unmount();
        document.removeEventListener("click", bubbledClicks);
    });

    it("removes the window listener when unmounted", () => {
        // 监听移除桩验证共享组件不会在重复打开遮罩后残留处理器。
        const removeListener = vi.spyOn(window, "removeEventListener");
        // 挂载实例触发完整的注册和清理生命周期。
        const wrapper = mount(FocusGuard);
        wrapper.unmount();

        expect(removeListener).toHaveBeenCalledWith("blur", expect.any(Function));
        removeListener.mockRestore();
    });
});
