import { flushPromises, mount } from "@vue/test-utils";
import CommissionConfig from "@/apps/commission-config/App.vue";
import FocusGuard from "@/shared/components/FocusGuard.vue";
import type { HtmlMaskHost } from "@/shared/bridge/html-mask";

function emptyPayload() {
    return {
        uids: ["100000001"],
        selectedUid: "100000001",
        currentUid: "100000001",
        global: { skipSafeTeleport: false },
        branches: {},
        party: {
            global: {
                battleTeamName: "",
                elementTeamName: "",
                customBattleTeamName: "",
                customElementTeamName: "",
                battleStrategy: "根据队伍自动选择",
            },
            scopesByCommission: {},
        },
    };
}

describe("commission config idle warning", () => {
    it("shows the countdown in the close button and restores it after activity", async () => {
        vi.spyOn(Date, "now").mockReturnValue(10_000);
        const request = vi.fn(async (url: string) => url === "/loadConfig" ? emptyPayload() : { status: "ok" });
        window.htmlMask = { request, onMessage: null } satisfies HtmlMaskHost;
        const removeListener = vi.spyOn(window, "removeEventListener");
        const wrapper = mount(CommissionConfig, { attachTo: document.body });
        await flushPromises();

        window.htmlMask.onMessage?.({
            url: "/idleCountdown",
            data: { active: true, remainingSeconds: 30 },
        });
        await flushPromises();
        expect(wrapper.find(".close-action").text()).toContain("30 秒后继续");
        expect(wrapper.find(".app-identity h1").text()).toBe("委托配置");
        expect(wrapper.find(".app-mark").exists()).toBe(false);
        expect(wrapper.find(".app-identity [role=status]").exists()).toBe(false);
        expect(wrapper.find(".close-action svg").exists()).toBe(false);
        expect(wrapper.find(".idle-warning").exists()).toBe(false);

        window.htmlMask.onMessage?.({
            url: "/idleCountdown",
            data: { active: true, remainingSeconds: 29 },
        });
        await flushPromises();
        expect(wrapper.find(".close-action").text()).toContain("29 秒后继续");

        window.dispatchEvent(new PointerEvent("pointermove"));
        window.dispatchEvent(new PointerEvent("pointermove"));
        await flushPromises();
        expect(wrapper.find(".close-action").text()).toContain("关闭");
        expect(request.mock.calls.filter(([url]) => url === "/activity")).toHaveLength(1);

        expect(wrapper.findComponent(FocusGuard).exists()).toBe(true);
        window.htmlMask.onMessage?.({ url: "/toggleVisibility", data: { visible: false } });
        await flushPromises();
        expect(wrapper.findComponent(FocusGuard).exists()).toBe(false);
        window.htmlMask.onMessage?.({ url: "/toggleVisibility", data: { visible: true } });
        await flushPromises();
        expect(wrapper.findComponent(FocusGuard).exists()).toBe(true);

        wrapper.unmount();
        expect(removeListener).toHaveBeenCalledWith("pointermove", expect.any(Function));
        removeListener.mockRestore();
        vi.restoreAllMocks();
    });
});
