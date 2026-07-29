<script setup lang="ts">
import { computed, ref, watch } from "vue";
import UiSelect from "@/shared/components/UiSelect.vue";
import StepDataEditor from "@/apps/process-editor/StepDataEditor.vue";
import FieldLabel from "@/apps/process-editor/FieldLabel.vue";
import StepTypeMenu from "@/apps/process-editor/StepTypeMenu.vue";
import { cloneProcessValue, editableRecord } from "@/apps/process-editor/model";
import { copy } from "@/shared/i18n/zh-CN";
import type { FieldSpec, ProcessStep, ProcessorMeta } from "@/apps/process-editor/types";

// 检查器属性提供当前步骤和全部声明元数据。
const props = defineProps<{ step: ProcessStep; processors: ProcessorMeta[]; roles: string[]; branches: Array<{ key: string; label: string }> }>();
// 检查器静态文案来自共享中文文案表。
const text = copy.processEditor;
// 公共字段名映射供可选字段下拉展示。
const commonLabels: Record<string, string> = { desc: text.description, loc: text.locationField, retrySettings: text.retrySettings };
// 检查器事件将所有业务变更交给页面统一标脏。
const emit = defineEmits<{ changed: [step: ProcessStep]; changeType: [type: string]; recordPath: [] }>();
// 检查器使用局部副本，提交时整体替换父页面步骤。
const editableStep = ref<ProcessStep>(cloneProcessValue(props.step));
// 父页面的录制回填等外部替换需要同步到局部副本。
watch(() => props.step, (step) => { editableStep.value = cloneProcessValue(step); });
// 可选公共字段下拉的当前选择。
const optionalCommon = ref("");
// 可选标量 data 下拉的当前选择。
const optionalScalarData = ref("");
// 单/多坐标模式由当前 loc 形状初始化并跟随切换。
const locMode = ref<"single" | "multiple">(Array.isArray(editableStep.value.loc) && Array.isArray(editableStep.value.loc[0]) ? "multiple" : "single");

// 当前步骤处理器声明。
const processor = computed(() => props.processors.find((item) => item.type === editableStep.value.type));
// 当前未设置、可添加的公共配置，重试字段始终成组出现。
const optionalCommonFields = computed(() => {
    const fields = ["desc", "loc"].filter((name) => editableStep.value[name] === undefined);
    if (editableStep.value.retry === undefined && editableStep.value.retryOn === undefined) fields.push("retrySettings");
    return fields;
});
// 当前处理器是否需要展示步骤参数卡片。
const hasParameterCard = computed(() => Boolean(processor.value && processor.value.dataSpec.kind !== "none"));
// 非对象可选 data 未设置时通过卡片顶部下拉创建。
const canAddScalarData = computed(() => Boolean(processor.value?.dataSpec.optional && processor.value.dataSpec.kind !== "object" && editableStep.value.data === undefined));
// 标量 data 在添加栏使用处理器声明的中文名称。
const dataLabel = computed(() => processor.value?.dataSpec.label || text.parameter);
// 步骤参数摘要统计现有值和必显对象字段。
const parameterCount = computed(() => {
    const spec = processor.value?.dataSpec;
    if (!spec || spec.kind === "none") return 0;
    if (spec.kind !== "object") return editableStep.value.data === undefined ? 0 : 1;
    const names = new Set(Object.keys(editableRecord(editableStep.value.data)));
    Object.entries(spec.fields ?? {}).forEach(([name, field]) => { if (field.required || field.alwaysVisible) names.add(name); });
    return names.size;
});
// 已设置公共配置数量显示在折叠标题中，重试字段按一项计数。
const commonFieldCount = computed(() => [editableStep.value.desc !== undefined, editableStep.value.loc !== undefined, editableStep.value.retry !== undefined || editableStep.value.retryOn !== undefined].filter(Boolean).length);
// loc 统一转换为坐标行数组供模板编辑。
const locRows = computed(() => {
    if (locMode.value === "multiple") return Array.isArray(editableStep.value.loc) && Array.isArray(editableStep.value.loc[0]) ? editableStep.value.loc as unknown[][] : [["", ""]];
    return [Array.isArray(editableStep.value.loc) && !Array.isArray(editableStep.value.loc[0]) ? editableStep.value.loc as unknown[] : ["", "", ""]];
});

// 将局部步骤原始值克隆后提交给父页面。
function emitChanged(): void {
    emit("changed", cloneProcessValue(editableStep.value));
}

// 更新步骤字段并通知页面进入未保存状态。
function updateStepField(name: string, value: unknown): void {
    if (value === "" || value === undefined) delete editableStep.value[name]; else editableStep.value[name] = value;
    emitChanged();
}

// 选择后立即添加公共可选字段并复位下拉框。
function addSelectedCommonField(): void {
    const name = optionalCommon.value;
    if (!name) return;
    if (name === "loc") editableStep.value.loc = [0, 0];
    else if (name === "retrySettings") {
        editableStep.value.retry = 0;
        editableStep.value.retryOn = "throw";
    }
    else editableStep.value[name] = "";
    optionalCommon.value = "";
    emitChanged();
}

// 按字段声明创建稳定的初始 data 值。
function initialDataValue(spec: FieldSpec): unknown {
    if ("default" in spec) return cloneProcessValue(spec.default);
    if (spec.kind === "object" || spec.kind === "custom") return {};
    if (spec.kind === "array") return [];
    if (spec.kind === "boolean") return false;
    if (spec.kind === "number") return 0;
    return "";
}

// 选择后立即创建可选标量 data 并复位下拉框。
function addSelectedScalarData(): void {
    if (optionalScalarData.value !== "data" || !processor.value) return;
    editableStep.value.data = initialDataValue(processor.value.dataSpec);
    optionalScalarData.value = "";
    emitChanged();
}

// 删除一个公共可选字段。
function removeCommonField(name: string): void {
    delete editableStep.value[name];
    emitChanged();
}

// 同时移除重试次数与触发条件，避免留下不完整配置。
function removeRetrySettings(): void {
    delete editableStep.value.retry;
    delete editableStep.value.retryOn;
    emitChanged();
}

// 切换坐标模式并生成对应的稳定数据形状。
function changeLocMode(mode: "single" | "multiple"): void {
    locMode.value = mode;
    editableStep.value.loc = mode === "multiple" ? [[0, 0]] : [0, 0];
    emitChanged();
}

// 更新坐标行中的单个数值。
function updateLoc(index: number, axis: number, value: string): void {
    const numberValue = Number(value);
    if (!Number.isFinite(numberValue)) return;
    const rows = locRows.value.map((row) => [...row]);
    rows[index][axis] = numberValue;
    editableStep.value.loc = locMode.value === "multiple" ? rows : rows[0];
    emitChanged();
}

// 添加一个多点坐标行。
function addLoc(): void {
    editableStep.value.loc = [...locRows.value, [0, 0]];
    emitChanged();
}

// 删除一个多点坐标行并至少保留一行。
function removeLoc(index: number): void {
    const rows = locRows.value.filter((_, rowIndex) => rowIndex !== index);
    editableStep.value.loc = rows.length ? rows : [[0, 0]];
    emitChanged();
}
</script>

<template>
    <form class="step-inspector" @submit.prevent>
        <div class="direct-fields">
            <label class="note-field"><FieldLabel :label="text.note" name="note" /><input class="control" type="text" :value="editableStep.note ?? ''" @input="updateStepField('note', ($event.target as HTMLInputElement).value)" @keydown.enter.prevent></label>
            <div class="step-type-field"><FieldLabel :label="text.stepType" name="type" required /><StepTypeMenu :model-value="editableStep.type" :processors="processors" :aria-label="text.stepType" @change="emit('changeType', $event)" /></div>
        </div>

        <div class="inspector-cards">
            <details class="inspector-card common-card" open>
                <summary><span><strong>{{ text.common }}</strong><small>common</small></span><span class="summary-meta">{{ commonFieldCount }} {{ text.items }}</span></summary>
                <div class="card-body">
                    <UiSelect v-if="optionalCommonFields.length" v-model="optionalCommon" class="field-picker" :options="optionalCommonFields.map((name) => ({ value: name, label: `${commonLabels[name]} (${name})` }))" :placeholder="text.selectCommonField" :aria-label="text.selectCommonField" width="field" :max-width="300" @change="addSelectedCommonField" />

                    <div v-if="editableStep.desc !== undefined" class="common-field-row"><FieldLabel :label="text.description" name="desc" :hint="text.descriptionHint" /><input class="control" :value="editableStep.desc" :placeholder="text.descriptionHint" @input="updateStepField('desc', ($event.target as HTMLInputElement).value)"><button class="danger" type="button" @click="removeCommonField('desc')">{{ text.removeField }}</button></div>

                    <section v-if="editableStep.loc !== undefined" class="loc-editor"><header><FieldLabel :label="text.locationField" name="loc" /><div class="loc-head-actions"><div class="segmented"><button type="button" :class="{ active: locMode === 'single' }" @click="changeLocMode('single')">{{ text.singlePoint }}</button><button type="button" :class="{ active: locMode === 'multiple' }" @click="changeLocMode('multiple')">{{ text.multiplePoints }}</button></div><button class="danger" type="button" @click="removeCommonField('loc')">{{ text.removeField }}</button></div></header><div v-for="(point,index) in locRows" :key="index" class="loc-row"><label><span>{{ text.coordinateX }}</span><input class="control" type="number" :value="point[0]" :aria-label="text.coordinateX" @input="updateLoc(index,0,($event.target as HTMLInputElement).value)"></label><label><span>{{ text.coordinateY }}</span><input class="control" type="number" :value="point[1]" :aria-label="text.coordinateY" @input="updateLoc(index,1,($event.target as HTMLInputElement).value)"></label><label><span>{{ text.tolerance }}</span><input class="control" type="number" :value="point[2] ?? ''" :aria-label="text.tolerance" @input="updateLoc(index,2,($event.target as HTMLInputElement).value)"></label><button v-if="locMode === 'multiple'" class="danger loc-remove" type="button" @click="removeLoc(index)">×</button></div><button v-if="locMode === 'multiple'" type="button" @click="addLoc">{{ text.addCoordinate }}</button></section>

                    <section v-if="editableStep.retry !== undefined || editableStep.retryOn !== undefined" class="retry-editor"><header><FieldLabel :label="text.retrySettings" name="retry / retryOn" /><button class="danger" type="button" @click="removeRetrySettings">{{ text.removeField }}</button></header><div class="retry-fields"><div class="parameter-row"><FieldLabel :label="text.retry" name="retry" :hint="text.optional" /><input class="control" type="number" min="0" step="1" :value="editableStep.retry ?? 0" @input="updateStepField('retry', Number(($event.target as HTMLInputElement).value))"></div><div class="parameter-row"><FieldLabel :label="text.retryOn" name="retryOn" :hint="text.optional" /><UiSelect :model-value="String(editableStep.retryOn ?? 'throw')" :options="[{ value: 'throw', label: 'throw' }, { value: 'return-false', label: 'return-false' }, { value: 'all', label: 'all' }]" :aria-label="text.retryOn" width="compact" @change="updateStepField('retryOn', $event)" /></div></div></section>
                </div>
            </details>

            <details v-if="processor && hasParameterCard" class="inspector-card parameter-card" open>
                <summary><span><strong>{{ text.stepParameters }}</strong><small>data</small></span><span class="summary-meta">{{ editableStep.type }} · {{ parameterCount }} {{ text.items }}</span></summary>
                <div class="card-body">
                    <UiSelect v-if="canAddScalarData" v-model="optionalScalarData" class="field-picker" :options="[{ value: 'data', label: `${dataLabel} (data)` }]" :placeholder="text.selectParameter" :aria-label="text.selectParameter" width="field" :max-width="300" @change="addSelectedScalarData" />
                    <StepDataEditor v-if="editableStep.data !== undefined || processor.dataSpec.kind === 'object' || !processor.dataSpec.optional" :model-value="editableStep.data" :spec="processor.dataSpec" :step-type="editableStep.type" :processors="processors" :roles="roles" :branches="branches" @update="updateStepField('data',$event)" @record-path="emit('recordPath')"></StepDataEditor>
                    <button v-if="processor.dataSpec.optional && editableStep.data !== undefined && editableStep.type !== '对话'" class="danger data-remove" type="button" @click="removeCommonField('data')">{{ text.removeField }}</button>
                </div>
            </details>
        </div>
    </form>
</template>

<style scoped>
.step-inspector,.direct-fields,.inspector-cards,.card-body { display:grid; }.step-inspector { gap:16px; }.direct-fields { gap:12px; }.direct-fields label,.loc-row label { display:grid; gap:5px; color:#cbd3dd; font-size:12px; }.step-type-field { min-width:0; display:grid; justify-items:start; gap:5px; color:#cbd3dd; font-size:12px; }.note-field input { height:var(--control-height); }.inspector-cards { gap:16px; }.inspector-card { overflow:hidden; border:1px solid var(--color-border); border-radius:var(--radius-control); background:var(--color-surface); }.inspector-card summary { display:flex; min-height:42px; align-items:center; justify-content:space-between; gap:10px; padding:0 12px; background:var(--color-navigation); cursor:pointer; list-style:none; }.inspector-card summary::-webkit-details-marker { display:none; }.inspector-card summary::before { content:"›"; color:var(--color-text-muted); font-size:18px; transform:rotate(0); transition:transform .18s ease; }.inspector-card[open] summary::before { transform:rotate(90deg); }.inspector-card summary:focus-visible { outline:2px solid var(--color-primary); outline-offset:-2px; }.inspector-card summary>span:first-of-type { min-width:0; flex:1; display:flex; align-items:baseline; gap:7px; }.inspector-card summary small,.summary-meta { color:var(--color-text-muted); font-size:11px; }.summary-meta { white-space:nowrap; }.card-body { gap:12px; padding:12px; border-top:1px solid var(--color-border); }.field-picker { width:min(100%,300px); }.common-field-row { min-width:0; display:grid; grid-template-columns:minmax(150px,42%) minmax(0,1fr) auto; align-items:center; gap:8px; color:#cbd3dd; font-size:12px; }.common-field-row>.control { min-width:0; }.loc-editor,.retry-editor { display:grid; gap:12px; }.loc-editor>header,.retry-editor>header { display:flex; flex-wrap:wrap; align-items:center; justify-content:space-between; gap:8px; }.loc-head-actions { display:flex; align-items:center; gap:8px; margin-left:auto; }.segmented { display:flex; gap:4px; }.segmented button { min-height:30px; height:30px; padding:0 9px; }.segmented .active { border-color:var(--color-primary); background:rgba(77,141,255,.2); }.loc-row { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)) auto; gap:8px; align-items:end; }.loc-remove { margin-bottom:1px; }.retry-fields { display:grid; gap:10px; }.parameter-row { min-width:0; display:grid; grid-template-columns:minmax(150px,42%) minmax(0,1fr); align-items:center; gap:12px; }.parameter-row>.control,.parameter-row>.ui-select { width:100%; min-width:0; max-width:100%; }.data-remove { justify-self:end; min-height:28px; height:28px; padding:0 8px; }
@media (max-width:600px) { .loc-row { grid-template-columns:1fr 1fr; }.loc-remove { align-self:end; } }
@media (prefers-reduced-motion:reduce) { .inspector-card summary::before { transition:none; } }
</style>
