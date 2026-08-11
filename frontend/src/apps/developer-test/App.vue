<script setup lang="ts">
import { computed, onMounted, reactive, ref } from "vue";
import { requestHtmlMask, toError } from "@/shared/bridge/html-mask";
import UiSelect from "@/shared/components/UiSelect.vue";
import FocusGuard from "@/shared/components/FocusGuard.vue";
import { copy } from "@/shared/i18n/zh-CN";
import type { OperationResult, TestConfig, TestOptions } from "@/apps/developer-test/types";

// 当前页面固定使用的中文文案集合。
const text = copy.developerTest;
// 通用按钮文案集合。
const commonText = copy.common;
// BetterGI 返回的可选测试数据。
const options = ref<TestOptions>({ modes: [], scopes: [], cases: [] });
// 当前表单值保持在页面局部，不进入全局状态。
const form = reactive({
    mode: "basic" as "case" | "basic" | "npc",
    caseName: "",
    country: "",
    commissionName: "",
    location: "",
    processFile: "",
    branchCondition: "",
});
// 底部状态文字说明加载和启动结果。
const statusText = ref<string>(text.loading);
// 错误状态控制语义颜色和恢复动作。
const hasError = ref(false);
// 运行标志避免重复提交测试。
const running = ref(false);
// case 模式与委托模式使用不同字段。
const isCaseMode = computed(() => form.mode === "case");
// 当前模式下所有可用流程范围。
const modeScopes = computed(() => options.value.scopes.filter((scope) => scope.mode === form.mode));
// 国家选项保持去重后的后端顺序。
const countries = computed(() => unique(modeScopes.value.map((scope) => scope.country)));
// 当前国家内的委托选项。
const commissions = computed(() => unique(modeScopes.value.filter((scope) => scope.country === form.country).map((scope) => scope.commissionName)));
// 当前委托内的地点选项。
const locations = computed(() => unique(modeScopes.value.filter((scope) => scope.country === form.country && scope.commissionName === form.commissionName).map((scope) => scope.location)));
// 当前地点对应的流程文件。
const processFiles = computed(() => modeScopes.value.find((scope) => scope.country === form.country && scope.commissionName === form.commissionName && scope.location === form.location)?.processFiles ?? []);
// 必填选项齐全后才允许启动。
const canRun = computed(() => isCaseMode.value ? Boolean(form.caseName) : Boolean(form.processFile));

// 保留输入顺序并去除重复空值。
function unique(values: string[]): string[] {
    return Array.from(new Set(values.filter(Boolean)));
}

// 将级联字段修正为当前选项中的有效值。
function reconcileCascades(source = ""): void {
    if (isCaseMode.value) {
        form.caseName = options.value.cases.includes(form.caseName) ? form.caseName : (options.value.cases[0] ?? "");
        return;
    }
    const preferredCountry = source === "mode" && countries.value.includes("挪德卡莱") ? "挪德卡莱" : countries.value[0];
    if (!countries.value.includes(form.country)) form.country = preferredCountry ?? "";
    if (!commissions.value.includes(form.commissionName)) form.commissionName = commissions.value[0] ?? "";
    if (!locations.value.includes(form.location)) form.location = locations.value[0] ?? "";
    form.processFile = processFiles.value.includes(form.processFile)
        ? form.processFile
        : (processFiles.value.includes("process.json") ? "process.json" : (processFiles.value[0] ?? ""));
}

// 根据表单模式生成后端原有的测试配置结构。
function buildConfig(): TestConfig {
    if (isCaseMode.value) {
        // 分支条件允许为空，非空时必须是合法 JSON。
        const branchCondition = form.branchCondition.trim() ? JSON.parse(form.branchCondition) as unknown : null;
        return { mode: "case", caseName: form.caseName, branchCondition };
    }
    // 非 case 分支已由页面模式判断收窄。
    const mode = form.mode as "basic" | "npc";
    return {
        mode,
        country: form.country,
        commissionName: form.commissionName,
        location: form.location,
        processFile: form.processFile,
    };
}

// 读取测试范围并初始化级联选择。
async function loadOptions(): Promise<void> {
    try {
        options.value = await requestHtmlMask<TestOptions>("/loadTestOptions", {});
        form.mode = options.value.modes.includes("basic") ? "basic" : (options.value.modes[0] ?? "case");
        reconcileCascades("mode");
        statusText.value = text.loaded;
        hasError.value = false;
    } catch (error) {
        statusText.value = toError(error, text.loadFailed).message;
        hasError.value = true;
    }
}

// 校验表单后请求 BetterGI 进入选中的测试流程。
async function runTest(): Promise<void> {
    if (!canRun.value || running.value) return;
    running.value = true;
    statusText.value = text.starting;
    hasError.value = false;
    try {
        // 后端成功后会关闭窗口并返回测试配置给主流程。
        const result = await requestHtmlMask<OperationResult, { config: TestConfig }>("/runTest", { config: buildConfig() });
        if (result.status === "error") throw new Error(result.message || text.startFailed);
    } catch (error) {
        statusText.value = toError(error, text.startFailed).message;
        hasError.value = true;
        running.value = false;
    }
}

// 通知 BetterGI 关闭测试选择窗口。
async function closeWindow(): Promise<void> {
    try {
        await requestHtmlMask<OperationResult>("/close", {});
    } catch (error) {
        statusText.value = toError(error).message;
        hasError.value = true;
    }
}

onMounted(loadOptions);
</script>

<template>
    <main class="panel" aria-labelledby="page-title">
        <header class="panel-header">
            <h1 id="page-title">{{ text.title }}</h1>
            <p>{{ text.subtitle }}</p>
        </header>
        <form class="form" @submit.prevent="runTest">
            <div class="field-grid">
                <label>{{ text.mode }}
                    <UiSelect v-model="form.mode" :options="options.modes.map((mode) => ({ value: mode, label: mode }))" :aria-label="text.mode" width="field" :max-width="320" @change="reconcileCascades('mode')" />
                </label>
                <label>{{ text.testCase }}
                    <UiSelect v-model="form.caseName" :options="options.cases.map((item) => ({ value: item, label: item }))" :aria-label="text.testCase" :disabled="!isCaseMode" width="field" :max-width="320" />
                </label>
                <label>{{ text.country }}
                    <UiSelect v-model="form.country" :options="countries.map((item) => ({ value: item, label: item }))" :aria-label="text.country" :disabled="isCaseMode" width="field" :max-width="320" @change="reconcileCascades('country')" />
                </label>
                <label>{{ text.commission }}
                    <UiSelect v-model="form.commissionName" :options="commissions.map((item) => ({ value: item, label: item }))" :aria-label="text.commission" :disabled="isCaseMode" width="field" :max-width="320" @change="reconcileCascades('commission')" />
                </label>
                <label>{{ text.location }}
                    <UiSelect v-model="form.location" :options="locations.map((item) => ({ value: item, label: item }))" :aria-label="text.location" :disabled="isCaseMode" width="field" :max-width="320" @change="reconcileCascades('location')" />
                </label>
                <label>{{ text.processFile }}
                    <UiSelect v-model="form.processFile" :options="processFiles.map((item) => ({ value: item, label: item }))" :aria-label="text.processFile" :disabled="isCaseMode" width="field" :max-width="320" />
                </label>
                <label class="wide">{{ text.branchCondition }}
                    <textarea v-model="form.branchCondition" class="control" :disabled="!isCaseMode" :placeholder="text.branchPlaceholder"></textarea>
                </label>
            </div>
            <footer class="panel-footer">
                <div role="status" :class="{ 'status-error': hasError }">{{ statusText }}</div>
                <div class="actions">
                    <button type="button" @click="closeWindow">{{ commonText.close }}</button>
                    <button class="primary" type="submit" :disabled="!canRun || running">{{ text.run }}</button>
                </div>
            </footer>
        </form>
    </main>
    <FocusGuard />
</template>

<style scoped>
.panel { width:min(760px,88vw); max-height:86vh; margin:auto; overflow:auto; border:1px solid var(--color-border); border-radius:var(--radius-panel); background:rgba(24,29,36,.98); box-shadow:0 18px 55px rgba(0,0,0,.5); position:relative; top:50%; transform:translateY(-50%); }
.panel-header { padding:20px 24px 16px; border-bottom:1px solid var(--color-border); }
h1 { margin:0; font-size:21px; }
p { margin:4px 0 0; color:var(--color-text-muted); font-size:13px; }
.form { padding:20px 24px 0; }
.field-grid { display:grid; grid-template-columns:repeat(2,minmax(0,320px)); gap:16px; }
label { display:grid; gap:6px; color:#cfd6df; font-size:13px; }
label.wide { grid-column:1 / -1; }
textarea { min-height:84px; }
.panel-footer { display:flex; align-items:center; justify-content:space-between; gap:16px; margin-top:20px; padding:16px 0 20px; color:var(--color-text-muted); }
.actions { display:flex; gap:8px; }
@media (max-width:620px) { .field-grid { grid-template-columns:1fr; } label.wide { grid-column:auto; } .panel-footer { align-items:flex-end; flex-direction:column; } }
</style>
