<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, toRaw } from "vue";
import { requestHtmlMask, subscribeHtmlMask, toError } from "@/shared/bridge/html-mask";
import { copy } from "@/shared/i18n/zh-CN";
import UiSelect from "@/shared/components/UiSelect.vue";
import StepInspector from "@/apps/process-editor/StepInspector.vue";
import StepTypeMenu from "@/apps/process-editor/StepTypeMenu.vue";
import { cloneProcessValue, convertStepType, defaultStep, diagnosticText, editableRecord } from "@/apps/process-editor/model";
import type { DiagnosticResult, LoadResult, ProcessEditorInit, ProcessScope, ProcessStep, ProcessorMeta, RecentProcess, RecordPathResult, SaveResult, SubProcessResult, TargetResult } from "@/apps/process-editor/types";

// 文档快照用于在多层子流程之间无损恢复编辑状态。
interface DocumentSnapshot {
    reference: string;
    path: string;
    exists: boolean;
    steps: ProcessStep[];
    selectedIndex: number;
    dirty: boolean;
    loadedPath: string;
    subProcessOptions: Array<{ value: string; label: string }>;
}

// 页面文案来自共享中文文案表。
const text = copy.processEditor;
// 通用操作文案来自共享中文文案表。
const commonText = copy.common;
// 后端扫描到的现有流程范围。
const scopes = ref<ProcessScope[]>([]);
// 后端声明的所有步骤处理器。
const processors = ref<ProcessorMeta[]>([]);
// 角色候选用于编辑复杂 JSON 时提供提示。
const roles = ref<string[]>([]);
// 当前目标的分支候选帮助编辑用户分支选择步骤。
const branches = ref<Array<{ key: string; label: string }>>([]);
// 最近打开流程保持后端持久化顺序。
const recentFiles = ref<RecentProcess[]>([]);
// 编辑器模式决定范围来自级联选择还是新建表单。
const createMode = ref(false);
// 现有流程级联值。
const existingScope = reactive({ country: "", typeDir: "" as "" | ProcessScope["typeDir"], commissionName: "", locationDir: "" });
// 新建流程表单值。
const newScope = reactive<ProcessScope>({ country: "", typeDir: "NPC", commissionName: "", locationDir: "" });
// 新建流程解析或保存后固定使用后端返回的真实地点目录。
const savedScope = ref<ProcessScope | null>(null);
// 新建模式允许指定 JSON 文件名。
const fileName = ref("process.json");
// 现有模式保存最近文件实际绑定的文件名。
const existingFileName = ref("process.json");
// 当前目标探测结果决定路径和保存可用性。
const target = ref<TargetResult | null>(null);
// 异步目标探测序号丢弃过期响应。
let targetSequence = 0;
// 已加载路径用于防止误把另一个现有流程覆盖。
const loadedPath = ref("");
// 流程步骤数组是编辑器的核心页面状态。
const steps = ref<ProcessStep[]>([]);
// 当前选中步骤索引，-1 表示未选择。
const selectedIndex = ref(-1);
// 未保存标记控制切换、打开、清空和关闭确认。
const dirty = ref(false);
// 页面可见性由 BetterGI 的 ~ 快捷键推送控制。
const visible = ref(true);
// 加载状态阻止重复读取。
const loading = ref(false);
// 保存状态阻止重复写入。
const saving = ref(false);
// 路径录制状态阻止编辑器发起冲突请求。
const recording = ref(false);
// 当前子流程相对路径为空时表示正在编辑顶层流程。
const activeSubProcess = ref("");
// 当前活动文档的实际路径和落盘状态支持首次保存创建。
const activeDocumentPath = ref("");
const activeDocumentExists = ref(true);
// 子流程候选随当前活动文档变化并排除导航链。
const subProcessOptions = ref<Array<{ value: string; label: string }>>([]);
// 导航栈按打开顺序保存所有父文档草稿。
const documentStack = ref<DocumentSnapshot[]>([]);
// 状态栏文字保留后端多行诊断。
const statusText = ref<string>(copy.common.loading);
// 状态语义颜色区分成功、警告和错误。
const statusKind = ref<"" | "success" | "warning" | "error">("");
// 新增步骤下拉当前选择。
const newStepType = ref("");
// HTML5 拖放开始时记录原始索引。
const dragIndex = ref(-1);
// 未保存确认弹窗的待执行 Promise。
let confirmResolve: ((value: boolean) => void) | null = null;
// 确认弹窗是否占用工作区交互。
const confirmOpen = ref(false);
// 宿主推送卸载函数。
let unsubscribe = (): void => undefined;
// 当前有效范围优先使用新建后端返回值。
const currentScope = computed<ProcessScope>(() => createMode.value ? (savedScope.value ?? newScope) : existingScope as ProcessScope);
// 当前流程文件名在现有模式固定为 process.json。
const currentFileName = computed(() => createMode.value ? fileName.value : existingFileName.value);
// 当前选中步骤供详情面板读写。
const selectedStep = computed(() => steps.value[selectedIndex.value] ?? null);
// 国家级联选项按中文排序并去重。
const countries = computed(() => unique(scopes.value.map((scope) => scope.country)));
// 当前国家下的流程类型。
const types = computed(() => unique(scopes.value.filter((scope) => scope.country === existingScope.country).map((scope) => scope.typeDir)) as Array<"Basic" | "NPC">);
// 当前国家和类型下的委托。
const commissions = computed(() => unique(scopes.value.filter((scope) => scope.country === existingScope.country && scope.typeDir === existingScope.typeDir).map((scope) => scope.commissionName)));
// 当前委托下的地点目录。
const locations = computed(() => unique(scopes.value.filter((scope) => scope.country === existingScope.country && scope.typeDir === existingScope.typeDir && scope.commissionName === existingScope.commissionName).map((scope) => scope.locationDir)));
// 新建模式地点候选去除后端自动添加的序号。
const locationSuggestions = computed(() => unique(scopes.value.filter((scope) => !newScope.country || scope.country === newScope.country).map((scope) => scope.locationDir.replace(/-\d+$/, ""))));
// 当前表单字段齐全时才允许目标探测。
const targetComplete = computed(() => [currentScope.value.country, currentScope.value.typeDir, currentScope.value.commissionName, currentScope.value.locationDir, currentFileName.value].every((value) => String(value).trim()));
// 保存仅允许写入已加载现有流程或合法的新建目标。
const canSave = computed(() => activeSubProcess.value
    ? !loading.value && !saving.value
    : Boolean(target.value && !loading.value && !saving.value && (createMode.value || loadedPath.value === target.value.path)));
// 当前检查器使用与活动文档对应的子流程候选。
const currentSubProcessOptions = computed(() => activeSubProcess.value ? subProcessOptions.value : target.value?.subProcessOptions ?? []);

// 去除空值和重复项并使用中文排序。
function unique(values: string[]): string[] {
    return Array.from(new Set(values.filter(Boolean))).sort((a, b) => a.localeCompare(b, "zh-CN"));
}

// 更新底部状态文字和语义颜色。
function setStatus(message: string, kind: typeof statusKind.value = ""): void {
    statusText.value = message;
    statusKind.value = kind;
}

// 修正现有流程级联并重新探测目标。
function reconcileExisting(level: "country" | "type" | "commission" | "location"): void {
    loadedPath.value = "";
    existingFileName.value = "process.json";
    if (level === "country") existingScope.typeDir = "";
    if (level === "country" || level === "type") existingScope.commissionName = "";
    if (level !== "location") existingScope.locationDir = "";
    void refreshTarget();
}

// 请求后端解析当前目标路径、分支和文件存在状态。
async function refreshTarget(): Promise<void> {
    const sequence = ++targetSequence;
    target.value = null;
    if (!targetComplete.value) return;
    try {
        const result = await requestHtmlMask<TargetResult>("/target", {
            scope: { ...currentScope.value },
            fileName: currentFileName.value,
            create: createMode.value && !savedScope.value,
        });
        if (sequence !== targetSequence) return;
        if (result.status === "error") throw new Error(result.message || "目标路径无效");
        target.value = result;
        branches.value = result.branches ?? [];
        if (!activeSubProcess.value) {
            activeDocumentPath.value = result.path;
            activeDocumentExists.value = result.exists;
        }
    } catch (error) {
        if (sequence === targetSequence) setStatus(toError(error).message, "error");
    }
}

// 将任意详情编辑立即标记为未保存。
function markChanged(): void {
    dirty.value = true;
    setStatus(text.unsaved);
}

// 用检查器提交的完整副本替换当前步骤。
function updateSelectedStep(step: ProcessStep): void {
    if (selectedIndex.value < 0) return;
    steps.value[selectedIndex.value] = step;
    markChanged();
}

// 选中步骤前先应用上一条详情草稿。
function selectStep(index: number): void {
    if (index === selectedIndex.value) return;
    selectedIndex.value = index;
}

// 新增所选处理器对应的默认步骤。
function addStep(): void {
    const processor = processors.value.find((item) => item.type === newStepType.value);
    if (!processor) return;
    steps.value.push(defaultStep(processor));
    selectedIndex.value = steps.value.length - 1;
    markChanged();
}

// 删除指定步骤并清空详情选择。
function deleteStep(index: number): void {
    steps.value.splice(index, 1);
    selectedIndex.value = -1;
    markChanged();
}

// 记录 HTML5 拖放的源步骤。
function startDrag(index: number, event: DragEvent): void {
    dragIndex.value = index;
    event.dataTransfer?.setData("text/plain", String(index));
    if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
}

// 按指针所在半区将拖放步骤插入目标前后。
function dropStep(targetIndex: number, event: DragEvent): void {
    event.preventDefault();
    if (dragIndex.value < 0) return;
    const row = event.currentTarget as HTMLElement;
    const after = event.clientY > row.getBoundingClientRect().top + row.offsetHeight / 2;
    const [step] = steps.value.splice(dragIndex.value, 1);
    let insertion = targetIndex + (after ? 1 : 0);
    if (dragIndex.value < insertion) insertion -= 1;
    steps.value.splice(insertion, 0, step);
    selectedIndex.value = insertion;
    dragIndex.value = -1;
    markChanged();
}

// 按 dataSpec 交集切换当前步骤类型。
function changeSelectedType(type: string): void {
    const step = selectedStep.value;
    const next = processors.value.find((item) => item.type === type);
    if (!step || !next || step.type === type) return;
    const previous = processors.value.find((item) => item.type === step.type);
    steps.value[selectedIndex.value] = convertStepType(step, previous, next);
    markChanged();
}

// 弹出未保存确认并返回用户选择。
function confirmDiscard(includeStack = false): Promise<boolean> {
    if (!dirty.value && (!includeStack || !documentStack.value.some(document => document.dirty))) return Promise.resolve(true);
    if (confirmResolve) return Promise.resolve(false);
    confirmOpen.value = true;
    return new Promise((resolve) => {
        confirmResolve = resolve;
    });
}

// 关闭确认弹窗并恢复等待中的工作流。
function resolveConfirmation(value: boolean): void {
    const resolve = confirmResolve;
    confirmResolve = null;
    confirmOpen.value = false;
    resolve?.(value);
}

// 在保留未保存保护的前提下切换现有/新建模式。
async function switchMode(create: boolean): Promise<void> {
    if (createMode.value === create || !(await confirmDiscard())) return;
    createMode.value = create;
    savedScope.value = null;
    loadedPath.value = "";
    target.value = null;
    steps.value = [];
    selectedIndex.value = -1;
    dirty.value = false;
    setStatus(create ? text.newHint : text.empty);
    await refreshTarget();
}

// 读取当前或最近流程文件并替换编辑状态。
async function loadFile(recent?: RecentProcess): Promise<void> {
    if (loading.value || !(await confirmDiscard())) return;
    if (recent) {
        createMode.value = false;
        savedScope.value = null;
        Object.assign(existingScope, recent.scope);
        existingFileName.value = recent.fileName || "process.json";
    }
    loading.value = true;
    setStatus("正在读取...");
    try {
        const result = await requestHtmlMask<LoadResult>("/load", { scope: recent?.scope ?? { ...currentScope.value }, fileName: recent?.fileName ?? currentFileName.value });
        if (result.status === "error") throw new Error(result.message || "读取失败");
        const loadedSteps = JSON.parse(result.content) as unknown;
        if (!Array.isArray(loadedSteps)) throw new Error("流程文件根节点必须是步骤数组");
        steps.value = loadedSteps as ProcessStep[];
        recentFiles.value = result.recentFiles ?? recentFiles.value;
        branches.value = result.branches ?? [];
        loadedPath.value = result.path;
        selectedIndex.value = -1;
        dirty.value = false;
        setStatus("已加载", "success");
        await refreshTarget();
    } catch (error) {
        setStatus(toError(error).message, "error");
    } finally {
        loading.value = false;
    }
}

// 调用后端验证当前流程及所有资源引用。
async function validateProcess(): Promise<void> {
    try {
        const result = await requestHtmlMask<DiagnosticResult>(activeSubProcess.value ? "/validateSubprocess" : "/validate", {
            scope: { ...currentScope.value }, fileName: currentFileName.value,
            reference: activeSubProcess.value,
            content: JSON.stringify(steps.value, null, 4), create: createMode.value && !savedScope.value,
        });
        setStatus(diagnosticText(result), result.status === "ok" ? "success" : result.status === "warning" ? "warning" : "error");
    } catch (error) {
        setStatus(toError(error).message, "error");
    }
}

// 保存流程并采用后端排序后的规范内容。
async function saveProcess(): Promise<void> {
    if (!canSave.value || saving.value) return;
    saving.value = true;
    setStatus("正在保存...");
    try {
        const result = await requestHtmlMask<SaveResult>(activeSubProcess.value ? "/saveSubprocess" : "/save", {
            scope: { ...currentScope.value }, fileName: currentFileName.value,
            reference: activeSubProcess.value,
            content: JSON.stringify(steps.value, null, 4), create: createMode.value && !savedScope.value,
        });
        if (result.status === "error") throw new Error(result.message || "保存失败");
        if (!activeSubProcess.value && createMode.value && result.scope) savedScope.value = result.scope;
        steps.value = JSON.parse(result.content) as ProcessStep[];
        loadedPath.value = result.path;
        if (activeSubProcess.value) {
            activeDocumentPath.value = result.path;
            activeDocumentExists.value = true;
        }
        selectedIndex.value = -1;
        dirty.value = false;
        const warningText = result.warnings?.length ? `\n警告：\n${result.warnings.join("\n")}` : "";
        setStatus(`已保存：${result.path}${warningText}`, warningText ? "warning" : "success");
        if (!activeSubProcess.value) await refreshTarget();
    } catch (error) {
        setStatus(toError(error).message, "error");
    } finally {
        saving.value = false;
    }
}

// 打开已有或尚未创建的子流程，并把当前文档完整压入导航栈。
async function editSubprocess(reference: string): Promise<void> {
    const normalized = reference.trim().replace(/\\/g, "/");
    if (!normalized || loading.value) return;
    loading.value = true;
    try {
        // 新建委托可能因地点重名被后端改名，子流程必须绑定探测后的真实目录。
        const resolvedScope = target.value?.scope ?? currentScope.value;
        const currentReference = activeSubProcess.value || currentFileName.value;
        const blocked = [...documentStack.value.map(document => document.reference), currentReference];
        const result = await requestHtmlMask<SubProcessResult>("/openSubprocess", { scope: { ...resolvedScope }, reference: normalized, blocked });
        if (result.status === "error") throw new Error(result.message || "子流程打开失败");
        if (createMode.value && !savedScope.value) savedScope.value = structuredClone(resolvedScope);
        documentStack.value.push({
            reference: currentReference,
            path: activeDocumentPath.value || target.value?.path || "",
            exists: activeDocumentExists.value,
            steps: cloneProcessValue(steps.value),
            selectedIndex: selectedIndex.value,
            dirty: dirty.value,
            loadedPath: loadedPath.value,
            subProcessOptions: [...currentSubProcessOptions.value],
        });
        activeSubProcess.value = result.reference;
        activeDocumentPath.value = result.path;
        activeDocumentExists.value = result.exists;
        subProcessOptions.value = result.subProcessOptions ?? [];
        steps.value = JSON.parse(result.content) as ProcessStep[];
        selectedIndex.value = -1;
        dirty.value = false;
        loadedPath.value = result.exists ? result.path : "";
        setStatus(result.exists ? `已打开子流程：${result.reference}` : `新建子流程：${result.reference}`);
    } catch (error) {
        setStatus(toError(error).message, "error");
    } finally {
        loading.value = false;
    }
}

// 返回上级文档；当前子流程有未保存修改时沿用统一确认弹窗。
async function returnToParent(): Promise<void> {
    if (!documentStack.value.length || !(await confirmDiscard())) return;
    const childReference = activeSubProcess.value;
    const childExists = activeDocumentExists.value;
    const parent = documentStack.value.pop();
    if (!parent) return;
    activeSubProcess.value = documentStack.value.length ? parent.reference : "";
    activeDocumentPath.value = parent.path;
    activeDocumentExists.value = parent.exists;
    steps.value = cloneProcessValue(parent.steps);
    selectedIndex.value = parent.selectedIndex;
    dirty.value = parent.dirty;
    loadedPath.value = parent.loadedPath;
    subProcessOptions.value = parent.subProcessOptions;
    if (childExists && childReference && !subProcessOptions.value.some(option => option.value === childReference)) {
        subProcessOptions.value = [...subProcessOptions.value, { value: childReference, label: childReference }].sort((a, b) => a.value.localeCompare(b.value, "zh-CN"));
        if (!activeSubProcess.value && target.value) target.value.subProcessOptions = subProcessOptions.value;
    }
    setStatus(parent.dirty ? text.unsaved : "已返回上级流程");
}

// 暂时隐藏编辑器并打开同目录路径录制器，字段名用于回填对象型步骤的指定路径。
async function recordPath(field?: string): Promise<void> {
    const step = selectedStep.value;
    // 地图追踪回填标量 data，摧毁哨塔仅允许回填两个公开路径字段。
    const isMapPath = step?.type === "地图追踪" && field === undefined;
    const isWatchtowerPath = step?.type === "摧毁哨塔" && (field === "path1" || field === "path2");
    if (recording.value || !targetComplete.value || !step || (!isMapPath && !isWatchtowerPath)) return;
    // 守卫已确保对象型录制请求只能指向两个哨塔路径之一。
    const watchtowerField = field as "path1" | "path2";
    // 当前字段值用于判断录制器是覆盖已有文件还是创建新文件。
    const currentReference = isMapPath ? step.data : editableRecord(step.data)[watchtowerField];
    // 只有后端确认合法存在的相对路径才进入覆盖编辑模式。
    const existingReference = typeof currentReference === "string" && target.value?.pathOptions?.some((option) => option.value === currentReference) ? currentReference : "";
    recording.value = true;
    try {
        const result = await requestHtmlMask<RecordPathResult>("/recordPath", {
            scope: { ...currentScope.value }, fileName: currentFileName.value, create: createMode.value && !savedScope.value,
            existingPath: existingReference,
        }, 0x7fffffff);
        if (result.status === "error") throw new Error(result.message || "路径录制失败");
        if (result.fileName) {
            // 已有路径保持原引用，新录制路径使用宿主返回的文件名。
            const savedReference = existingReference || result.fileName;
            steps.value[selectedIndex.value] = isMapPath
                ? { ...toRaw(step), data: savedReference }
                : { ...toRaw(step), data: { ...editableRecord(toRaw(step.data)), [watchtowerField]: savedReference } };
            if (createMode.value && result.scope) savedScope.value = result.scope;
            markChanged();
            await refreshTarget();
        }
        setStatus(result.fileName ? `路径已保存：${result.fileName}` : "路径录制已结束", "success");
    } catch (error) {
        setStatus(toError(error).message, "error");
    } finally {
        recording.value = false;
    }
}

// 确认后清空全部步骤。
async function clearSteps(): Promise<void> {
    if (!steps.value.length || !(await confirmDiscard())) return;
    steps.value = [];
    selectedIndex.value = -1;
    dirty.value = true;
    setStatus("已清除，尚未保存");
}

// 确认后通知 BetterGI 关闭编辑器。
async function closeEditor(): Promise<void> {
    if (!(await confirmDiscard(true))) return;
    try {
        await requestHtmlMask<{ status: string }>("/close", {});
    } catch (error) {
        setStatus(toError(error).message, "error");
    }
}

// 初始化元数据、级联选择与宿主显隐订阅。
async function initialize(): Promise<void> {
    unsubscribe = subscribeHtmlMask((message) => {
        if (message.url === "/toggleVisibility") visible.value = (message.data as { visible?: boolean } | undefined)?.visible !== false;
    });
    try {
        const result = await requestHtmlMask<ProcessEditorInit>("/init", {});
        scopes.value = result.scopes ?? [];
        processors.value = result.processors ?? [];
        roles.value = result.roles ?? [];
        recentFiles.value = result.recentFiles ?? [];
        newStepType.value = processors.value[0]?.type ?? "";
        newScope.country = countries.value[0] ?? "";
        setStatus(scopes.value.length ? text.empty : text.newHint);
    } catch (error) {
        setStatus(toError(error).message, "error");
    }
}

// 卸载编辑器时移除当前宿主推送处理器。
function cleanupEditor(): void {
    unsubscribe();
}

onMounted(initialize);
onBeforeUnmount(cleanupEditor);
</script>

<template>
    <div v-show="visible" class="app workspace-frame" :class="{ locked: confirmOpen }">
        <header class="topbar">
            <h1>{{ text.title }}</h1><button v-if="documentStack.length" class="back-button" @click="returnToParent">{{ text.backToParent }}</button><span v-if="activeSubProcess" class="document-path" :title="activeDocumentPath">{{ activeSubProcess }}</span><span class="hint">按 ~ 隐藏 / 显示</span>
            <div class="status" :class="`status-${statusKind}`" role="status">{{ statusText }}</div>
            <button @click="closeEditor">{{ commonText.close }}</button>
        </header>
        <div class="layout">
            <aside class="sidebar" :class="{ 'sidebar-locked': activeSubProcess }">
                <div class="mode-switch"><button :class="{ active: !createMode }" @click="switchMode(false)">{{ text.existing }}</button><button :class="{ active: createMode }" @click="switchMode(true)">{{ text.create }}</button></div>
                <template v-if="!createMode">
                    <div class="scope-field"><span>{{ text.country }}</span><UiSelect v-model="existingScope.country" :options="countries.map((item) => ({ value: item, label: item }))" :aria-label="text.country" width="field" @change="reconcileExisting('country')" /></div>
                    <div class="scope-field"><span>{{ text.type }}</span><UiSelect v-model="existingScope.typeDir" :disabled="!existingScope.country" :options="types.map((item) => ({ value: item, label: item }))" :aria-label="text.type" width="field" @change="reconcileExisting('type')" /></div>
                    <div class="scope-field"><span>{{ text.commission }}</span><UiSelect v-model="existingScope.commissionName" :disabled="!existingScope.typeDir" :options="commissions.map((item) => ({ value: item, label: item }))" :aria-label="text.commission" width="field" @change="reconcileExisting('commission')" /></div>
                    <div class="scope-field"><span>{{ text.location }}</span><UiSelect v-model="existingScope.locationDir" :disabled="!existingScope.commissionName" :options="locations.map((item) => ({ value: item, label: item }))" :aria-label="text.location" width="field" @change="reconcileExisting('location')" /></div>
                    <button class="scope-action" :disabled="loading || !targetComplete" @click="loadFile()">{{ text.open }}</button>
                </template>
                <template v-else>
                    <div class="scope-field"><span>{{ text.country }}</span><UiSelect v-model="newScope.country" editable :options="countries.map((item) => ({ value: item, label: item }))" :aria-label="text.country" width="field" @input="savedScope = null; refreshTarget()" /></div>
                    <div class="scope-field"><span>{{ text.type }}</span><UiSelect v-model="newScope.typeDir" :options="[{ value: 'NPC', label: 'NPC' }, { value: 'Basic', label: 'Basic' }]" :aria-label="text.type" width="compact" @change="savedScope = null; refreshTarget()" /></div>
                    <div class="scope-field"><span>{{ text.commission }}</span><input v-model.trim="newScope.commissionName" class="control" @input="savedScope = null; refreshTarget()"></div>
                    <div class="scope-field"><span>{{ text.location }}</span><UiSelect v-model="newScope.locationDir" editable :options="locationSuggestions.map((item) => ({ value: item, label: item }))" :aria-label="text.location" width="field" @input="savedScope = null; refreshTarget()" /></div>
                    <div class="scope-field"><span>{{ text.file }}</span><input v-model.trim="fileName" class="control" @input="savedScope = null; refreshTarget()"></div>
                </template>
                <div class="path">{{ target?.path || (createMode ? text.newHint : '') }}</div>
                <section class="recent"><h2>{{ text.recent }}</h2><button v-for="item in recentFiles" :key="item.path" :title="item.path" @click="loadFile(item)">{{ item.scope.commissionName }} · {{ item.scope.locationDir }}</button><span v-if="!recentFiles.length">{{ commonText.empty }}</span></section>
                <div class="side-actions"><button :disabled="!targetComplete || loading" @click="validateProcess">{{ text.validate }}</button><button class="primary" :disabled="!canSave" @click="saveProcess">{{ commonText.save }}</button></div>
            </aside>

            <main class="steps-pane">
                <div class="step-toolbar">
                    <div class="step-type-field"><span>{{ text.stepType }}</span><StepTypeMenu v-model="newStepType" :processors="processors" :aria-label="text.stepType" :max-width="280" /></div>
                    <button class="primary" :disabled="!newStepType" @click="addStep">{{ text.addStep }}</button>
                    <button class="danger" :disabled="!steps.length" @click="clearSteps">{{ text.clear }}</button>
                </div>
                <div class="step-list">
                    <article v-for="(step, index) in steps" :key="index" class="step" :class="{ selected: selectedIndex === index }" draggable="true" @dragstart="startDrag(index, $event)" @dragover.prevent @drop="dropStep(index, $event)" @click="selectStep(index)">
                        <span class="drag" aria-hidden="true">⋮⋮</span><span class="index">{{ index + 1 }}</span><div class="step-summary"><strong>{{ step.type }}</strong><small>{{ step.note || step.desc || '' }}</small></div>
                        <div class="step-actions"><button class="danger" :title="commonText.delete" :aria-label="commonText.delete" @click.stop="deleteStep(index)">×</button></div>
                    </article>
                    <div v-if="!steps.length" class="empty">{{ text.noSteps }}</div>
                </div>
            </main>

            <aside class="inspector">
                <div v-if="!selectedStep" class="empty">{{ text.selectStep }}</div>
                <StepInspector v-else :key="`${selectedIndex}-${selectedStep.type}`" :step="selectedStep" :processors="processors" :roles="roles" :branches="branches" :path-options="target?.pathOptions ?? []" :sub-process-options="currentSubProcessOptions" @changed="updateSelectedStep" @change-type="changeSelectedType" @record-path="recordPath" @edit-subprocess="editSubprocess"></StepInspector>
            </aside>
        </div>
    </div>

    <div v-if="confirmOpen" class="modal-backdrop" role="dialog" aria-modal="true" :aria-label="text.discardTitle">
        <div class="modal"><h2>{{ text.discardTitle }}</h2><p>{{ text.discardMessage }}</p><div><button @click="resolveConfirmation(false)">{{ commonText.cancel }}</button><button class="primary" @click="resolveConfirmation(true)">{{ commonText.confirm }}</button></div></div>
    </div>
</template>

<style scoped>
.app { display:flex; flex-direction:column; overflow:hidden; border:1px solid var(--color-border); border-radius:var(--radius-panel); background:var(--color-workspace); box-shadow:0 14px 44px rgba(0,0,0,.5); }.app.locked { pointer-events:none; }
.topbar { height:56px; flex:none; display:flex; align-items:center; gap:12px; padding:0 14px; border-bottom:1px solid var(--color-border); }.topbar h1 { margin:0; font-size:19px; }.back-button { flex:none; }.document-path { max-width:260px; overflow:hidden; color:var(--color-text-muted); font-size:12px; text-overflow:ellipsis; white-space:nowrap; }.hint { color:var(--color-text-muted); font-size:12px; }.status { min-width:0; flex:1; overflow:hidden; text-align:right; text-overflow:ellipsis; white-space:pre-line; }
.layout { min-height:0; flex:1; display:grid; grid-template-columns:230px 420px minmax(0,1fr); }.sidebar,.inspector { min-height:0; overflow:auto; padding:12px; background:var(--color-navigation); }.sidebar { border-right:1px solid var(--color-border); }.inspector { border-left:1px solid var(--color-border); }.inspector label { display:grid; gap:5px; margin-bottom:10px; color:#cbd3dd; font-size:12px; }.scope-field { min-width:0; display:grid; grid-template-columns:64px minmax(0,1fr); align-items:center; gap:8px; margin-bottom:10px; color:#cbd3dd; font-size:12px; }.scope-field>span { text-align:right; white-space:nowrap; }.scope-field>.control { width:100%; min-width:0; }.scope-field>.ui-select { width:100%; max-width:100%; }.scope-action { display:block; width:min(132px,100%); margin:0 auto; }
.mode-switch { display:grid; grid-template-columns:1fr 1fr; gap:4px; margin-bottom:12px; }.mode-switch .active { border-color:var(--color-primary); background:rgba(77,141,255,.22); }.path { min-height:34px; margin:10px 0; color:var(--color-text-muted); font-size:12px; overflow-wrap:anywhere; }.recent { display:grid; gap:4px; padding-top:10px; border-top:1px solid var(--color-border); }.recent h2 { margin:0 0 4px; font-size:13px; }.recent button { overflow:hidden; background:transparent; text-align:left; text-overflow:ellipsis; white-space:nowrap; }.recent span { color:var(--color-text-muted); font-size:12px; }.side-actions { display:grid; grid-template-columns:1fr 1fr; gap:6px; margin-top:12px; }
.sidebar-locked { pointer-events:none; opacity:.58; }.sidebar-locked .side-actions { pointer-events:auto; opacity:1; }
.steps-pane { min-width:0; min-height:0; display:flex; flex-direction:column; }.step-toolbar { display:flex; align-items:end; gap:8px; padding:10px 12px; border-bottom:1px solid var(--color-border); }.step-type-field { min-width:0; flex:1; display:grid; justify-items:start; gap:4px; font-size:12px; }.step-list { min-height:0; flex:1; overflow:auto; padding:10px 12px; }.step { display:flex; align-items:center; gap:8px; min-height:52px; margin-bottom:6px; padding:7px 8px; border:1px solid var(--color-border); border-radius:var(--radius-control); background:var(--color-surface); cursor:pointer; }.step.selected { border-color:var(--color-primary); background:rgba(77,141,255,.12); }.drag { color:var(--color-text-muted); cursor:grab; }.index { width:26px; color:var(--color-text-muted); text-align:center; }.step-summary { min-width:0; flex:1; display:grid; }.step-summary small { overflow:hidden; color:var(--color-text-muted); text-overflow:ellipsis; white-space:nowrap; }.step-actions { display:flex; gap:3px; }.step-actions button { width:30px; min-height:30px; padding:0; }
.inspector textarea { min-height:68px; }.code,pre { font-family:Consolas,monospace; font-size:12px; }
.empty { display:grid; min-height:120px; place-items:center; color:var(--color-text-muted); text-align:center; }.modal-backdrop { position:fixed; inset:0; display:grid; place-items:center; background:rgba(0,0,0,.62); pointer-events:auto; }.modal { width:min(420px,88vw); padding:18px; border:1px solid var(--color-border); border-radius:var(--radius-panel); background:var(--color-surface); box-shadow:0 18px 50px rgba(0,0,0,.55); }.modal h2 { margin:0; font-size:18px; }.modal p { color:var(--color-text-muted); }.modal>div { display:flex; justify-content:flex-end; gap:8px; }
@media (max-width:1500px) { .layout { grid-template-columns:220px minmax(330px,1fr); }.inspector { position:absolute; z-index:2; right:0; top:56px; bottom:0; width:min(500px,52vw); border:1px solid var(--color-border); box-shadow:-8px 0 30px rgba(0,0,0,.35); }.inspector:has(.empty) { display:none; } }
</style>
