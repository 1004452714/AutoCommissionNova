<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from "vue";
import UiSelect from "@/shared/components/UiSelect.vue";
import UiSegmented from "@/shared/components/UiSegmented.vue";
import { requestHtmlMask, toError } from "@/shared/bridge/html-mask";
import { copy } from "@/shared/i18n/zh-CN";
import type { ProcessScope, TargetExistsResult } from "@/apps/process-editor/types";

// 新建弹窗入参提供全部现有流程范围用于候选。
const props = defineProps<{ scopes: ProcessScope[] }>();
// 确认后把完整新建信息交给页面应用。
const emit = defineEmits<{ cancel: []; create: [scope: { country: string; typeDir: "Basic" | "NPC"; commissionName: string; locationDir: string; fileName: string }] }>();
// 弹窗静态文案来自共享中文文案表。
const text = copy.processEditor;
const commonText = copy.common;

// 新建流程的文件名固定为规范入口文件，不再提供输入。
const PROCESS_FILE_NAME = "process.json";
// 国家分段按游戏地区顺序固定，尚未实装的地区也保留占位。
const COUNTRY_ORDER = ["蒙德", "璃月", "稻妻", "须弥", "枫丹", "纳塔", "挪德卡莱", "至冬"];

// 去除空值和重复项并使用中文排序。
function unique(values: string[]): string[] {
    return Array.from(new Set(values.filter(Boolean))).sort((a, b) => a.localeCompare(b, "zh-CN"));
}

// 默认选中第一个存在现有流程的国家，保证地点候选开箱非空。
const defaultCountry = COUNTRY_ORDER.find((country) => props.scopes.some((scope) => scope.country === country)) ?? COUNTRY_ORDER[0];
// 表单值与原侧栏新建表单保持一致。
const form = reactive<ProcessScope>({ country: defaultCountry, typeDir: "NPC", commissionName: "", locationDir: "" });
// 地点候选按国家过滤并去除后端自动添加的序号。
const locationOptions = computed(() => unique(props.scopes.filter((scope) => scope.country === form.country).map((scope) => scope.locationDir.replace(/-\d+$/, ""))));
// 字段齐全才允许确认，交由页面复用原有保存校验。
const complete = computed(() => [form.country, form.commissionName, form.locationDir].every((value) => String(value).trim().length > 0));
// 目标流程文件已存在时提示重复并禁用确认，覆盖保存仍由后端兜底拒绝。
const duplicate = ref(false);
// 探测失败的原因（如委托名/地点目录含非法字符），同样禁用确认并透出到提示区。
const probeError = ref("");
// 探测防抖计时器与响应序号，丢弃过期结果。
let probeTimer = 0;
let probeSequence = 0;

// 探测当前表单对应的流程文件是否已存在。
async function probeTarget(): Promise<void> {
    const sequence = ++probeSequence;
    const scope = { country: form.country.trim(), typeDir: form.typeDir, commissionName: form.commissionName.trim(), locationDir: form.locationDir.trim() };
    if (!scope.country || !scope.commissionName || !scope.locationDir) {
        duplicate.value = false;
        probeError.value = "";
        return;
    }
    try {
        const result = await requestHtmlMask<TargetExistsResult>("/targetExists", { scope, fileName: PROCESS_FILE_NAME });
        if (sequence !== probeSequence) return;
        duplicate.value = result.status === "ok" && result.exists;
        probeError.value = result.status === "error" ? result.message || "目标路径无效" : "";
    } catch (error) {
        if (sequence !== probeSequence) return;
        duplicate.value = false;
        probeError.value = toError(error).message;
    }
}

// 表单变化后防抖探测，避免每次按键都触发后端目录扫描。
watch(() => [form.country, form.typeDir, form.commissionName, form.locationDir], () => {
    window.clearTimeout(probeTimer);
    probeTimer = window.setTimeout(() => { void probeTarget(); }, 250);
});

// 确认时提交完整新建信息。
function confirmCreate(): void {
    if (!complete.value || duplicate.value || probeError.value) return;
    emit("create", {
        country: form.country.trim(),
        typeDir: form.typeDir,
        commissionName: form.commissionName.trim(),
        locationDir: form.locationDir.trim(),
        fileName: PROCESS_FILE_NAME,
    });
}

// Escape 关闭弹窗，焦点在任意位置都生效。
function handleDocumentKeydown(event: KeyboardEvent): void {
    if (event.key === "Escape") {
        event.preventDefault();
        emit("cancel");
    }
}

onMounted(() => document.addEventListener("keydown", handleDocumentKeydown));
onBeforeUnmount(() => {
    document.removeEventListener("keydown", handleDocumentKeydown);
    window.clearTimeout(probeTimer);
});
</script>

<template>
    <div class="modal-backdrop" role="dialog" aria-modal="true" :aria-label="text.create">
        <div class="create-dialog">
            <header><h2>{{ text.create }}</h2></header>
            <div class="scope-field"><span>{{ text.country }}</span><UiSegmented v-model="form.country" :options="COUNTRY_ORDER.map((item) => ({ value: item, label: item }))" :aria-label="text.country" /></div>
            <div class="scope-field"><span>{{ text.type }}</span><UiSegmented v-model="form.typeDir" :options="[{ value: 'NPC', label: 'NPC' }, { value: 'Basic', label: 'Basic' }]" :aria-label="text.type" /></div>
            <div class="scope-field"><span>{{ text.commission }}</span><input v-model.trim="form.commissionName" class="control" :aria-label="text.commission"></div>
            <div class="scope-field"><span>{{ text.location }}</span><UiSelect v-model="form.locationDir" editable :options="locationOptions.map((item) => ({ value: item, label: item }))" :aria-label="text.location" width="field" /></div>
            <p v-if="duplicate || probeError" class="duplicate-hint">{{ duplicate ? text.targetExists : probeError }}</p>
            <footer>
                <button type="button" @click="emit('cancel')">{{ commonText.cancel }}</button>
                <button type="button" class="primary" :disabled="!complete || duplicate || Boolean(probeError)" @click="confirmCreate">{{ commonText.confirm }}</button>
            </footer>
        </div>
    </div>
</template>

<style scoped>
.modal-backdrop { position:fixed; inset:0; z-index:20; display:grid; place-items:center; background:rgba(0,0,0,.62); pointer-events:auto; }
.create-dialog { width:min(520px,88vw); padding:18px; border:1px solid var(--color-border-strong); border-radius:var(--radius-panel); background:var(--color-surface); box-shadow:0 18px 50px rgba(0,0,0,.55); }
.create-dialog header { margin-bottom:14px; }.create-dialog h2 { margin:0; font-size:18px; }
.scope-field { min-width:0; display:grid; grid-template-columns:64px minmax(0,1fr); align-items:center; gap:8px; margin-bottom:10px; color:#cbd3dd; font-size:12px; }.scope-field>span { text-align:right; white-space:nowrap; }.scope-field>.control { width:100%; min-width:0; }.scope-field>.ui-select { width:100%; max-width:100%; }.scope-field>.ui-segmented { justify-self:start; }
.create-dialog footer { display:flex; justify-content:flex-end; gap:8px; margin-top:14px; }
.duplicate-hint { margin:2px 0 0; color:var(--color-error); font-size:12px; }
</style>
