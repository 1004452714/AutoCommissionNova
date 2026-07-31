import { flushPromises, mount } from "@vue/test-utils";
import type { DOMWrapper } from "@vue/test-utils";
import ProcessEditor from "@/apps/process-editor/App.vue";
import PathRecorder from "@/apps/path-recorder/App.vue";
import StepDataEditor from "@/apps/process-editor/StepDataEditor.vue";
import StepInspector from "@/apps/process-editor/StepInspector.vue";
import CommissionConfig from "@/apps/commission-config/App.vue";
import { DEFAULT_SETTINGS, createPoint } from "@/apps/path-recorder/model";
import type { HtmlMaskHost } from "@/shared/bridge/html-mask";
import type { ProcessEditorInit, ProcessScope } from "@/apps/process-editor/types";

// 测试流程范围覆盖最近文件和地图录制目标。
const processScope: ProcessScope = { country: "璃月", typeDir: "NPC", commissionName: "测试委托", locationDir: "地点" };
// 测试处理器包含声明对象、角色和地图追踪编辑器。
const processInit: ProcessEditorInit = {
    scopes: [processScope], roles: ["角色甲", "角色乙"], recentFiles: [{ scope: processScope, fileName: "branch.json", path: "process/branch.json" }],
    processors: [
        { type: "对象步骤", category: "测试", dataSpec: { kind: "object", fields: { name: { type: "string", label: "名称", required: true }, items: { type: "array", label: "条目" } } } },
        { type: "切换角色", category: "测试", dataSpec: { kind: "custom", editor: "roles" } },
        { type: "地图追踪", category: "测试", dataSpec: { kind: "string", label: "路径文件" } },
        { type: "无数据步骤", category: "测试", dataSpec: { kind: "none" } },
        { type: "可选数值", category: "测试", dataSpec: { kind: "number", label: "次数", optional: true, default: 3 } },
        { type: "对话", category: "测试", dataSpec: { kind: "object", optional: true, fields: { priorityOptions: { type: "array", label: "优先对话选项" }, npcWhiteList: { type: "array", label: "NPC 白名单" } } } },
        { type: "摧毁哨塔", category: "测试", dataSpec: { kind: "object", optional: true, fields: { navigation: { type: "string", label: "寻路方式", default: "图标寻路", alwaysVisible: true, options: ["图标寻路", "路径追踪"] }, path: { type: "string", label: "路径文件" } } } },
        { type: "固若金汤", category: "测试", dataSpec: { kind: "custom", editor: "waves" } },
        { type: "执行子流程", category: "测试", dataSpec: { kind: "object", fields: { path: { type: "string", label: "子流程文件", required: true } } } },
    ],
};

// 创建直接返回业务对象的 htmlMask 测试宿主。
function installHost(handler: (url: string, data: unknown) => unknown | Promise<unknown>): ReturnType<typeof vi.fn> {
    // 请求桩同时供断言调用顺序。
    const request = vi.fn(handler);
    window.htmlMask = { onMessage: null, request } satisfies HtmlMaskHost;
    return request;
}

// 创建路径录制器初始化状态。
function recorderState(phase: "recording" | "stopped") {
    return {
        phase, settings: structuredClone(DEFAULT_SETTINGS), points: [createPoint(10, 20)], sampling: false, running: false,
        displayMode: "normal" as const, suggestedFileName: "route.json", routeAuthors: [], routeMapMatchMethod: "TemplateMatch" as const,
        combatSyntax: [{ code: "keydown", aliases: [], params: ["W"], template: "keydown()", hint: "按下按键" }],
    };
}

// 通过真实弹层选择共享下拉项，覆盖传送菜单和业务 change 事件。
async function chooseUiOption(control: DOMWrapper<Element>, value: string): Promise<void> {
    // 当前控件的组合框触发器负责打开传送菜单。
    const trigger = control.find<HTMLElement>("[role=combobox]");
    await trigger.trigger("click");
    await flushPromises();
    // aria-controls 提供当前控件唯一菜单标识。
    const menu = document.getElementById(trigger.attributes("aria-controls") ?? "");
    // 数据值用于稳定定位中文或英文选项。
    const option = Array.from(menu?.querySelectorAll<HTMLElement>("[data-option-value]") ?? []).find((item) => item.dataset.optionValue === value);
    if (!option) throw new Error(`未找到下拉选项：${value}`);
    option.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    await flushPromises();
}

describe("process editor workflows", () => {
    it("renders localized field labels and only adds declared data", async () => {
        // 对象步骤同时包含中文标签、弱化原始键和委托描述提示。
        const objectWrapper = mount(StepInspector, { props: {
            step: { type: "对象步骤", data: { name: "值" }, desc: "" },
            processors: processInit.processors, roles: processInit.roles, branches: [],
        } });
        expect(objectWrapper.find(".direct-fields .step-type-menu").exists()).toBe(true);
        expect(objectWrapper.find(".direct-fields .step-type-field").element.tagName).toBe("DIV");
        expect(objectWrapper.find(".direct-fields label .step-type-menu").exists()).toBe(false);
        expect((objectWrapper.find(".common-card").element as HTMLDetailsElement).open).toBe(true);
        expect((objectWrapper.find(".parameter-card").element as HTMLDetailsElement).open).toBe(true);
        expect(objectWrapper.find(".direct-fields .note-field").exists()).toBe(true);
        expect(objectWrapper.text()).toContain("委托描述");
        expect(objectWrapper.text()).toContain("desc");
        expect(objectWrapper.find('input[placeholder="委托描述中包含此处文本才执行"]').exists()).toBe(true);
        expect(objectWrapper.find(".data-field .field-label").text()).toContain("名称");
        expect(objectWrapper.find(".data-field .field-label").text()).toContain("name");
        expect(objectWrapper.find(".data-field").classes()).not.toContain("data-field-complex");
        expect(objectWrapper.text()).toContain("步骤参数");
        expect(objectWrapper.text()).not.toContain("添加字段");
        expect(objectWrapper.find("select").exists()).toBe(false);
        await chooseUiOption(objectWrapper.find(".optional-picker"), "items");
        expect(objectWrapper.emitted("changed")?.at(-1)?.[0]).toMatchObject({ type: "对象步骤", data: { name: "值", items: [] } });
        expect(objectWrapper.find(".optional-picker").exists()).toBe(false);
        objectWrapper.unmount();

        // 地址检测维持单多点选择并显示 X、Y、容差三个标签。
        const locationWrapper = mount(StepInspector, { props: { step: { type: "无数据步骤", loc: [1, 2, 3] }, processors: processInit.processors, roles: [], branches: [] } });
        expect(locationWrapper.findAll(".loc-row input")).toHaveLength(3);
        expect(locationWrapper.findAll(".loc-row label").map((label) => label.text())).toEqual(["X", "Y", "容差"]);
        expect(locationWrapper.find(".segmented").text()).toContain("单点");
        expect(locationWrapper.find(".segmented").text()).toContain("多点");
        expect(locationWrapper.find(".loc-editor>header .segmented").exists()).toBe(true);
        expect(locationWrapper.find(".loc-editor>.segmented").exists()).toBe(false);
        expect(locationWrapper.find(".parameter-card").exists()).toBe(false);
        locationWrapper.unmount();

        // kind:none 不提供 data 候选，可选数值按声明默认值添加。
        const noneWrapper = mount(StepInspector, { props: { step: { type: "无数据步骤" }, processors: processInit.processors, roles: [], branches: [] } });
        expect(noneWrapper.find(".parameter-card").exists()).toBe(false);
        expect(noneWrapper.text()).not.toContain("此步骤不需要 data");
        noneWrapper.unmount();
        const optionalWrapper = mount(StepInspector, { props: { step: { type: "可选数值" }, processors: processInit.processors, roles: [], branches: [] } });
        await chooseUiOption(optionalWrapper.find(".parameter-card .field-picker"), "data");
        expect(optionalWrapper.emitted("changed")?.at(-1)?.[0]).toMatchObject({ type: "可选数值", data: 3 });
        expect(optionalWrapper.find(".parameter-card .field-picker").exists()).toBe(false);
        optionalWrapper.unmount();
    });

    it("adds and removes retry settings as one common option", async () => {
        // 新建重试设置时同时写入两个运行时字段。
        const wrapper = mount(StepInspector, { props: { step: { type: "无数据步骤" }, processors: processInit.processors, roles: [], branches: [] } });
        const picker = wrapper.find(".common-card .field-picker");
        await chooseUiOption(picker, "retrySettings");
        expect(wrapper.emitted("changed")?.at(-1)?.[0]).toEqual({ type: "无数据步骤", retry: 0, retryOn: "throw" });
        expect(wrapper.find(".common-card .field-picker [role=combobox]").text()).toContain("选择要添加的通用字段");
        expect((wrapper.find(".retry-fields input").element as HTMLInputElement).value).toBe("0");
        expect(wrapper.find(".retry-fields [role=combobox]").text()).toContain("throw");
        expect(wrapper.find(".common-card .summary-meta").text()).toBe("1 项");
        await wrapper.find(".retry-editor>header .danger").trigger("click");
        expect(wrapper.emitted("changed")?.at(-1)?.[0]).toEqual({ type: "无数据步骤" });
        wrapper.unmount();

        // 旧流程只有 retry 时补齐默认显示，但不主动写入 retryOn。
        const legacyWrapper = mount(StepInspector, { props: { step: { type: "无数据步骤", retry: 2 }, processors: processInit.processors, roles: [], branches: [] } });
        expect((legacyWrapper.find(".retry-fields input").element as HTMLInputElement).value).toBe("2");
        expect(legacyWrapper.find(".retry-fields [role=combobox]").text()).toContain("throw");
        expect(legacyWrapper.find(".common-card .field-picker").exists()).toBe(true);
        expect(legacyWrapper.emitted("changed")).toBeUndefined();
        legacyWrapper.unmount();
    });

    it("keeps single-line notes and multiline dialog parameters", async () => {
        // 步骤说明保持单行，两个声明数组参数仍允许多行输入。
        const wrapper = mount(StepInspector, { props: { step: { type: "对话" }, processors: processInit.processors, roles: [], branches: [] } });
        const note = wrapper.find(".note-field input");
        await note.trigger("keydown", { key: "Enter" });
        await note.setValue("单行说明");
        expect(wrapper.emitted("changed")?.at(-1)?.[0]).toMatchObject({ type: "对话", note: "单行说明" });
        expect(wrapper.emitted("changeType")).toBeUndefined();
        expect((wrapper.find(".parameter-card").element as HTMLDetailsElement).open).toBe(true);

        // 参数下拉位于卡片顶部，选中后立即添加并复位。
        await chooseUiOption(wrapper.find(".optional-picker"), "priorityOptions");
        await chooseUiOption(wrapper.find(".optional-picker"), "npcWhiteList");
        const textareas = wrapper.findAll(".data-field textarea");
        expect(textareas).toHaveLength(2);
        expect(wrapper.find(".data-editor").classes()).toContain("dialog-data");
        expect(wrapper.findAll(".dialog-field")).toHaveLength(2);
        expect(wrapper.find(".dialog-field-wide").exists()).toBe(false);
        expect(wrapper.find(".parameter-card>.card-body>.data-remove").exists()).toBe(false);
        await textareas[0].setValue("选项甲\n");
        await flushPromises();
        expect((textareas[0].element as HTMLTextAreaElement).value).toBe("选项甲\n");
        await textareas[0].trigger("blur");
        expect((textareas[0].element as HTMLTextAreaElement).value).toBe("选项甲");
        await textareas[0].setValue("选项甲\n选项乙");
        await textareas[1].setValue("凯瑟琳\n安东尼");
        expect(wrapper.emitted("changed")?.at(-1)?.[0]).toMatchObject({ data: { priorityOptions: ["选项甲", "选项乙"], npcWhiteList: ["凯瑟琳", "安东尼"] } });
        expect((wrapper.find(".parameter-card").element as HTMLDetailsElement).open).toBe(true);
        wrapper.unmount();

        // 对话只配置一个字段时使用完整宽度。
        const singleWrapper = mount(StepDataEditor, { props: { modelValue: { priorityOptions: ["选项"] }, spec: processInit.processors[5].dataSpec, stepType: "对话", processors: processInit.processors, roles: [], branches: [] } });
        expect(singleWrapper.find(".dialog-field-wide").exists()).toBe(true);
        singleWrapper.unmount();
    });

    it("preserves unknown object data and reports duplicate roles", async () => {
        // 对象编辑器初值包含声明之外的兼容字段。
        const objectWrapper = mount(StepDataEditor, { props: { modelValue: { name: "旧值", extension: 3 }, spec: processInit.processors[0].dataSpec, stepType: "对象步骤", processors: processInit.processors, roles: processInit.roles, branches: [] } });
        await objectWrapper.find("input").setValue("新值");
        expect(objectWrapper.emitted("update")?.at(-1)?.[0]).toEqual({ name: "新值", extension: 3 });
        objectWrapper.unmount();

        // 角色编辑器对重复角色提供即时错误。
        const roleWrapper = mount(StepDataEditor, { props: { modelValue: {}, spec: processInit.processors[1].dataSpec, stepType: "切换角色", processors: processInit.processors, roles: processInit.roles, branches: [] } });
        expect(roleWrapper.findAll(".field-label-title").map((label) => label.text())).toEqual(["槽位|1", "槽位|2", "槽位|3", "槽位|4"]);
        expect(roleWrapper.findAll(".parameter-row")).toHaveLength(4);
        const roleInputs = roleWrapper.findAll("input");
        await roleInputs[0].setValue("角色甲");
        await roleWrapper.setProps({ modelValue: { "1": "角色甲" } });
        await roleInputs[1].setValue("角色甲");
        expect(roleWrapper.text()).toContain("角色不能重复");
        roleWrapper.unmount();
    });

    it("shows conditional required fields and wave threshold guidance", async () => {
        // 路径追踪使路径文件立即成为可见必填项，切回后清除旧值。
        const watchtowerSpec = processInit.processors[6].dataSpec;
        const watchtowerWrapper = mount(StepDataEditor, { props: { modelValue: { navigation: "图标寻路" }, spec: watchtowerSpec, stepType: "摧毁哨塔", processors: processInit.processors, roles: [], branches: [] } });
        expect(watchtowerWrapper.findAll(".data-field")).toHaveLength(1);
        expect(watchtowerWrapper.find(".optional-picker").exists()).toBe(false);
        await chooseUiOption(watchtowerWrapper.find(".data-field .ui-select"), "路径追踪");
        expect(watchtowerWrapper.emitted("update")?.at(-1)?.[0]).toEqual({ navigation: "路径追踪" });
        await watchtowerWrapper.setProps({ modelValue: { navigation: "路径追踪" } });
        expect(watchtowerWrapper.findAll(".data-field")).toHaveLength(2);
        expect(watchtowerWrapper.findAll(".field-label")[1].classes()).toContain("required");
        expect(watchtowerWrapper.findAll(".field-label-hint")[1].text()).toBe("必填");
        expect(watchtowerWrapper.find(".optional-picker").exists()).toBe(false);
        await watchtowerWrapper.find(".data-field input").setValue("route.json");
        await watchtowerWrapper.setProps({ modelValue: { navigation: "路径追踪", path: "route.json" } });
        await chooseUiOption(watchtowerWrapper.find(".data-field .ui-select"), "图标寻路");
        expect(watchtowerWrapper.emitted("update")?.at(-1)?.[0]).toEqual({ navigation: "图标寻路" });
        watchtowerWrapper.unmount();

        // 固若金汤明确说明累计击杀阈值和 -1 的无条件语义。
        const wavesWrapper = mount(StepDataEditor, { props: { modelValue: { wave1: { "-1": "route.json" } }, spec: processInit.processors[7].dataSpec, stepType: "固若金汤", processors: processInit.processors, roles: [], branches: [] } });
        expect(wavesWrapper.text()).toContain("填写累计击杀数；-1 表示本波次无条件执行");
        expect(wavesWrapper.find('[aria-label="累计击杀数"]').attributes("placeholder")).toBe("例如 -1、3、6");
        wavesWrapper.unmount();
    });

    it("selects, creates, and opens subprocess documents", async () => {
        // 已有子流程使用编辑按钮，手动的新路径使用新建按钮。
        const subprocessSpec = processInit.processors.find(processor => processor.type === "执行子流程")!.dataSpec;
        const fieldWrapper = mount(StepDataEditor, { props: {
            modelValue: { path: "nested/child.json" }, spec: subprocessSpec, stepType: "执行子流程",
            processors: processInit.processors, roles: [], branches: [], subProcessOptions: [{ value: "nested/child.json", label: "nested/child.json" }],
        } });
        expect(fieldWrapper.find("button.primary").text()).toBe("编辑子流程");
        await fieldWrapper.find("button.primary").trigger("click");
        expect(fieldWrapper.emitted("editSubprocess")?.[0]).toEqual(["nested/child.json"]);
        await fieldWrapper.setProps({ modelValue: { path: "nested/new.json" } });
        expect(fieldWrapper.find("button.primary").text()).toBe("新建子流程");
        fieldWrapper.unmount();

        // 用户分支内的地图追踪继续获得路径候选并向页面转发录制请求。
        const branchWrapper = mount(StepDataEditor, { props: {
            modelValue: { branch: { type: "地图追踪", data: "route.json" } },
            spec: { kind: "custom", editor: "branches" }, stepType: "用户分支选择",
            processors: processInit.processors, roles: [], branches: [{ key: "branch", label: "分支" }],
            pathOptions: [{ value: "route.json", label: "route.json" }],
        } });
        expect(branchWrapper.find(".record-row button.primary").text()).toBe("编辑路径");
        await branchWrapper.find(".record-row button.primary").trigger("click");
        expect(branchWrapper.emitted("recordPath")).toHaveLength(1);
        branchWrapper.unmount();

        // 页面打开子流程后保留父流程草稿，并可返回恢复。
        const init = structuredClone(processInit);
        const request = installHost(async (url) => {
            if (url === "/init") return init;
            if (url === "/target") return { status: "ok", scope: processScope, path: "process/process.json", exists: true, branches: [], subProcessOptions: [{ value: "child.json", label: "child.json" }] };
            if (url === "/load") return { status: "ok", path: "process/process.json", content: JSON.stringify([{ type: "执行子流程", data: { path: "child.json" } }]), recentFiles: [], branches: [] };
            if (url === "/openSubprocess") return { status: "ok", path: "process/child.json", reference: "child.json", exists: true, content: "[]", subProcessOptions: [] };
            return { status: "ok" };
        });
        const page = mount(ProcessEditor);
        await flushPromises();
        const selects = page.findAll(".sidebar .ui-select");
        await chooseUiOption(selects[0], processScope.country);
        await chooseUiOption(selects[1], processScope.typeDir);
        await chooseUiOption(selects[2], processScope.commissionName);
        await chooseUiOption(selects[3], processScope.locationDir);
        await page.find(".scope-action").trigger("click");
        await flushPromises();
        await page.find(".step").trigger("click");
        await page.find(".inspector button.primary").trigger("click");
        await flushPromises();
        expect(request).toHaveBeenCalledWith("/openSubprocess", expect.objectContaining({ reference: "child.json" }));
        expect(page.find(".back-button").exists()).toBe(true);
        await page.find(".back-button").trigger("click");
        expect(page.findAll(".step")).toHaveLength(1);
        page.unmount();
    });

    it("opens a recent file from create mode and protects immediate edits", async () => {
        // 请求桩提供最近文件和一个可编辑步骤。
        const request = installHost(async (url, data) => {
            if (url === "/init") return processInit;
            if (url === "/target") return { status: "ok", scope: processScope, path: "process/branch.json", exists: true, branches: [] };
            if (url === "/load") return { status: "ok", scope: processScope, path: "process/branch.json", content: JSON.stringify([{ type: "对象步骤", data: { name: "值" }, note: "旧说明" }]), recentFiles: processInit.recentFiles, branches: [] };
            if (url === "/close") return { status: "ok" };
            return { status: "ok", data };
        });
        // 页面从新增模式点击最近文件。
        const wrapper = mount(ProcessEditor);
        await flushPromises();
        await wrapper.findAll(".mode-switch button")[1].trigger("click");
        await flushPromises();
        await wrapper.find(".recent button").trigger("click");
        await flushPromises();
        expect(wrapper.findAll(".mode-switch button")[0].classes()).toContain("active");
        expect(request.mock.calls.find((call) => call[0] === "/load")?.[1]).toMatchObject({ fileName: "branch.json", scope: processScope });

        // 详情输入直接标脏，关闭时必须弹出未保存确认。
        await wrapper.find(".step").trigger("click");
        expect(wrapper.findAll(".step-actions button")).toHaveLength(1);
        expect(wrapper.find(".step-actions").text()).not.toContain("复制");
        expect(wrapper.find(".step-summary small").text()).toBe("旧说明");
        const note = wrapper.find(".inspector .note-field input");
        await note.setValue("新说明");
        await wrapper.find(".topbar button").trigger("click");
        expect(wrapper.find("[role=dialog]").exists()).toBe(true);
        wrapper.unmount();
    });

    it("keeps the existing process cascade blank until the user chooses it", async () => {
        // 初始化只提供候选，不应主动探测或选中第一个现有流程。
        const request = installHost(async (url) => url === "/init" ? processInit : { status: "ok", scope: processScope, path: "process/process.json", exists: true, branches: [] });
        const wrapper = mount(ProcessEditor);
        await flushPromises();
        // 四级选择保持空值，下级控件依次禁用且打开按钮不可用。
        const selectors = wrapper.findAll(".sidebar [role=combobox]");
        expect(wrapper.findAll(".sidebar .scope-field")).toHaveLength(4);
        expect(wrapper.findAll(".sidebar .scope-field").every((field) => field.element.tagName === "DIV")).toBe(true);
        expect(selectors.slice(0, 4).map((selector) => (selector.element as HTMLButtonElement).textContent?.trim())).toEqual(["请选择", "请选择", "请选择", "请选择"]);
        expect(selectors[1].attributes("disabled")).toBeDefined();
        expect(wrapper.find(".sidebar>button").attributes("disabled")).toBeDefined();
        expect(wrapper.find(".side-actions button").attributes("disabled")).toBeDefined();
        expect(request.mock.calls.some((call) => call[0] === "/target")).toBe(false);
        await wrapper.findAll(".mode-switch button")[1].trigger("click");
        expect(wrapper.findAll(".sidebar .scope-field")).toHaveLength(5);
        wrapper.unmount();
    });

    it("writes recorded path back to the selected map step", async () => {
        // 地图录制响应携带文件名和后端解析范围。
        installHost(async (url) => {
            if (url === "/init") return processInit;
            if (url === "/target") return { status: "ok", scope: processScope, path: "process/process.json", exists: true, branches: [] };
            if (url === "/load") return { status: "ok", scope: processScope, path: "process/process.json", content: JSON.stringify([{ type: "地图追踪", data: "old.json" }]), recentFiles: [], branches: [] };
            if (url === "/recordPath") return { status: "saved", fileName: "recorded.json", scope: processScope };
            return { status: "ok" };
        });
        // 选中地图步骤后从 data 区打开录制。
        const wrapper = mount(ProcessEditor);
        await flushPromises();
        await wrapper.find(".recent button").trigger("click");
        await flushPromises();
        await wrapper.find(".step").trigger("click");
        await wrapper.find(".record-row button").trigger("click");
        await flushPromises();
        expect((wrapper.find(".record-row input").element as HTMLInputElement).value).toBe("recorded.json");
        wrapper.unmount();
    });
});

describe("path recorder workflows", () => {
    it("flushes points before finish and save, then calls done", async () => {
        // 请求桩记录所有宿主协议调用。
        const request = installHost(async (url) => {
            if (url === "/init") return recorderState("recording");
            if (url === "/points") return { status: "ok", phase: "stopped" };
            if (url === "/finish") return recorderState("stopped");
            if (url === "/save") return { status: "saved", path: "route.json", fileName: "route.json" };
            return { status: "ok" };
        });
        // 本地编辑产生待刷新点位，结束前应先发送 /points。
        const wrapper = mount(PathRecorder);
        await flushPromises();
        await chooseUiOption(wrapper.findAll(".point-row:not(.point-header) .ui-select")[0], "target");
        await wrapper.find(".toolbar-actions .primary").trigger("click");
        await flushPromises();
        const finishCalls = request.mock.calls.map((call) => call[0]);
        expect(finishCalls.indexOf("/points")).toBeLessThan(finishCalls.indexOf("/finish"));

        // 再次编辑并保存，调用顺序必须为 points、save、done。
        await chooseUiOption(wrapper.findAll(".point-row:not(.point-header) .ui-select")[0], "path");
        await wrapper.find(".footer .primary").trigger("click");
        await flushPromises();
        const saveCalls = request.mock.calls.map((call) => call[0]);
        expect(saveCalls.slice(saveCalls.lastIndexOf("/points"))).toEqual(expect.arrayContaining(["/points", "/save", "/done"]));
        expect(saveCalls.indexOf("/save")).toBeLessThan(saveCalls.indexOf("/done"));
        wrapper.unmount();
    });

    it("uses a native minute time control for set-time actions", async () => {
        // 旧路径的一位小时和分钟能够回显为浏览器接受的规范时间值。
        const state = recorderState("stopped");
        state.points[0].action = "set_time";
        state.points[0].action_params = "6:2";
        const request = installHost(async (url) => url === "/init" ? state : url === "/save" ? { status: "saved", path: "route.json", fileName: "route.json" } : { status: "ok" });
        const wrapper = mount(PathRecorder);
        await flushPromises();
        const row = wrapper.find(".point-row:not(.point-header)");
        const time = row.find<HTMLInputElement>('input[type="time"]');
        expect(time.exists()).toBe(true);
        expect(time.attributes("step")).toBe("60");
        expect(time.element.value).toBe("06:02");
        expect(row.find('input.action-params:not([type="time"])').exists()).toBe(false);
        await time.setValue("09:07");
        await wrapper.find(".footer .primary").trigger("click");
        await flushPromises();
        expect(request.mock.calls.find((call) => call[0] === "/save")?.[1]).toMatchObject({ points: [expect.objectContaining({ action_params: "09:07" })] });
        wrapper.unmount();
    });

    it("keeps existing points when recording continues", async () => {
        // 开始续录前先同步页面点位，宿主返回的原点位仍保留在表格中。
        const state = recorderState("stopped");
        const request = installHost(async (url) => {
            if (url === "/init") return state;
            if (url === "/points") return { status: "ok", phase: "stopped" };
            if (url === "/start") return { ...state, phase: "recording" };
            return { status: "ok" };
        });
        const wrapper = mount(PathRecorder);
        await flushPromises();
        await chooseUiOption(wrapper.find(".point-row:not(.point-header) .ui-select"), "target");
        await wrapper.find(".toolbar-actions .primary").trigger("click");
        await flushPromises();
        const urls = request.mock.calls.map((call) => call[0]);
        expect(urls.indexOf("/points")).toBeLessThan(urls.indexOf("/start"));
        expect(urls).not.toContain("/sample");
        expect(wrapper.findAll(".point-row:not(.point-header)")).toHaveLength(1);
        wrapper.unmount();
    });

    it("adds the current point outside the recording phase", async () => {
        // 已结束状态仍可直接请求当前位置，不需要先切回录制阶段。
        const request = installHost(async (url) => url === "/init" ? recorderState("stopped") : { status: "ok" });
        const wrapper = mount(PathRecorder);
        await flushPromises();
        const sampleButton = wrapper.findAll(".toolbar-actions button")[2];
        expect(sampleButton.attributes("disabled")).toBeUndefined();
        await sampleButton.trigger("click");
        await flushPromises();
        expect(request.mock.calls.some((call) => call[0] === "/sample")).toBe(true);
        wrapper.unmount();
    });

    it("locks host shortcuts while editable controls have focus", async () => {
        // 文件名和动作参数用于验证普通模式下全部输入控件的统一焦点锁。
        const state = recorderState("stopped");
        state.points[0].action = "log_output";
        // 首次加锁响应由测试延迟，覆盖失焦发生在宿主确认之前的竞态。
        let releaseLock: ((value: { status: string }) => void) | undefined;
        const pendingLock = new Promise<{ status: string }>((resolve) => { releaseLock = resolve; });
        const request = installHost(async (url, data) => url === "/init"
            ? state
            : url === "/interactionLock" && (data as { active?: boolean }).active
                ? pendingLock
                : { status: "ok" });
        const wrapper = mount(PathRecorder, { attachTo: document.body });
        await flushPromises();
        request.mockClear();

        // 输入控件之间切换不能产生中途解锁请求。
        const fileNameInput = wrapper.find<HTMLInputElement>(".file-field input");
        const parameterInput = wrapper.find<HTMLInputElement>("input.action-params");
        fileNameInput.element.focus();
        await flushPromises();
        parameterInput.element.focus();
        await flushPromises();
        const focusCalls = request.mock.calls.filter((call) => call[0] === "/interactionLock");
        expect(focusCalls.some((call) => (call[1] as { active: boolean }).active)).toBe(true);
        expect(focusCalls.some((call) => !(call[1] as { active: boolean }).active)).toBe(false);

        // 宿主确认加锁前离开控件，确认后仍必须补发最新的解锁状态。
        parameterInput.element.blur();
        releaseLock?.({ status: "ok" });
        await flushPromises();
        expect(request.mock.calls.filter((call) => call[0] === "/interactionLock").at(-1)?.[1]).toEqual({ active: false });
        wrapper.unmount();
    });

    it("keeps settings open when automatic saving fails", async () => {
        // 设置请求失败，交互锁请求仍正常响应。
        installHost(async (url) => url === "/init" ? recorderState("stopped") : url === "/settings" ? { status: "error", message: "保存失败" } : { status: "ok" });
        // 修改地图匹配方式后立即关闭会强制刷新设置。
        const wrapper = mount(PathRecorder);
        await flushPromises();
        await wrapper.find(".toolbar>button").trigger("click");
        await flushPromises();
        await wrapper.findAll(".settings-modal nav button")[2].trigger("click");
        await chooseUiOption(wrapper.find(".settings-content .ui-select"), "SIFT");
        await wrapper.find(".settings-modal>header button").trigger("click");
        await flushPromises();
        expect(wrapper.find(".settings-modal").exists()).toBe(true);
        expect(wrapper.text()).toContain("保存失败");
        wrapper.unmount();
    });

    it("keeps blank presets local until the user fills them", async () => {
        // 新增空白设置草稿时记录宿主调用，确保不会立即持久化。
        const request = installHost(async (url) => url === "/init" ? recorderState("stopped") : { status: "ok" });
        const wrapper = mount(PathRecorder);
        await flushPromises();
        await wrapper.find(".toolbar>button").trigger("click");
        await wrapper.findAll(".settings-modal nav button")[1].trigger("click");
        await wrapper.find(".settings-content>button").trigger("click");
        await flushPromises();
        expect(wrapper.findAll(".preset-card")).toHaveLength(1);
        expect(request.mock.calls.filter((call) => call[0] === "/settings")).toHaveLength(0);
        wrapper.unmount();
    });

    it("protects newer settings drafts from stale responses", async () => {
        // 初始化一个策略并延迟第一次设置响应，以制造旧响应晚到场景。
        const state = recorderState("stopped");
        state.settings.combatScripts = [{ name: "初始", value: "attack", def: true }];
        let resolveFirst: ((value: unknown) => void) | undefined;
        let settingsCalls = 0;
        const request = installHost(async (url, data) => {
            if (url === "/init") return state;
            if (url === "/settings") {
                settingsCalls += 1;
                if (settingsCalls === 1) return new Promise((resolve) => { resolveFirst = resolve; });
                return { status: "ok", settings: data };
            }
            return { status: "ok" };
        });
        const wrapper = mount(PathRecorder);
        await flushPromises();
        await wrapper.find(".toolbar>button").trigger("click");
        await wrapper.findAll(".settings-modal nav button")[1].trigger("click");
        // 发起旧修订保存后继续编辑，旧响应不得覆盖最新输入。
        vi.useFakeTimers();
        const nameInput = wrapper.find(".preset-card input.control");
        await nameInput.setValue("第一次");
        await vi.advanceTimersByTimeAsync(301);
        expect(request.mock.calls.filter((call) => call[0] === "/settings")).toHaveLength(1);
        await nameInput.setValue("第二次");
        resolveFirst?.({ status: "ok", settings: { ...state.settings, combatScripts: [{ name: "第一次", value: "attack", def: true }] } });
        await flushPromises();
        expect((wrapper.find(".preset-card input.control").element as HTMLInputElement).value).toBe("第二次");
        await vi.advanceTimersByTimeAsync(301);
        await flushPromises();
        expect(request.mock.calls.filter((call) => call[0] === "/settings")).toHaveLength(2);
        vi.useRealTimers();
        wrapper.unmount();
    });

    it("uses popovers for authors and strategy presets", async () => {
        // 作者和策略预设同时存在以覆盖两个自定义弹层。
        const state = recorderState("stopped");
        state.settings.authors = [{ name: "作者甲", links: "url", def: true }];
        state.settings.combatScripts = [{ name: "战斗预设", value: "keydown(W)", def: true }];
        installHost(async (url) => url === "/init" ? state : { status: "ok" });
        const wrapper = mount(PathRecorder);
        await flushPromises();

        // 作者弹层不再使用会撑开工具栏的 details。
        expect(wrapper.find("details.authors-menu").exists()).toBe(false);
        await wrapper.find(".authors-picker>button").trigger("click");
        expect(wrapper.find(".authors-popover").exists()).toBe(true);
        expect(wrapper.find(".authors-popover").attributes("role")).toBe("listbox");

        // 切换简易策略后按动作、搜索、参数顺序展示，并支持键盘选择。
        const row = wrapper.find(".point-row:not(.point-header)");
        await chooseUiOption(row.findAll(".ui-select")[2], "combat_script");
        expect(row.find(".strategy-trigger").exists()).toBe(true);
        await row.find(".strategy-trigger").trigger("click");
        await row.find(".strategy-search").setValue("战斗");
        await row.find(".strategy-search").trigger("keydown", { key: "Enter" });
        expect((row.find("textarea.action-params").element as HTMLTextAreaElement).value).toBe("keydown(W)");

        // 搜索框真正失焦到策略区域外时自动关闭联想菜单。
        await row.find(".strategy-trigger").trigger("click");
        expect(row.find(".strategy-menu").exists()).toBe(true);
        await row.find(".strategy-search").trigger("focusout", { relatedTarget: row.find("textarea.action-params").element });
        await flushPromises();
        expect(row.find(".strategy-menu").exists()).toBe(false);
        wrapper.unmount();
    });

    it("shows the full editor while Alt requests compact edit mode", async () => {
        // 宿主模式推送决定摘要侧栏与完整编辑区，不改变协议数据。
        installHost(async (url) => url === "/init" ? recorderState("stopped") : { status: "ok" });
        const wrapper = mount(PathRecorder);
        await flushPromises();
        window.htmlMask?.onMessage?.({ url: "/displayMode", data: { mode: "compact" } });
        await flushPromises();
        expect(wrapper.find(".compact").exists()).toBe(true);
        expect(wrapper.find(".app").exists()).toBe(false);
        window.htmlMask?.onMessage?.({ url: "/displayMode", data: { mode: "compact-edit" } });
        await flushPromises();
        expect(wrapper.find(".app.compact-edit").exists()).toBe(true);
        expect(wrapper.find(".app.compact-edit .toolbar").exists()).toBe(true);
        expect(wrapper.find(".app.compact-edit .point-table").exists()).toBe(true);
        expect(wrapper.find(".compact").exists()).toBe(false);
        wrapper.unmount();
    });

    it("saves exactly one default combat script", async () => {
        // 初始化设置故意提供两个非默认策略以验证单选约束。
        const state = recorderState("stopped");
        state.settings.combatScripts = [{ name: "甲", value: "attack", def: false }, { name: "乙", value: "skill()", def: false }];
        // 保存请求回显规范设置并供断言载荷。
        const request = installHost(async (url, data) => url === "/init" ? state : url === "/settings" ? { status: "ok", settings: data } : { status: "ok" });
        const wrapper = mount(PathRecorder);
        await flushPromises();
        await wrapper.find(".toolbar>button").trigger("click");
        await wrapper.findAll(".settings-modal nav button")[1].trigger("click");
        await wrapper.findAll('input[name="default-script"]')[1].setValue(true);
        await wrapper.find(".settings-modal>header button").trigger("click");
        await flushPromises();
        // 最后一次设置快照只能包含一个默认项。
        const settingsCall = request.mock.calls.filter((call) => call[0] === "/settings").at(-1);
        expect((settingsCall?.[1] as { combatScripts: Array<{ def?: boolean }> }).combatScripts.map((script) => script.def)).toEqual([false, true]);
        wrapper.unmount();
    });

    it("disables route editing while sampling", async () => {
        // 采样推送状态必须锁定页面全部路线编辑入口。
        const state = { ...recorderState("recording"), sampling: true };
        installHost(async (url) => url === "/init" ? state : { status: "ok" });
        const wrapper = mount(PathRecorder);
        await flushPromises();
        expect(wrapper.find(".topbar button").attributes("disabled")).toBeDefined();
        expect(wrapper.find(".toolbar>button").attributes("disabled")).toBeDefined();
        expect(wrapper.find(".file-field input").attributes("disabled")).toBeDefined();
        expect(wrapper.find(".point-row:not(.point-header) .ui-select__trigger").attributes("disabled")).toBeDefined();
        wrapper.unmount();
    });
});

describe("commission config battle list", () => {
    it("keeps the test UID entry hidden behind the add button", async () => {
        // 字面值 test 仍显示普通新增文案，并由点击触发开发者测试协议。
        const payload = { global: { uids: ["test"], skipSafeTeleport: true }, branches: {}, party: { global: {}, scopesByCommission: {} } };
        const request = installHost(async (url) => url === "/loadConfig" ? payload : { status: "ok" });
        const wrapper = mount(CommissionConfig);
        await flushPromises();
        const addButton = wrapper.findAll("button").find((button) => button.text() === "新增 UID");
        expect(addButton).toBeDefined();
        expect(wrapper.text()).toContain("跳过传送七天神像");
        expect(wrapper.find(".uid-grid").exists()).toBe(true);
        expect(wrapper.find(".uid-field button[aria-label='删除'] svg").exists()).toBe(true);
        await addButton?.trigger("click");
        await flushPromises();
        expect(request).toHaveBeenCalledWith("/openDeveloperTest", {});
        expect(wrapper.text()).toContain("新增 UID");
        wrapper.unmount();
    });

    it("renders grouped counts and opens the first search result", async () => {
        // 组合配置包含 NPC 多地点委托和 Basic 委托。
        const payload = { global: { uids: ["123"], skipSafeTeleport: false }, branches: {}, party: { global: {}, scopesByCommission: {
            多地点委托: [{ country: "璃月", typeDir: "NPC", locationDir: "甲" }, { country: "璃月", typeDir: "NPC", locationDir: "乙" }],
            基础委托: [{ country: "蒙德", typeDir: "Basic", locationDir: "城外" }],
        } } };
        installHost(async (url) => url === "/loadConfig" ? payload : { status: "ok" });
        const wrapper = mount(CommissionConfig);
        await flushPromises();
        await wrapper.findAll(".tabs button")[1].trigger("click");
        expect(wrapper.findAll(".country-groups").every((group) => !group.isVisible())).toBe(true);
        expect(wrapper.findAll(".group-items").every((group) => !group.isVisible())).toBe(true);
        expect(wrapper.text()).toContain("璃月");
        expect(wrapper.text()).toContain("NPC");
        expect(wrapper.text()).toContain("Basic");
        // 搜索自动展开首个有匹配项的分组并保留地点数量 2。
        await wrapper.find(".search").setValue("多地点");
        await flushPromises();
        const openCountry = wrapper.find('.country-header[aria-expanded="true"]');
        const openHeader = wrapper.find('.group-header[aria-expanded="true"]');
        const openGroup = openHeader.element.parentElement?.querySelector(".group-items");
        expect(openCountry.text()).toContain("璃月");
        expect(openHeader.text()).toContain("NPC");
        expect(openGroup?.textContent).toContain("多地点委托");
        expect(openGroup?.textContent).toContain("2");
        wrapper.unmount();
    });
});
