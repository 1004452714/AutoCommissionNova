import { flushPromises, mount } from "@vue/test-utils";
import type { DOMWrapper } from "@vue/test-utils";
import ProcessEditor from "@/apps/process-editor/App.vue";
import PathRecorder from "@/apps/path-recorder/App.vue";
import StepDataEditor from "@/apps/process-editor/StepDataEditor.vue";
import StepInspector from "@/apps/process-editor/StepInspector.vue";
import StepTypeMenu from "@/apps/process-editor/StepTypeMenu.vue";
import UiSelect from "@/shared/components/UiSelect.vue";
import CommissionConfig from "@/apps/commission-config/App.vue";
import DeveloperTest from "@/apps/developer-test/App.vue";
import { DEFAULT_SETTINGS, createPoint } from "@/apps/path-recorder/model";
import type { HtmlMaskHost } from "@/shared/bridge/html-mask";
import type { ProcessEditorInit, ProcessorMeta, ProcessScope } from "@/apps/process-editor/types";

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
        { type: "摧毁哨塔", category: "测试", dataSpec: { kind: "object", optional: true, fields: { navigation: { type: "string", label: "寻路方式", default: "图标寻路", alwaysVisible: true, options: ["图标寻路", "路径追踪"] }, path: { type: "string", label: "旧版路径文件" }, path1: { type: "string", label: "哨塔1路径" }, path2: { type: "string", label: "哨塔2路径" } } } },
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

// 点击分段控件中的目标选项，覆盖新建弹窗的国家与类型选择。
async function chooseSegment(field: DOMWrapper<Element>, value: string): Promise<void> {
    const segment = field.findAll(".ui-segmented button").find((button) => button.text() === value);
    if (!segment) throw new Error(`未找到分段选项：${value}`);
    await segment.trigger("click");
    await flushPromises();
}

describe("process editor workflows", () => {
    it("shows the focus guard after the process editor loses focus", async () => {
        // 与其余遮罩页一致：失焦后先点击保护层恢复交互，首开不显示。
        installHost(async (url) => url === "/init" ? processInit : { status: "ok" });
        const wrapper = mount(ProcessEditor, { attachTo: document.body });
        await flushPromises();
        expect(wrapper.find(".focus-guard").exists()).toBe(false);
        window.dispatchEvent(new Event("blur"));
        await flushPromises();
        expect(wrapper.find(".focus-guard").exists()).toBe(true);
        // 保护层消费首次点击后消失，交互恢复正常。
        await wrapper.find(".focus-guard").trigger("click");
        await flushPromises();
        expect(wrapper.find(".focus-guard").exists()).toBe(false);
        wrapper.unmount();
    });

    it("keeps the exact new location directory for target detection and saving", async () => {
        // 带序号地点目录必须原样发送给后端，不能被自动归一化为基础地点名。
        const exactScope = { country: "挪德卡莱", typeDir: "Basic" as const, commissionName: "测试委托", locationDir: "伦波岛-1" };
        const request = installHost(async (url, data) => {
            if (url === "/init") return processInit;
            if (url === "/target") return { status: "ok", scope: exactScope, path: "process/挪德卡莱/Basic/测试委托/伦波岛-1/process.json", exists: false, branches: [] };
            if (url === "/save") return { status: "ok", scope: exactScope, path: "process/挪德卡莱/Basic/测试委托/伦波岛-1/process.json", content: "[]", warnings: [], data };
            return { status: "ok" };
        });
        const wrapper = mount(ProcessEditor);
        await flushPromises();
        // 通过新建弹窗填写完整范围并确认进入新建模式。
        await wrapper.findAll(".side-mode-actions button")[1].trigger("click");
        await flushPromises();
        const fields = wrapper.findAll(".create-dialog .scope-field");
        // 国家与类型为分段控件，选中后恰好保留一个激活分段。
        await chooseSegment(fields[0], exactScope.country);
        await chooseSegment(fields[1], exactScope.typeDir);
        expect(fields[1].findAll(".ui-segmented button.active")).toHaveLength(1);
        await fields[2].find("input").setValue(exactScope.commissionName);
        await fields[3].find("input").setValue(exactScope.locationDir);
        await flushPromises();
        await wrapper.find(".create-dialog footer .primary").trigger("click");
        await flushPromises();
        expect(request.mock.calls.filter((call) => call[0] === "/target").at(-1)?.[1]).toMatchObject({ scope: exactScope });
        await wrapper.find(".step-toolbar .primary").trigger("click");
        await flushPromises();
        expect(request.mock.calls.find((call) => call[0] === "/save")?.[1]).toMatchObject({ scope: exactScope });
        wrapper.unmount();
    });

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

        // 地址检测维持单多点选择；坐标表表头只出现一次 X、Y、容差。
        const locationWrapper = mount(StepInspector, { props: { step: { type: "无数据步骤", loc: [1, 2, 3] }, processors: processInit.processors, roles: [], branches: [] } });
        expect(locationWrapper.findAll(".loc-table--single input")).toHaveLength(3);
        expect(locationWrapper.findAll(".loc-head span").map((item) => item.text())).toEqual(["#", "X", "Y", "容差", ""]);
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
        const watchtowerWrapper = mount(StepDataEditor, { props: { modelValue: { navigation: "图标寻路" }, spec: watchtowerSpec, stepType: "摧毁哨塔", processors: processInit.processors, roles: [], branches: [], pathOptions: [{ value: "tower-1.json", label: "tower-1.json" }, { value: "tower-2.json", label: "tower-2.json" }] } });
        expect(watchtowerWrapper.findAll(".data-field")).toHaveLength(1);
        expect(watchtowerWrapper.find(".optional-picker").exists()).toBe(false);
        await chooseUiOption(watchtowerWrapper.find(".data-field .ui-select"), "路径追踪");
        expect(watchtowerWrapper.emitted("update")?.at(-1)?.[0]).toEqual({ navigation: "路径追踪" });
        await watchtowerWrapper.setProps({ modelValue: { navigation: "路径追踪" } });
        expect(watchtowerWrapper.findAll(".data-field")).toHaveLength(3);
        expect(watchtowerWrapper.findAll(".field-label")[1].classes()).toContain("required");
        expect(watchtowerWrapper.findAll(".field-label")[2].classes()).toContain("required");
        expect(watchtowerWrapper.findAll(".field-label-hint")[1].text()).toBe("必填");
        expect(watchtowerWrapper.findAll(".field-label-hint")[2].text()).toBe("必填");
        expect(watchtowerWrapper.find(".optional-picker").exists()).toBe(false);
        // 两个路径输入按声明顺序对应哨塔一和哨塔二。
        const pathInputs = watchtowerWrapper.findAll(".data-field input");
        await pathInputs[0].setValue("tower-1.json");
        await watchtowerWrapper.setProps({ modelValue: { navigation: "路径追踪", path1: "tower-1.json" } });
        await watchtowerWrapper.findAll(".data-field input")[1].setValue("tower-2.json");
        await watchtowerWrapper.setProps({ modelValue: { navigation: "路径追踪", path1: "tower-1.json", path2: "tower-2.json" } });
        // 每座哨塔的按钮携带对应字段名，供页面精确回填录制结果。
        const watchtowerPathButtons = watchtowerWrapper.findAll(".data-field button.primary");
        expect(watchtowerPathButtons.map((button) => button.text())).toEqual(["编辑路径", "编辑路径"]);
        await watchtowerPathButtons[1].trigger("click");
        expect(watchtowerWrapper.emitted("recordPath")?.at(-1)).toEqual(["path2"]);
        await watchtowerWrapper.setProps({ modelValue: { navigation: "路径追踪", path: "legacy.json", path1: "tower-1.json", path2: "tower-2.json" } });
        await chooseUiOption(watchtowerWrapper.find(".data-field .ui-select"), "图标寻路");
        expect(watchtowerWrapper.emitted("update")?.at(-1)?.[0]).toEqual({ navigation: "图标寻路" });
        watchtowerWrapper.unmount();

        // 固若金汤明确说明累计击杀阈值和 -1 的无条件语义。
        const wavesWrapper = mount(StepDataEditor, { props: { modelValue: { wave1: { "-1": "route.json" } }, spec: processInit.processors[7].dataSpec, stepType: "固若金汤", processors: processInit.processors, roles: [], branches: [] } });
        expect(wavesWrapper.text()).toContain("填写累计击杀数；-1 表示本波次无条件执行");
        expect(wavesWrapper.find('[aria-label="累计击杀数"]').attributes("placeholder")).toBe("例如 -1、3、6");
        wavesWrapper.unmount();
    });

    it("switches the map path button back to recording after the text is cleared", async () => {
        // 已有路径显示编辑入口，清空文本框后回到录制入口，无需额外按钮。
        const wrapper = mount(StepInspector, { props: {
            step: { type: "地图追踪", data: "route.json" }, processors: processInit.processors, roles: [], branches: [],
            pathOptions: [{ value: "route.json", label: "route.json" }],
        } });
        expect(wrapper.find(".record-row button.primary").text()).toBe("编辑路径");
        expect(wrapper.findAll(".record-row button")).toHaveLength(1);
        await wrapper.find(".record-row input").setValue("");
        // 清空后按钮切回录制路径，且必填 data 保留为空串而不是整个消失。
        expect(wrapper.find(".record-row button.primary").text()).toBe("录制路径");
        expect(wrapper.find(".record-row input").exists()).toBe(true);
        expect(wrapper.emitted("changed")?.at(-1)?.[0]).toMatchObject({ type: "地图追踪", data: "" });
        // 重新选中已有路径后按钮恢复为编辑入口。
        await wrapper.find(".record-row input").setValue("route.json");
        expect(wrapper.find(".record-row button.primary").text()).toBe("编辑路径");
        wrapper.unmount();
    });

    it("rejects duplicate wave conditions instead of overwriting another route", async () => {
        // 波次条件改名撞上已有条件时必须保持原数据不变。
        const wrapper = mount(StepDataEditor, { props: {
            modelValue: { wave1: { "3": "three.json", "6": "six.json" } },
            spec: processInit.processors.find(processor => processor.type === "固若金汤")!.dataSpec,
            stepType: "固若金汤", processors: processInit.processors, roles: [], branches: [],
        } });
        const conditions = wrapper.findAll(".wave-route input[type=number]");
        expect(conditions).toHaveLength(2);
        await conditions[0].setValue("6");
        expect(wrapper.emitted("update")).toBeUndefined();
        // 非重复条件正常提交改名。
        await conditions[0].setValue("5");
        expect(wrapper.emitted("update")?.at(-1)?.[0]).toEqual({ wave1: { "5": "three.json", "6": "six.json" } });
        wrapper.unmount();
    });

    it("keeps the description field when its text is cleared", async () => {
        // 剪切会把输入框瞬时清空，字段本身必须继续存在以便继续录入。
        const wrapper = mount(StepInspector, { props: { step: { type: "对象步骤", desc: "原文" }, processors: processInit.processors, roles: [], branches: [] } });
        const description = wrapper.find('input[placeholder="委托描述中包含此处文本才执行"]');
        expect(description.exists()).toBe(true);
        await description.setValue("");
        expect(wrapper.emitted("changed")?.at(-1)?.[0]).toMatchObject({ desc: "" });
        // 字段仍被渲染，用户可以直接继续粘贴。
        expect(wrapper.find('input[placeholder="委托描述中包含此处文本才执行"]').exists()).toBe(true);
        wrapper.unmount();
    });

    it("selects, creates, and opens subprocess documents", async () => {
        // 已有子流程使用编辑按钮，手动的新路径使用新建按钮。
        const subprocessSpec = processInit.processors.find(processor => processor.type === "执行子流程")!.dataSpec;
        const fieldWrapper = mount(StepDataEditor, { props: {
            modelValue: { path: "nested/child.json" }, spec: subprocessSpec, stepType: "执行子流程",
            processors: processInit.processors, roles: [], branches: [], subProcessOptions: [{ value: "nested/child.json", label: "nested/child.json" }, { value: "subprocess.json", label: "subprocess.json" }],
        } });
        expect(fieldWrapper.find("button.primary").text()).toBe("编辑子流程");
        await fieldWrapper.find("button.primary").trigger("click");
        expect(fieldWrapper.emitted("editSubprocess")?.[0]).toEqual(["nested/child.json"]);
        await fieldWrapper.setProps({ modelValue: { path: "nested/new.json" } });
        expect(fieldWrapper.find("button.primary").text()).toBe("新建子流程");
        await fieldWrapper.find("button.primary").trigger("click");
        expect(fieldWrapper.emitted("editSubprocess")?.[1]).toEqual(["nested/new.json"]);
        // 空路径时按钮保持可用，点击交给页面自动编号创建。
        await fieldWrapper.setProps({ modelValue: {} });
        expect(fieldWrapper.find("button.primary").text()).toBe("新建子流程");
        expect(fieldWrapper.find("button.primary").attributes("disabled")).toBeUndefined();
        await fieldWrapper.find("button.primary").trigger("click");
        expect(fieldWrapper.emitted("createSubprocess")).toHaveLength(1);
        // 以 process.json 结尾的合法文件名（如 subprocess.json）不被主流程排除规则误伤，归一化后命中候选。
        await fieldWrapper.setProps({ modelValue: { path: "./subprocess.json" } });
        expect(fieldWrapper.find("button.primary").text()).toBe("编辑子流程");
        await fieldWrapper.find("button.primary").trigger("click");
        expect(fieldWrapper.emitted("editSubprocess")?.[2]).toEqual(["subprocess.json"]);
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
        await page.find(".recent-list button").trigger("click");
        await flushPromises();
        await page.find(".step").trigger("click");
        await page.find(".inspector button.primary").trigger("click");
        await flushPromises();
        expect(request).toHaveBeenCalledWith("/openSubprocess", expect.objectContaining({ reference: "child.json" }));
        expect(page.find(".subprocess-return").exists()).toBe(true);
        expect(page.find(".step-toolbar button.primary").text()).toBe("保存");
        await page.find(".subprocess-return").trigger("click");
        expect(page.findAll(".step")).toHaveLength(1);
        page.unmount();
    });

    it("creates the next numbered subprocess from an empty path", async () => {
        // 空路径的执行子流程步骤一键创建 subprocess-X.json 并进入编辑。
        const request = installHost(async (url) => {
            if (url === "/init") return processInit;
            if (url === "/target") return { status: "ok", scope: processScope, path: "process/process.json", exists: true, branches: [], subProcessOptions: [{ value: "subprocess-1.json", label: "subprocess-1.json" }] };
            if (url === "/load") return { status: "ok", scope: processScope, path: "process/process.json", content: JSON.stringify([{ type: "执行子流程", data: { path: "" } }]), recentFiles: [], branches: [] };
            if (url === "/nextSubprocess") return { status: "ok", name: "subprocess-2.json" };
            if (url === "/openSubprocess") return { status: "ok", path: "process/subprocess-2.json", reference: "subprocess-2.json", exists: false, content: "[]", subProcessOptions: [] };
            return { status: "ok" };
        });
        const wrapper = mount(ProcessEditor);
        await flushPromises();
        await wrapper.find(".recent-list button").trigger("click");
        await flushPromises();
        await wrapper.find(".step").trigger("click");
        const createButton = wrapper.find(".inspector button.primary");
        expect(createButton.text()).toBe("新建子流程");
        expect(createButton.attributes("disabled")).toBeUndefined();
        await createButton.trigger("click");
        await flushPromises();
        expect(request).toHaveBeenCalledWith("/nextSubprocess", expect.objectContaining({ scope: processScope }));
        expect(request).toHaveBeenCalledWith("/openSubprocess", expect.objectContaining({ reference: "subprocess-2.json" }));
        expect(wrapper.find(".subprocess-return").exists()).toBe(true);
        expect(wrapper.find(".step-toolbar button.primary").text()).toBe("保存");
        wrapper.unmount();
    });

    it("rolls back the subprocess binding when entering the subprocess fails", async () => {
        // 进入子流程编辑失败时，主流程不得残留指向不存在文件的引用，也不得误标脏。
        const request = installHost(async (url) => {
            if (url === "/init") return processInit;
            if (url === "/target") return { status: "ok", scope: processScope, path: "process/process.json", exists: true, branches: [], subProcessOptions: [] };
            if (url === "/load") return { status: "ok", scope: processScope, path: "process/process.json", content: JSON.stringify([{ type: "执行子流程", data: { path: "" } }]), recentFiles: [], branches: [] };
            if (url === "/nextSubprocess") return { status: "ok", name: "subprocess-2.json" };
            if (url === "/openSubprocess") return { status: "error", message: "不能打开当前流程或上级流程" };
            return { status: "ok" };
        });
        const wrapper = mount(ProcessEditor);
        await flushPromises();
        await wrapper.find(".recent-list button").trigger("click");
        await flushPromises();
        await wrapper.find(".step").trigger("click");
        await wrapper.find(".inspector button.primary").trigger("click");
        await flushPromises();
        expect(request).toHaveBeenCalledWith("/nextSubprocess", expect.anything());
        // 未进入子流程编辑：无返回按钮，步骤引用回滚为空，按钮文案保持“新建子流程”。
        expect(wrapper.find(".subprocess-return").exists()).toBe(false);
        expect(wrapper.find(".inspector button.primary").text()).toBe("新建子流程");
        expect(wrapper.find(".status").text()).toContain("不能打开当前流程或上级流程");
        // 未标脏：关闭编辑器不弹未保存确认。
        await wrapper.find(".topbar button").trigger("click");
        expect(wrapper.find("[role=dialog]").exists()).toBe(false);
        wrapper.unmount();
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
        // 页面先进入新建模式，再点击最近文件回到现有流程。
        const wrapper = mount(ProcessEditor);
        await flushPromises();
        await wrapper.findAll(".side-mode-actions button")[1].trigger("click");
        await flushPromises();
        const fields = wrapper.findAll(".create-dialog .scope-field");
        await chooseSegment(fields[0], processScope.country);
        await chooseSegment(fields[1], processScope.typeDir);
        await fields[2].find("input").setValue(processScope.commissionName);
        await fields[3].find("input").setValue(processScope.locationDir);
        await flushPromises();
        await wrapper.find(".create-dialog footer .primary").trigger("click");
        await flushPromises();
        await wrapper.find(".recent-list button").trigger("click");
        await flushPromises();
        expect(request.mock.calls.find((call) => call[0] === "/load")?.[1]).toMatchObject({ fileName: "branch.json", scope: processScope });
        // 加载后的现有流程允许直接保存。
        expect(wrapper.find(".step-toolbar button.primary").attributes("disabled")).toBeUndefined();

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

    it("refreshes recents from saves and clears the list on demand", async () => {
        // 保存响应回传最近列表，清除按钮调用 /clearRecents 并清空侧栏。
        const recentItem = { scope: processScope, fileName: "process.json", path: "process/process.json" };
        const request = installHost(async (url) => {
            if (url === "/init") return processInit;
            if (url === "/target") return { status: "ok", scope: processScope, path: "process/process.json", exists: true, branches: [] };
            if (url === "/load") return { status: "ok", scope: processScope, path: "process/process.json", content: "[]", recentFiles: [], branches: [] };
            if (url === "/save") return { status: "ok", path: "process/process.json", content: "[]", warnings: [], recentFiles: [recentItem] };
            if (url === "/clearRecents") return { status: "ok", recentFiles: [] };
            return { status: "ok" };
        });
        const wrapper = mount(ProcessEditor);
        await flushPromises();
        await wrapper.find(".recent-list button").trigger("click");
        await flushPromises();
        // 保存后侧栏立即展示后端回传的最近列表（含最近新建）。
        expect(wrapper.find(".recent-list button").exists()).toBe(false);
        await wrapper.find(".step-toolbar button.primary").trigger("click");
        await flushPromises();
        expect(wrapper.find(".recent-list button").text()).toContain("测试委托");
        // 清除按钮把最近列表清空并同步状态。
        await wrapper.find(".recent-clear").trigger("click");
        await flushPromises();
        expect(request.mock.calls.some((call) => call[0] === "/clearRecents")).toBe(true);
        expect(wrapper.find(".recent-list button").exists()).toBe(false);
        expect(wrapper.find(".recent-clear").attributes("disabled")).toBeDefined();
        wrapper.unmount();
    });

    it("adds the map tracking step directly from the add menu", async () => {
        // 单条目分类在添加菜单中提升为一级直加项，悬停时也不再展开二级步骤列。
        const processors: ProcessorMeta[] = [
            { type: "等待", category: "流程控制", dataSpec: { kind: "number", label: "等待毫秒", default: 1000 } },
            { type: "执行子流程", category: "流程控制", dataSpec: { kind: "object", fields: { path: { type: "string", label: "子流程文件", required: true } } } },
            { type: "地图追踪", category: "路径与定位", dataSpec: { kind: "string", label: "路径文件" } },
        ];
        const wrapper = mount(StepTypeMenu, { props: { processors, variant: "add", ariaLabel: "添加步骤" } });
        await wrapper.find("[role=combobox]").trigger("click");
        await flushPromises();
        const entries = Array.from(document.querySelectorAll<HTMLElement>(".step-type-popover .step-type-categories [role=menuitem]"));
        expect(entries.map((entry) => entry.textContent)).toEqual(["流程控制", "地图追踪"]);
        // 多条目分类默认展开二级步骤列。
        expect(document.querySelector(".step-type-popover .step-type-items")).not.toBeNull();
        const direct = entries.find((entry) => entry.textContent === "地图追踪")!;
        expect(direct.getAttribute("aria-haspopup")).toBeNull();
        expect(direct.querySelector("svg")).toBeNull();
        // 悬停直加项后二级列整体消失，不会重复出现地图追踪。
        direct.dispatchEvent(new Event("mouseenter"));
        await flushPromises();
        expect(document.querySelector(".step-type-popover .step-type-items")).toBeNull();
        direct.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        await flushPromises();
        expect(wrapper.emitted("change")?.[0]).toEqual(["地图追踪"]);
        wrapper.unmount();
    });

    it("hides menus and dialogs together when the host toggles visibility", async () => {
        // ~ 隐藏遮罩时，传送弹层和文件弹窗必须随主界面一起消失。
        installHost(async (url) => url === "/init" ? processInit : { status: "ok", scope: processScope, path: "process/process.json", exists: true, branches: [] });
        // isVisible 依赖真实计算样式，必须附加到 document。
        const wrapper = mount(ProcessEditor, { attachTo: document.body });
        await flushPromises();
        await wrapper.find('[aria-label="添加步骤"]').trigger("click");
        await flushPromises();
        expect(document.querySelector(".step-type-popover")).not.toBeNull();
        window.htmlMask?.onMessage?.({ url: "/toggleVisibility", data: { visible: false } });
        await flushPromises();
        expect(document.querySelector(".step-type-popover")).toBeNull();
        expect(wrapper.find(".app").isVisible()).toBe(false);
        // 恢复显示后打开文件弹窗，再次隐藏时弹窗同样不可见。
        window.htmlMask?.onMessage?.({ url: "/toggleVisibility", data: { visible: true } });
        await flushPromises();
        await wrapper.findAll(".side-mode-actions button")[0].trigger("click");
        await flushPromises();
        expect(wrapper.find(".modal-backdrop").isVisible()).toBe(true);
        window.htmlMask?.onMessage?.({ url: "/toggleVisibility", data: { visible: false } });
        await flushPromises();
        expect(wrapper.find(".modal-backdrop").isVisible()).toBe(false);
        wrapper.unmount();
    });

    it("defaults to a covered country and warns when the target file exists", async () => {
        // 默认国家取第一个存在流程的国家；目标 process.json 已存在时提示并禁用确认。
        const request = installHost(async (url, data) => {
            if (url === "/init") return { scopes: [{ country: "璃月", typeDir: "NPC", commissionName: "已有委托", locationDir: "港" }], roles: [], recentFiles: [], processors: processInit.processors };
            if (url === "/targetExists") {
                const name = (data as { scope?: { commissionName?: string } }).scope?.commissionName ?? "";
                // 模拟后端 safePart 校验：委托名含非法字符时返回错误。
                if (name.includes("/")) return { status: "error", message: "委托名包含非法字符或为空" };
                return { status: "ok", exists: name === "已有委托", path: "process/x/process.json" };
            }
            return { status: "ok" };
        });
        const wrapper = mount(ProcessEditor);
        await flushPromises();
        await wrapper.findAll(".side-mode-actions button")[1].trigger("click");
        await flushPromises();
        const fields = wrapper.findAll(".create-dialog .scope-field");
        expect(fields[0].find(".ui-segmented button.active").text()).toBe("璃月");
        await fields[2].find("input").setValue("已有委托");
        await fields[3].find("input").setValue("港");
        await new Promise((resolve) => setTimeout(resolve, 320));
        await flushPromises();
        expect(request.mock.calls.some((call) => call[0] === "/targetExists")).toBe(true);
        expect(wrapper.find(".duplicate-hint").exists()).toBe(true);
        expect(wrapper.find(".create-dialog footer .primary").attributes("disabled")).toBeDefined();
        // 探测报错（委托名含非法字符）时同样禁用确认，并把原因透出到提示区。
        await fields[2].find("input").setValue("非/法");
        await new Promise((resolve) => setTimeout(resolve, 320));
        await flushPromises();
        expect(wrapper.find(".duplicate-hint").text()).toContain("非法");
        expect(wrapper.find(".create-dialog footer .primary").attributes("disabled")).toBeDefined();
        // 换成新委托后提示消失，确认恢复可用。
        await fields[2].find("input").setValue("新委托");
        await new Promise((resolve) => setTimeout(resolve, 320));
        await flushPromises();
        expect(wrapper.find(".duplicate-hint").exists()).toBe(false);
        expect(wrapper.find(".create-dialog footer .primary").attributes("disabled")).toBeUndefined();
        wrapper.unmount();
    });

    it("opens the add menu with focus scrolling suppressed", async () => {
        // 首次打开时弹层已带定位，focus 不得触发程序化滚动（会被滚动监听误判为视口变化而关闭菜单）。
        const processors: ProcessorMeta[] = [
            { type: "地图追踪", category: "路径与定位", dataSpec: { kind: "string", label: "路径文件" } },
        ];
        const focusSpy = vi.spyOn(HTMLElement.prototype, "focus");
        const wrapper = mount(StepTypeMenu, { props: { processors, variant: "add", ariaLabel: "添加步骤" } });
        await wrapper.find("[role=combobox]").trigger("click");
        await flushPromises();
        expect(focusSpy).toHaveBeenCalledWith({ preventScroll: true });
        expect(document.querySelector(".step-type-popover")).not.toBeNull();
        focusSpy.mockRestore();
        wrapper.unmount();
    });

    it("keeps the sidebar passive until the user opens a dialog", async () => {
        // 初始化只提供候选，不应主动探测或选中现有流程。
        const request = installHost(async (url) => url === "/init" ? processInit : { status: "ok", scope: processScope, path: "process/process.json", exists: true, branches: [] });
        const wrapper = mount(ProcessEditor);
        await flushPromises();
        // 侧栏只有打开和新建两个入口，不提供级联选择；校验全部独占下一行。
        expect(wrapper.findAll(".side-mode-actions button").map((button) => button.text())).toEqual(["打开", "新建"]);
        expect(wrapper.find(".side-validate").text()).toBe("校验全部");
        expect(wrapper.find(".sidebar .ui-select").exists()).toBe(false);
        expect(wrapper.find(".step-toolbar button.primary").attributes("disabled")).toBeDefined();
        expect(request.mock.calls.some((call) => call[0] === "/target")).toBe(false);
        // 打开新建弹窗在确认前不探测目标，取消后保持初始状态。
        await wrapper.findAll(".side-mode-actions button")[1].trigger("click");
        await flushPromises();
        expect(wrapper.find(".create-dialog").exists()).toBe(true);
        expect(request.mock.calls.some((call) => call[0] === "/target")).toBe(false);
        await wrapper.find(".create-dialog footer button").trigger("click");
        await flushPromises();
        expect(wrapper.find(".create-dialog").exists()).toBe(false);
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
        await wrapper.find(".recent-list button").trigger("click");
        await flushPromises();
        await wrapper.find(".step").trigger("click");
        await wrapper.find(".record-row button").trigger("click");
        await flushPromises();
        expect((wrapper.find(".record-row input").element as HTMLInputElement).value).toBe("recorded.json");
        wrapper.unmount();
    });

    it("writes recorded path back to the selected watchtower field", async () => {
        // 双路径录制只替换用户点击的字段，避免覆盖另一座哨塔的路径。
        installHost(async (url) => {
            if (url === "/init") return processInit;
            if (url === "/target") return { status: "ok", scope: processScope, path: "process/process.json", exists: true, branches: [] };
            if (url === "/load") return { status: "ok", scope: processScope, path: "process/process.json", content: JSON.stringify([{ type: "摧毁哨塔", data: { navigation: "路径追踪", path1: "tower-1.json", path2: "tower-2.json" } }]), recentFiles: [], branches: [] };
            if (url === "/recordPath") return { status: "saved", fileName: "recorded-tower-2.json", scope: processScope };
            return { status: "ok" };
        });
        // 选择哨塔步骤并点击第二个路径按钮。
        const wrapper = mount(ProcessEditor);
        await flushPromises();
        await wrapper.find(".recent-list button").trigger("click");
        await flushPromises();
        await wrapper.find(".step").trigger("click");
        await wrapper.findAll(".data-field button.primary")[1].trigger("click");
        await flushPromises();
        // 路径一保持原值，路径二接收录制器返回的新文件名。
        const pathInputs = wrapper.findAll(".data-field input");
        expect((pathInputs[0].element as HTMLInputElement).value).toBe("tower-1.json");
        expect((pathInputs[1].element as HTMLInputElement).value).toBe("recorded-tower-2.json");
        wrapper.unmount();
    });
});

describe("path recorder workflows", () => {
    it("only starts reordering from the drag handle", async () => {
        // 长按行内文本不应触发行排序，只有手柄拖拽才改变顺序。
        const request = installHost(async (url) => {
            if (url === "/init") return recorderState("stopped");
            if (url === "/points") return { status: "ok", phase: "stopped" };
            return { status: "ok" };
        });
        const wrapper = mount(PathRecorder);
        await flushPromises();
        const row = wrapper.find(".point-row:not(.point-header)");
        // 行本身不再可拖拽，只有手柄带 draggable。
        expect(row.attributes("draggable")).toBeUndefined();
        expect(row.find(".drag").attributes("draggable")).toBe("true");
        // 行元素上不再挂 dragstart，因此不存在的拖拽不会引发任何重排请求。
        const blocked = new Event("dragstart", { bubbles: true, cancelable: true });
        Object.defineProperty(blocked, "target", { value: row.element });
        row.element.dispatchEvent(blocked);
        await flushPromises();
        expect(request.mock.calls.some((call) => call[0] === "/points")).toBe(false);
        wrapper.unmount();
    });

    it("saves the UI file name and confirms before overwriting a different file", async () => {
        // 首次响应要求覆盖确认，确认后的重试必须保留页面填写的文件名。
        const request = installHost(async (url, data) => {
            if (url === "/init") return recorderState("stopped");
            if (url === "/points") return { status: "ok", phase: "stopped" };
            if (url === "/save" && !(data as { overwrite?: boolean }).overwrite) return { status: "confirm_overwrite", path: "custom.json", fileName: "custom.json" };
            if (url === "/save") return { status: "ok", path: "custom.json", fileName: "custom.json" };
            return { status: "ok" };
        });
        const wrapper = mount(PathRecorder);
        await flushPromises();
        await wrapper.find<HTMLInputElement>(".file-field input").setValue("custom.json");
        await wrapper.find(".footer .primary").trigger("click");
        await flushPromises();
        expect(request.mock.calls.find((call) => call[0] === "/save")?.[1]).toMatchObject({ fileName: "custom.json", overwrite: false });
        expect(wrapper.find("[role=dialog]").text()).toContain("覆盖路径文件");
        await wrapper.find("[role=dialog] .primary").trigger("click");
        await flushPromises();
        expect(request.mock.calls.filter((call) => call[0] === "/save").at(-1)?.[1]).toMatchObject({ fileName: "custom.json", overwrite: true });
        wrapper.unmount();
    });

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

        // 简易策略参数框输入后出现补全菜单，移出参数区域即收起。
        await row.find("textarea.action-params").trigger("focus");
        await row.find("textarea.action-params").setValue("key");
        await flushPromises();
        expect(row.find(".syntax-menu").exists()).toBe(true);
        await row.find(".param-cell").trigger("focusout", { relatedTarget: document.body });
        await flushPromises();
        expect(row.find(".syntax-menu").exists()).toBe(false);

        // 切换动作会卸载参数框，补全菜单不能残留指向旧目标。
        await row.find("textarea.action-params").setValue("key");
        await flushPromises();
        expect(row.find(".syntax-menu").exists()).toBe(true);
        await chooseUiOption(row.findAll(".ui-select")[2], "fight");
        await flushPromises();
        expect(row.find(".syntax-menu").exists()).toBe(false);
        wrapper.unmount();
    });

    it("drops stale array drafts when a field is removed and added again", async () => {
        // 未失焦就删除字段时，草稿不能残留到重新添加的同名字段上。
        const objectSpec = processInit.processors.find(processor => processor.type === "对象步骤")!.dataSpec;
        const wrapper = mount(StepDataEditor, { props: {
            modelValue: { name: "甲", items: ["旧条目"] }, spec: objectSpec, stepType: "对象步骤",
            processors: processInit.processors, roles: [], branches: [],
        } });
        const textarea = wrapper.find("textarea");
        await textarea.setValue("草稿内容");
        // 直接移除字段，不触发文本域失焦清理。
        const removeButton = wrapper.findAll(".data-field .danger.mini").at(-1)!;
        await removeButton.trigger("click");
        expect(wrapper.emitted("update")?.at(-1)?.[0]).toEqual({ name: "甲" });
        wrapper.unmount();
    });

    it("closes an editable select when its input loses focus", async () => {
        // 可编辑下拉在移焦到外部后必须自行收起，避免弹层残留遮挡后续操作。
        const wrapper = mount(UiSelect, {
            attachTo: document.body,
            props: { editable: true, modelValue: "", options: [{ value: "a.json", label: "a.json" }], ariaLabel: "路径" },
        });
        // 外层容器提供稳定的聚焦目标。
        const outside = document.createElement("button");
        document.body.appendChild(outside);
        await wrapper.find("input").trigger("focus");
        await flushPromises();
        expect(wrapper.find('input[aria-expanded="true"]').exists()).toBe(true);
        outside.focus();
        await wrapper.find("input").trigger("blur");
        await flushPromises();
        expect(wrapper.find('input[aria-expanded="true"]').exists()).toBe(false);
        outside.remove();
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
    it("opens developer testing by double-clicking the title", async () => {
        // 开发者入口只绑定标题双击，UID 输入始终保持数字文本框。
        const payload = { uids: ["123"], selectedUid: "123", currentUid: "123", global: { skipSafeTeleport: true }, branches: {}, party: { global: {}, scopesByCommission: {} } };
        const request = installHost(async (url) => url === "/loadConfig" ? payload : { status: "ok" });
        const wrapper = mount(CommissionConfig);
        await flushPromises();
        expect(wrapper.text()).toContain("跳过传送七天神像");
        expect(wrapper.findAll(".appbar .tabs [role='tab']")).toHaveLength(3);
        expect(wrapper.find(".workarea-global .sidebar").exists()).toBe(false);
        expect(wrapper.find(".account-row").exists()).toBe(true);
        expect(wrapper.text()).not.toContain("删除");
        const uidInput = wrapper.find<HTMLInputElement>(".account-row input");
        expect(uidInput.attributes("type")).toBe("text");
        expect(uidInput.attributes("inputmode")).toBe("numeric");
        await uidInput.setValue("test123");
        expect(uidInput.element.value).toBe("123");
        expect(wrapper.find(".account-row > button").text()).toBe("新增 UID");
        await wrapper.find(".toggle-row .switch").trigger("click");
        await wrapper.find(".app-identity h1").trigger("dblclick");
        await flushPromises();
        const calls = request.mock.calls.map(([url]) => url);
        expect(calls.indexOf("/saveConfig")).toBeLessThan(calls.indexOf("/openDeveloperTest"));
        expect(request).toHaveBeenCalledWith("/openDeveloperTest", {});
        wrapper.unmount();
    });

    it("saves the previous UID before loading another account", async () => {
        // 两个账号拥有独立加载响应，切换动作必须先提交当前账号内容。
        const payload = (uid: string, skipSafeTeleport: boolean) => ({
            uids: ["123", "456"], selectedUid: uid, currentUid: "123",
            global: { skipSafeTeleport }, branches: {}, party: { global: {}, scopesByCommission: {} },
        });
        const request = installHost(async (url, data) => {
            const requestData = data as { uid?: string };
            if (url === "/loadConfig") return requestData.uid === "456" ? payload("456", false) : payload("123", true);
            return { status: "ok" };
        });
        const wrapper = mount(CommissionConfig);
        await flushPromises();
        await wrapper.find(".toggle-row .switch").trigger("click");
        await chooseUiOption(wrapper.find(".account-row .ui-select"), "456");
        const calls = request.mock.calls.map(([url, data]) => ({ url, data: data as { uid?: string } }));
        const saveIndex = calls.findIndex((call) => call.url === "/saveConfig" && call.data.uid === "123");
        const loadIndex = calls.findIndex((call) => call.url === "/loadConfig" && call.data.uid === "456");
        expect(saveIndex).toBeGreaterThan(-1);
        expect(loadIndex).toBeGreaterThan(saveIndex);
        expect(wrapper.text()).toContain("456");
        wrapper.unmount();
    });

    it("renders grouped counts and opens the first search result", async () => {
        // 组合配置包含 NPC 多地点委托和 Basic 委托。
        const payload = { uids: ["123"], selectedUid: "123", currentUid: "123", global: { skipSafeTeleport: false }, branches: {}, party: { global: {}, scopesByCommission: {
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

describe("developer test form", () => {
    it("keeps labels inline without extending select click targets", async () => {
        // 普通容器不会像原生 label 一样把外围点击转发给下拉按钮。
        installHost(async (url) => url === "/loadTestOptions" ? {
            modes: ["case", "basic", "npc"],
            cases: ["测试用例"],
            scopes: [{ mode: "basic", country: "蒙德", commissionName: "示例委托", location: "城外", processFiles: ["process.json"] }],
        } : { status: "ok" });
        const wrapper = mount(DeveloperTest, { attachTo: document.body });
        await flushPromises();

        const rows = wrapper.findAll(".field-row");
        expect(rows).toHaveLength(7);
        expect(rows[0].element.tagName).toBe("DIV");
        expect(rows[0].find("label").exists()).toBe(false);
        await rows[0].find(".field-label").trigger("click");
        expect(document.querySelector(".ui-select__menu")).toBeNull();
        await rows[0].find(".ui-select__trigger").trigger("click");
        await flushPromises();
        expect(document.querySelector(".ui-select__menu")).not.toBeNull();
        wrapper.unmount();
    });
});
