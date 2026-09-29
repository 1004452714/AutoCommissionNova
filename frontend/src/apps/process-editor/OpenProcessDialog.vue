<script setup lang="ts">
import { ArrowLeft, File, Folder, House, RotateCw } from "@lucide/vue";
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from "vue";
import { requestHtmlMask, toError } from "@/shared/bridge/html-mask";
import { copy } from "@/shared/i18n/zh-CN";
import type { BrowseEntry, BrowseResult, ProcessScope } from "@/apps/process-editor/types";

// 打开弹窗把解析出的流程范围交给页面加载。
const emit = defineEmits<{ cancel: []; open: [target: { scope: ProcessScope; fileName: string }] }>();
// 弹窗静态文案来自共享中文文案表。
const text = copy.processEditor;
const commonText = copy.common;
// 浏览根目录固定为 process，路径为相对其内部的斜杠分隔子路径。
const rootName = "process";
// 当前相对路径为空表示位于 process 根目录。
const currentPath = ref("");
// 返回上级使用的历史栈。
const pathHistory = ref<string[]>([]);
// 当前目录条目保持后端返回顺序，展示时再排序。
const entries = ref<BrowseEntry[]>([]);
// 当前选中的 process.json 相对路径。
const selectedPath = ref("");
// 读取状态阻止重复请求。
const loading = ref(false);
// 弹窗内错误提示显示在底部状态区。
const errorText = ref("");
// 列表根节点用于接收键盘事件。
const listElement = ref<HTMLElement | null>(null);

// 仅文件名为 process.json 的文件允许选择。
function isSelectable(entry: BrowseEntry): boolean {
    return !entry.directory && entry.name.toLowerCase() === "process.json";
}

// 展示条目按目录优先、中文名自然排序。
const displayedEntries = computed(() => [...entries.value].sort((a, b) => {
    if (a.directory !== b.directory) return a.directory ? -1 : 1;
    return a.name.localeCompare(b.name, "zh-CN", { numeric: true });
}));

// 地址栏展示 process 根目录与当前相对路径。
const addressText = computed(() => currentPath.value ? `${rootName}/${currentPath.value}` : rootName);

// 读取当前目录条目。
async function refresh(): Promise<void> {
    if (loading.value) return;
    loading.value = true;
    errorText.value = "";
    try {
        const result = await requestHtmlMask<BrowseResult>("/browse", { path: currentPath.value });
        if (result.status === "error") throw new Error(result.message || "读取目录失败");
        entries.value = result.entries ?? [];
        // 选中项可能已被外部删除，复位避免确认到失效路径。
        if (selectedPath.value && !entries.value.some((entry) => entry.path === selectedPath.value)) selectedPath.value = "";
    } catch (error) {
        errorText.value = toError(error).message;
    } finally {
        loading.value = false;
    }
}

// 进入目录并压入历史栈。
async function enterDirectory(entry: BrowseEntry): Promise<void> {
    if (!entry.directory) return;
    pathHistory.value.push(currentPath.value);
    currentPath.value = entry.path;
    selectedPath.value = "";
    await refresh();
}

// 返回上一级目录。
async function goBack(): Promise<void> {
    const previous = pathHistory.value.pop();
    if (previous === undefined) return;
    currentPath.value = previous;
    selectedPath.value = "";
    await refresh();
}

// 回到 process 根目录并清空历史。
async function goRoot(): Promise<void> {
    if (!currentPath.value && !pathHistory.value.length) return;
    pathHistory.value = [];
    currentPath.value = "";
    selectedPath.value = "";
    await refresh();
}

// 单击条目：目录进入，process.json 切换选中，其他文件忽略。
async function handleRowClick(entry: BrowseEntry): Promise<void> {
    errorText.value = "";
    if (entry.directory) await enterDirectory(entry);
    else if (isSelectable(entry)) selectedPath.value = selectedPath.value === entry.path ? "" : entry.path;
}

// 双击条目：目录进入，可选文件直接确认打开。
function handleRowDblClick(entry: BrowseEntry): void {
    if (entry.directory) void enterDirectory(entry);
    else if (isSelectable(entry)) confirmSelection();
}

// 解析选中路径为流程范围并交给页面加载。
function confirmSelection(): void {
    if (loading.value || !selectedPath.value) return;
    const parts = selectedPath.value.split("/");
    // 结构固定为国家/类型/委托/地点/process.json 五段。
    if (parts.length !== 5) {
        errorText.value = text.invalidSelection;
        return;
    }
    const [country, typeDir, commissionName, locationDir, fileName] = parts;
    if (typeDir !== "Basic" && typeDir !== "NPC") {
        errorText.value = text.invalidSelection;
        return;
    }
    emit("open", { scope: { country, typeDir, commissionName, locationDir }, fileName });
}

// 列表键盘操作沿用资源管理器习惯。
function handleListKeydown(event: KeyboardEvent): void {
    if (event.key === "Backspace") {
        event.preventDefault();
        void goBack();
    } else if (event.key === "Enter") {
        event.preventDefault();
        confirmSelection();
    }
}

// Escape 关闭弹窗，焦点在任意位置都生效。
function handleDocumentKeydown(event: KeyboardEvent): void {
    if (event.key === "Escape") {
        event.preventDefault();
        emit("cancel");
    }
}

onMounted(() => {
    void refresh();
    document.addEventListener("keydown", handleDocumentKeydown);
    nextTick(() => listElement.value?.focus());
});

onBeforeUnmount(() => document.removeEventListener("keydown", handleDocumentKeydown));
</script>

<template>
    <div class="modal-backdrop" role="dialog" aria-modal="true" :aria-label="text.openTitle">
        <div class="file-dialog">
            <header class="file-dialog-header">
                <h2>{{ text.openTitle }}</h2>
            </header>
            <div class="file-toolbar">
                <button type="button" class="file-toolbar-button" :disabled="!pathHistory.length" :title="text.goBack" :aria-label="text.goBack" @click="goBack"><ArrowLeft :size="16" aria-hidden="true" /></button>
                <button type="button" class="file-toolbar-button" :disabled="!currentPath && !pathHistory.length" :title="text.goRoot" :aria-label="text.goRoot" @click="goRoot"><House :size="16" aria-hidden="true" /></button>
                <div class="file-address" :title="addressText"><span>{{ addressText }}</span></div>
                <button type="button" class="file-toolbar-button" :disabled="loading" :title="text.refresh" :aria-label="text.refresh" @click="refresh"><RotateCw :size="16" aria-hidden="true" /></button>
            </div>
            <div class="file-list-header" aria-hidden="true"><span>{{ text.columnName }}</span><span>{{ text.columnType }}</span></div>
            <div ref="listElement" class="file-list" role="listbox" :aria-label="text.openTitle" tabindex="0" @keydown="handleListKeydown">
                <button v-for="entry in displayedEntries" :key="entry.path" type="button" class="file-row" role="option" :aria-selected="selectedPath === entry.path" :class="{ directory: entry.directory, selected: selectedPath === entry.path, selectable: isSelectable(entry), unavailable: !entry.directory && !isSelectable(entry) }" @click="handleRowClick(entry)" @dblclick="handleRowDblClick(entry)">
                    <span class="file-name" :title="entry.name"><Folder v-if="entry.directory" class="file-entry-icon" aria-hidden="true" /><File v-else class="file-entry-icon" aria-hidden="true" /><span>{{ entry.name }}</span></span>
                    <span class="file-type">{{ entry.directory ? text.typeDirectory : isSelectable(entry) ? text.typeProcess : text.typeFile }}</span>
                </button>
                <div v-if="!displayedEntries.length && !loading" class="file-empty">{{ text.browseEmpty }}</div>
            </div>
            <footer class="file-dialog-footer">
                <div class="file-status" :class="{ error: Boolean(errorText) }">
                    <strong v-if="errorText">{{ errorText }}</strong>
                    <strong v-else-if="selectedPath">{{ text.browseSelected }}{{ selectedPath }}</strong>
                    <strong v-else>{{ text.browseHint }}</strong>
                </div>
                <div class="file-footer-actions">
                    <button type="button" @click="emit('cancel')">{{ commonText.cancel }}</button>
                    <button type="button" class="primary" :disabled="!selectedPath" @click="confirmSelection">{{ text.open }}</button>
                </div>
            </footer>
        </div>
    </div>
</template>

<style scoped>
.modal-backdrop { position:fixed; inset:0; z-index:20; display:grid; place-items:center; background:rgba(0,0,0,.62); pointer-events:auto; }
.file-dialog { width:min(880px,92vw); display:flex; flex-direction:column; overflow:hidden; border:1px solid var(--color-border-strong); border-radius:var(--radius-panel); background:var(--color-surface); box-shadow:0 18px 50px rgba(0,0,0,.55); }
.file-dialog-header { flex:none; padding:14px 16px 10px; }.file-dialog-header h2 { margin:0; font-size:18px; }
.file-toolbar { flex:none; display:grid; grid-template-columns:40px 40px minmax(0,1fr) 40px; gap:4px; align-items:center; padding:0 16px 10px; }.file-toolbar-button { width:40px; min-height:38px; height:38px; display:grid; place-items:center; padding:0; }.file-toolbar-button:disabled { opacity:.45; cursor:not-allowed; }
.file-address { min-width:0; height:38px; display:flex; align-items:center; overflow:hidden; padding:0 10px; border:1px solid var(--color-border); border-radius:var(--radius-control); background:var(--color-surface-raised); }.file-address span { overflow:hidden; color:var(--color-text-muted); font-size:13px; text-overflow:ellipsis; white-space:nowrap; }
.file-list-header,.file-row { display:grid; grid-template-columns:minmax(0,1fr) 110px; column-gap:14px; align-items:center; }
.file-list-header { flex:none; padding:4px 26px 6px; color:var(--color-text-muted); font-size:12px; border-bottom:1px solid var(--color-border); }
.file-list { height:clamp(280px,50dvh,440px); min-height:0; overflow-y:auto; padding:5px 16px; user-select:none; outline:none; }
.file-row { width:100%; min-height:39px; padding:5px 10px; text-align:left; }.file-row:hover { background:#2a3441; }.file-row.selected { background:rgba(77,141,255,.2); }.file-row.unavailable { color:var(--color-text-muted); cursor:not-allowed; }.file-row.unavailable:hover { background:transparent; }
.file-name { min-width:0; display:flex; align-items:center; gap:8px; overflow:hidden; }.file-name span { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }.file-entry-icon { flex:none; color:var(--color-text-muted); }
.file-type { overflow:hidden; color:var(--color-text-muted); font-size:12px; text-overflow:ellipsis; white-space:nowrap; }
.file-empty { padding:36px 0; color:var(--color-text-muted); text-align:center; }
.file-dialog-footer { flex:none; display:flex; align-items:center; justify-content:space-between; gap:12px; padding:12px 16px 14px; border-top:1px solid var(--color-border); }.file-status { min-width:0; display:grid; gap:2px; }.file-status strong { overflow:hidden; font-size:13px; text-overflow:ellipsis; white-space:nowrap; }.file-status.error strong { color:var(--color-error); }.file-footer-actions { flex:none; display:flex; gap:8px; }
</style>
