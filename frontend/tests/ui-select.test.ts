import { flushPromises, mount } from "@vue/test-utils";
import UiSelect from "@/shared/components/UiSelect.vue";
import StepTypeMenu from "@/apps/process-editor/StepTypeMenu.vue";
import type { ProcessorMeta } from "@/apps/process-editor/types";

// 每项测试后清理 Teleport 生成的弹层节点。
afterEach(() => {
    document.body.innerHTML = "";
});

describe("shared select", () => {
    it("supports grouped keyboard selection and content width", async () => {
        // 分组选项同时覆盖当前值、键盘导航和内容宽度样式。
        const wrapper = mount(UiSelect, { attachTo: document.body, props: {
            modelValue: "a", ariaLabel: "测试选择", width: "content", maxWidth: 260,
            options: [{ value: "a", label: "选项甲", group: "第一组" }, { value: "b", label: "较长的选项乙", group: "第二组" }],
        } });
        // 触发器第一次按方向键只打开并停留在当前值。
        const trigger = wrapper.find<HTMLElement>("[role=combobox]");
        await trigger.trigger("keydown", { key: "ArrowDown" });
        await flushPromises();
        // 传送菜单保留分组标题并使用不透明共享表面。
        const menu = document.getElementById(trigger.attributes("aria-controls") ?? "");
        expect(menu?.querySelectorAll(".ui-select__group")).toHaveLength(2);
        expect(wrapper.classes()).toContain("ui-select--content");
        expect(wrapper.attributes("style")).toContain("260px");
        expect(wrapper.find(".ui-select__sizer").text()).toBe("较长的选项乙");
        // 第二次方向键和 Enter 选择下一项。
        await trigger.trigger("keydown", { key: "ArrowDown" });
        await trigger.trigger("keydown", { key: "Enter" });
        expect(wrapper.emitted("update:modelValue")?.at(-1)).toEqual(["b"]);
        expect(wrapper.emitted("change")?.at(-1)).toEqual(["b"]);
        wrapper.unmount();
    });

    it("filters editable candidates and accepts free text", async () => {
        // 可编辑模式允许任意文本，同时对候选名称进行过滤。
        const wrapper = mount(UiSelect, { attachTo: document.body, props: {
            modelValue: "", ariaLabel: "角色", editable: true,
            options: [{ value: "角色甲", label: "角色甲" }, { value: "角色乙", label: "角色乙" }],
        } });
        // 输入内容立即回传且不强制匹配候选。
        const input = wrapper.find<HTMLInputElement>("input[role=combobox]");
        await input.setValue("甲");
        await flushPromises();
        expect(wrapper.emitted("update:modelValue")?.at(-1)).toEqual(["甲"]);
        // 弹层只保留匹配候选，点击后提交完整值。
        const menu = document.getElementById(input.attributes("aria-controls") ?? "");
        const option = menu?.querySelector<HTMLElement>('[data-option-value="角色甲"]');
        expect(menu?.querySelectorAll("[data-option-value]")).toHaveLength(1);
        option?.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
        await flushPromises();
        expect(wrapper.emitted("change")?.at(-1)).toEqual(["角色甲"]);
        wrapper.unmount();
    });

    it("opens upward near the viewport bottom and respects disabled state", async () => {
        // 底部锚点用于验证弹层翻转，禁用状态在第二个实例验证。
        const wrapper = mount(UiSelect, { attachTo: document.body, props: { modelValue: "a", ariaLabel: "方向", options: [{ value: "a", label: "甲" }] } });
        // 模拟靠近视口底部的触发器几何位置。
        const trigger = wrapper.find<HTMLElement>("[role=combobox]");
        trigger.element.getBoundingClientRect = () => ({ x: 20, y: 700, top: 700, left: 20, right: 180, bottom: 736, width: 160, height: 36, toJSON: () => ({}) });
        await trigger.trigger("click");
        await flushPromises();
        // 向上展开时使用 bottom 定位而不是固定 top。
        const menu = document.getElementById(trigger.attributes("aria-controls") ?? "");
        expect(menu?.style.bottom).not.toBe("auto");
        wrapper.unmount();

        // 禁用控件不能展开弹层。
        const disabledWrapper = mount(UiSelect, { attachTo: document.body, props: { modelValue: "a", ariaLabel: "禁用", disabled: true, options: [{ value: "a", label: "甲" }] } });
        await disabledWrapper.find("[role=combobox]").trigger("click");
        expect(document.querySelector(".ui-select__menu")).toBeNull();
        disabledWrapper.unmount();
    });
});

describe("step type menu", () => {
    it("selects a processor through category and item columns", async () => {
        // 两个分类验证悬停切换和最终类型回传。
        const processors: ProcessorMeta[] = [
            { type: "步骤甲", category: "分类一", dataSpec: { kind: "none" } },
            { type: "步骤乙", category: "分类二", dataSpec: { kind: "none" } },
        ];
        // 打开二级菜单并悬停第二个分类。
        const wrapper = mount(StepTypeMenu, { attachTo: document.body, props: { modelValue: "步骤甲", processors, ariaLabel: "步骤类型" } });
        expect(wrapper.find(".step-type-sizer").text()).toBe("步骤甲");
        await wrapper.find("[role=combobox]").trigger("click");
        await flushPromises();
        // 第二分类激活后右列显示并选择步骤乙。
        const menu = document.querySelector<HTMLElement>(".step-type-popover");
        expect(Number.parseFloat(menu?.style.getPropertyValue("--step-menu-category-width") ?? "0")).toBeGreaterThanOrEqual(144);
        const categories = menu?.querySelectorAll<HTMLElement>(".step-type-categories button");
        categories?.[1].dispatchEvent(new MouseEvent("mouseenter"));
        await flushPromises();
        const item = Array.from(menu?.querySelectorAll<HTMLElement>(".step-type-items button") ?? []).find((button) => button.textContent?.includes("步骤乙"));
        item?.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
        await flushPromises();
        expect(wrapper.emitted("change")?.at(-1)).toEqual(["步骤乙"]);
        wrapper.unmount();
    });

    it("keeps both step menu columns usable on a narrow viewport", async () => {
        // 窄视口验证一级列不会继续使用超出弹层的固定宽度。
        const originalWidth = window.innerWidth;
        Object.defineProperty(window, "innerWidth", { configurable: true, value: 240 });
        const processors: ProcessorMeta[] = [
            { type: "很长的步骤名称", category: "很长的一级分类名称", dataSpec: { kind: "none" } },
        ];
        const wrapper = mount(StepTypeMenu, { attachTo: document.body, props: { modelValue: processors[0].type, processors, ariaLabel: "步骤类型" } });
        await wrapper.find("[role=combobox]").trigger("click");
        await flushPromises();
        const menu = document.querySelector<HTMLElement>(".step-type-popover");
        const width = Number.parseFloat(menu?.style.width ?? "0");
        const categoryWidth = Number.parseFloat(menu?.style.getPropertyValue("--step-menu-category-width") ?? "0");
        wrapper.unmount();
        Object.defineProperty(window, "innerWidth", { configurable: true, value: originalWidth });
        expect(width).toBeLessThanOrEqual(224);
        expect(categoryWidth).toBeLessThan(width * 0.5);
    });
});
