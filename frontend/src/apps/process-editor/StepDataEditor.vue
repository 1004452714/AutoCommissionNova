<script setup lang="ts">
import { computed, reactive, ref } from "vue";
import UiSelect from "@/shared/components/UiSelect.vue";
import FieldLabel from "@/apps/process-editor/FieldLabel.vue";
import StepTypeMenu from "@/apps/process-editor/StepTypeMenu.vue";
import { cloneProcessValue, coerceFieldValue, editableRecord } from "@/apps/process-editor/model";
import { copy } from "@/shared/i18n/zh-CN";
import type { FieldSpec, ProcessStep, ProcessorMeta } from "@/apps/process-editor/types";
import type { UiSelectOption } from "@/shared/types/ui";

defineOptions({ name: "StepDataEditor" });

// 编辑器属性描述当前 data 值、声明和嵌套步骤候选。
const props = withDefaults(defineProps<{
    modelValue: unknown;
    spec: FieldSpec;
    stepType: string;
    processors: ProcessorMeta[];
    roles: string[];
    branches: Array<{ key: string; label: string }>;
    pathOptions?: Array<{ value: string; label: string }>;
    subProcessOptions?: Array<{ value: string; label: string }>;
}>(), { pathOptions: () => [], subProcessOptions: () => [] });
// 数据编辑器静态文案来自共享中文文案表。
const text = copy.processEditor;
// 编辑器事件只提交结构化 data，并把路径录制请求交给页面处理。
const emit = defineEmits<{ update: [value: unknown]; recordPath: []; editSubprocess: [path: string] }>();
// 可选对象字段下拉的当前选择。
const optionalField = ref("");
// 角色重复状态就地提示，不阻断其他字段编辑。
const roleError = ref("");
// 多行数组字段草稿保留尚未结构化的末尾换行和空白行。
const arrayDrafts = reactive<Record<string, string>>({});

// 当前值的普通对象视图，非对象输入回落为空对象。
const dataObject = computed(() => editableRecord(props.modelValue));
// 当前对象声明中应直接显示的字段，包含动态条件下的必填参数。
const visibleFields = computed(() => filteredFields().filter(([name, field]) => field.required || field.alwaysVisible || isConditionallyRequired(name) || Object.hasOwn(dataObject.value, name)));
// 当前对象声明中仍可添加的可选字段，动态必填项不进入下拉框。
const optionalFields = computed(() => filteredFields().filter(([name, field]) => !field.required && !field.alwaysVisible && !isConditionallyRequired(name) && !Object.hasOwn(dataObject.value, name)));
// 波次编号按数值顺序展示。
const waveNumbers = computed(() => Object.keys(dataObject.value).filter((name) => /^wave[1-9]\d*$/.test(name)).map((name) => Number(name.slice(4))).sort((a, b) => a - b));
// 角色槽位固定为 BetterGI 支持的四个位置。
const roleSlots = ["1", "2", "3", "4"];
// 布尔选择统一使用中文显示和值字符串。
const booleanOptions: UiSelectOption[] = [{ value: "false", label: "否" }, { value: "true", label: "是" }];
// 按键操作使用紧凑选择宽度。
const keyActionOptions: UiSelectOption[] = [{ value: "press", label: "点击" }, { value: "down", label: "按下" }, { value: "up", label: "释放" }];

// 优先使用处理器中文声明，未知扩展字段回退为稳定中文名称。
function fieldLabel(name: string, field: FieldSpec): string {
    return field.label || (name === "data" ? text.dataField : text.parameter);
}

// 将处理器字段选项转换为共享选择控件格式。
function selectOptions(field: FieldSpec): UiSelectOption[] {
    return (field.options ?? []).map((option) => typeof option === "string"
        ? { value: option, label: option }
        : { value: option.value, label: option.label });
}

// 判断当前步骤状态下需要立即展示并标记必填的条件字段。
function isConditionallyRequired(name: string): boolean {
    return props.stepType === "摧毁哨塔" && name === "path" && String(dataObject.value.navigation ?? "图标寻路") === "路径追踪";
}

// 根据处理器条件裁剪当前可编辑字段。
function filteredFields(): Array<[string, FieldSpec]> {
    // 声明字段保持注册顺序，便于与流程 JSON 对照。
    const fields = Object.entries(props.spec.fields ?? {});
    if (props.stepType === "自动任务") {
        const action = String(dataObject.value.action ?? "enable");
        const taskType = String(dataObject.value.taskType ?? "AutoSkip");
        return fields.filter(([name]) => name === "action" || (action === "enable" && name === "taskType") || (action === "enable" && taskType === "AutoPick" && name === "config"));
    }
    if (props.stepType === "摧毁哨塔") {
        const navigation = String(dataObject.value.navigation ?? "图标寻路");
        return fields.filter(([name]) => name === "navigation" || (navigation === "路径追踪" && name === "path"));
    }
    return fields;
}

// 提交新 data 值。
function updateValue(value: unknown): void {
    emit("update", value);
}

// 更新对象字段并处理依赖字段的互斥约束。
function updateObjectField(name: string, value: unknown, field: FieldSpec): void {
    // 对象扩展字段必须在普通字段编辑期间无损保留。
    const next = { ...dataObject.value, [name]: coerceFieldValue(value, field) };
    if (props.stepType === "自动任务" && name === "action" && value === "disable") {
        delete next.taskType;
        delete next.config;
    }
    if (props.stepType === "自动任务" && name === "taskType" && value !== "AutoPick") delete next.config;
    if (props.stepType === "摧毁哨塔" && name === "navigation" && value !== "路径追踪") delete next.path;
    updateValue(next);
}

// 删除一个非必填对象字段。
function removeObjectField(name: string): void {
    // 删除使用浅副本，避免直接修改父组件传入对象。
    const next = { ...dataObject.value };
    delete next[name];
    updateValue(next);
}

// 选择后立即添加可选字段、写入声明默认值并复位下拉框。
function addOptionalField(): void {
    const entry = optionalFields.value.find(([name]) => name === optionalField.value);
    if (!entry) return;
    const [name, field] = entry;
    // 新字段优先采用声明默认值，否则按类型创建稳定空值。
    const initial = "default" in field
        ? cloneProcessValue(field.default)
        : field.type === "array" ? [] : field.type === "object" ? {} : field.type === "boolean" ? false : field.type === "number" ? 0 : "";
    updateValue({ ...dataObject.value, [name]: initial });
    optionalField.value = "";
}

// 返回数组字段的编辑草稿，未编辑时使用结构化值生成文本。
function arrayFieldText(key: string, value: unknown): string {
    return Object.hasOwn(arrayDrafts, key) ? arrayDrafts[key] : Array.isArray(value) ? value.join("\n") : "";
}

// 字段失焦后丢弃临时文本，回到结构化数组的规范展示。
function clearArrayDraft(key: string): void {
    delete arrayDrafts[key];
}

// 把多行文本转换为非空字符串数组，同时保留输入中的末尾换行。
function updateArrayField(name: string, event: Event, field: FieldSpec): void {
    // 草稿先于结构化提交更新，避免父组件回显抹掉末尾换行。
    const element = event.target as HTMLTextAreaElement;
    const value = element.value;
    arrayDrafts[name] = value;
    const items = value.split(/\r?\n/).map((item) => item.trim()).filter(Boolean);
    updateObjectField(name, items, field);
}

// 更新嵌套数组字段并保留文本域尚未提交成条目的换行草稿。
function updateNestedArrayField(name: string, child: string, event: Event, childSpec: FieldSpec): void {
    // 嵌套字段使用带父字段前缀的稳定草稿键。
    const element = event.target as HTMLTextAreaElement;
    const value = element.value;
    const draftKey = `${name}.${child}`;
    arrayDrafts[draftKey] = value;
    const items = value.split(/\r?\n/).map((item) => item.trim()).filter(Boolean);
    updateNestedField(name, child, items, childSpec);
}

// 更新 AutoPick 一类嵌套对象字段并保留未知键。
function updateNestedField(name: string, child: string, value: unknown, childSpec: FieldSpec): void {
    const nested = editableRecord(dataObject.value[name]);
    updateObjectField(name, { ...nested, [child]: coerceFieldValue(value, childSpec) }, props.spec.fields?.[name] ?? { type: "object" });
}

// 更新按键专用编辑器。
function updateKeyField(name: "key" | "action", value: string): void {
    const source = typeof props.modelValue === "string" ? { key: props.modelValue, action: "press" } : dataObject.value;
    updateValue({ ...source, [name]: value });
}

// 更新角色槽位并检查重复。
function updateRole(slot: string, value: string): void {
    const next = { ...dataObject.value };
    if (value.trim()) next[slot] = value.trim(); else delete next[slot];
    const values = Object.values(next).filter((item): item is string => typeof item === "string" && Boolean(item));
    roleError.value = new Set(values).size === values.length ? "" : text.duplicateRole;
    updateValue(next);
}

// 返回波次中的阈值到路径映射。
function waveRoutes(number: number): Record<string, unknown> {
    return editableRecord(dataObject.value[`wave${number}`]);
}

// 添加一个未占用的连续波次。
function addWave(): void {
    let number = 1;
    while (waveNumbers.value.includes(number)) number += 1;
    updateValue({ ...dataObject.value, [`wave${number}`]: { "-1": "" } });
}

// 删除指定波次。
function removeWave(number: number): void {
    const next = { ...dataObject.value };
    delete next[`wave${number}`];
    updateValue(next);
}

// 修改波次编号并避免覆盖已有波次。
function renameWave(previous: number, value: string): void {
    const number = Number(value);
    if (!Number.isInteger(number) || number < 1 || (number !== previous && waveNumbers.value.includes(number))) return;
    const next = { ...dataObject.value };
    const routes = next[`wave${previous}`];
    delete next[`wave${previous}`];
    next[`wave${number}`] = routes;
    updateValue(next);
}

// 添加一个尚未使用的波次路径阈值。
function addWaveRoute(number: number): void {
    const routes = waveRoutes(number);
    let condition = -1;
    while (Object.hasOwn(routes, String(condition))) condition += 1;
    updateValue({ ...dataObject.value, [`wave${number}`]: { ...routes, [condition]: "" } });
}

// 更新波次路径条件或文件值。
function updateWaveRoute(number: number, previousCondition: string, condition: string, path: string): void {
    const routes = { ...waveRoutes(number) };
    if (condition !== previousCondition) delete routes[previousCondition];
    routes[condition] = path;
    updateValue({ ...dataObject.value, [`wave${number}`]: routes });
}

// 删除一个波次路径条件。
function removeWaveRoute(number: number, condition: string): void {
    const routes = { ...waveRoutes(number) };
    delete routes[condition];
    updateValue({ ...dataObject.value, [`wave${number}`]: routes });
}

// 返回分支当前嵌套步骤并补齐默认类型。
function branchStep(key: string): ProcessStep {
    const existing = editableRecord(dataObject.value[key]);
    return { ...existing, type: typeof existing.type === "string" ? existing.type : (props.processors.find((item) => item.type !== "用户分支选择")?.type ?? "") } as ProcessStep;
}

// 更新分支嵌套步骤且保留未知步骤字段。
function updateBranchStep(key: string, patch: Partial<ProcessStep>): void {
    updateValue({ ...dataObject.value, [key]: { ...branchStep(key), ...patch } });
}

// 切换分支嵌套步骤类型并重置其 data。
function updateBranchType(key: string, type: string): void {
    const processor = props.processors.find((item) => item.type === type);
    const current = branchStep(key);
    const next: ProcessStep = { ...current, type };
    if (!processor || processor.dataSpec.kind === "none") delete next.data;
    else if (processor.dataSpec.kind === "object") next.data = {};
    else if (processor.dataSpec.kind === "number") next.data = Number(processor.dataSpec.default ?? 0);
    else if (processor.dataSpec.kind !== "custom") next.data = String(processor.dataSpec.default ?? "");
    updateBranchStep(key, next);
}

// 查找分支嵌套步骤的处理器声明。
function branchProcessor(key: string): ProcessorMeta | undefined {
    return props.processors.find((item) => item.type === branchStep(key).type);
}
</script>

<template>
    <div class="data-editor" :class="{ 'dialog-data': stepType === '对话' }">
        <p v-if="spec.kind === 'none'" class="field-note">{{ text.noData }}</p>
        <template v-else-if="spec.kind === 'string' || spec.kind === 'number'">
            <div class="scalar-field">
                <FieldLabel :label="spec.label || '数据'" name="data" :required="!spec.optional" :hint="spec.hint || (!spec.optional ? text.required : text.optional)" />
                <div class="record-row">
                    <UiSelect v-if="spec.options" :model-value="String(modelValue ?? '')" :options="selectOptions(spec)" :aria-label="spec.label || text.dataField" width="content" @change="updateValue($event)" />
                    <UiSelect v-else-if="stepType === '地图追踪'" editable :model-value="String(modelValue ?? '')" :options="pathOptions" :aria-label="spec.label || text.dataField" width="field" @update:model-value="updateValue($event)" />
                    <input v-else class="control" :type="spec.kind === 'number' ? 'number' : 'text'" :min="spec.min" :max="spec.max" :step="spec.integer ? 1 : 'any'" :value="modelValue ?? ''" @input="updateValue(coerceFieldValue(($event.target as HTMLInputElement).value, spec))">
                    <button v-if="stepType === '地图追踪'" class="primary" type="button" @click="emit('recordPath')">{{ pathOptions.some((option) => option.value === String(modelValue ?? '')) ? text.editPath : text.recordPath }}</button>
                </div>
            </div>
        </template>

        <template v-else-if="spec.kind === 'object'">
            <UiSelect v-if="optionalFields.length" v-model="optionalField" class="optional-picker" :options="optionalFields.map(([name, field]) => ({ value: name, label: `${fieldLabel(name, field)} (${name})` }))" :placeholder="text.selectParameter" :aria-label="text.selectParameter" width="field" :max-width="300" @change="addOptionalField" />
            <section v-for="([name, field]) in visibleFields" :key="name" class="data-field" :class="{ 'dialog-field': stepType === '对话', 'dialog-field-wide': stepType === '对话' && visibleFields.length === 1, 'data-field-complex': field.type === 'object' }">
                <FieldLabel :label="fieldLabel(name, field)" :name="name" :required="field.required || isConditionallyRequired(name)" :hint="field.hint || (field.required || isConditionallyRequired(name) ? text.required : text.optional)" />
                <div class="field-control">
                    <textarea v-if="field.type === 'array'" class="control" :value="arrayFieldText(name, dataObject[name])" :placeholder="text.everyLine" @input="updateArrayField(name, $event, field)" @blur="clearArrayDraft(name)"></textarea>
                    <div v-else-if="field.type === 'object'" class="nested-object">
                        <div v-for="(child, childName) in field.fields" :key="childName" class="parameter-row">
                            <FieldLabel :label="fieldLabel(String(childName), child)" :name="String(childName)" :required="child.required" :hint="child.hint || (child.required ? text.required : text.optional)" />
                            <textarea v-if="child.type === 'array'" class="control" :value="arrayFieldText(`${name}.${String(childName)}`, editableRecord(dataObject[name])[childName])" :placeholder="text.everyLine" @input="updateNestedArrayField(name, String(childName), $event, child)" @blur="clearArrayDraft(`${name}.${String(childName)}`)"></textarea>
                            <UiSelect v-else-if="child.type === 'boolean'" :model-value="String(editableRecord(dataObject[name])[childName] ?? false)" :options="booleanOptions" :aria-label="fieldLabel(String(childName), child)" width="compact" @change="updateNestedField(name, String(childName), $event, child)" />
                            <input v-else class="control" :type="child.type === 'number' ? 'number' : 'text'" :value="editableRecord(dataObject[name])[childName] ?? ''" @input="updateNestedField(name, String(childName), ($event.target as HTMLInputElement).value, child)">
                        </div>
                    </div>
                    <UiSelect v-else-if="field.type === 'boolean'" :model-value="String(dataObject[name] ?? false)" :options="booleanOptions" :aria-label="fieldLabel(name, field)" width="compact" @change="updateObjectField(name, $event, field)" />
                    <UiSelect v-else-if="stepType === '执行子流程' && name === 'path'" editable :model-value="String(dataObject[name] ?? '')" :options="subProcessOptions" :aria-label="fieldLabel(name, field)" width="field" @update:model-value="updateObjectField(name, $event, field)" />
                    <UiSelect v-else-if="field.options" :model-value="String(dataObject[name] ?? '')" :options="selectOptions(field)" :aria-label="fieldLabel(name, field)" width="content" :max-width="280" @change="updateObjectField(name, $event, field)" />
                    <input v-else class="control" :type="field.type === 'number' ? 'number' : 'text'" :min="field.min" :max="field.max" :step="field.integer ? 1 : 'any'" :value="dataObject[name] ?? ''" @input="updateObjectField(name, ($event.target as HTMLInputElement).value, field)">
                    <button v-if="stepType === '执行子流程' && name === 'path'" class="primary mini" type="button" :disabled="!String(dataObject[name] ?? '').trim()" @click="emit('editSubprocess', String(dataObject[name] ?? ''))">{{ subProcessOptions.some((option) => option.value === String(dataObject[name] ?? '')) ? text.editSubprocess : text.createSubprocess }}</button>
                    <button v-if="!field.required && !field.alwaysVisible && !isConditionallyRequired(name)" class="danger mini" type="button" @click="removeObjectField(name)">{{ text.removeField }}</button>
                </div>
            </section>
        </template>

        <template v-else-if="spec.kind === 'custom' && spec.editor === 'key'">
            <div class="parameter-row"><FieldLabel :label="text.operation" name="action" :hint="text.optional" /><UiSelect :model-value="String(dataObject.action ?? 'press')" :options="keyActionOptions" :aria-label="text.operation" width="compact" @change="updateKeyField('action', $event)" /></div><div class="parameter-row"><FieldLabel :label="text.key" name="key" required :hint="text.required" /><input class="control" :value="dataObject.key ?? (typeof modelValue === 'string' ? modelValue : '')" :placeholder="text.keyHint" @input="updateKeyField('key', ($event.target as HTMLInputElement).value)"></div>
        </template>

        <template v-else-if="spec.kind === 'custom' && spec.editor === 'roles'">
            <div v-for="slot in roleSlots" :key="slot" class="parameter-row"><FieldLabel :label="text.roleSlot" :name="slot" :hint="text.optional" /><UiSelect editable :model-value="String(dataObject[slot] ?? '')" :options="roles.map((role) => ({ value: role, label: role }))" :aria-label="`${text.roleSlot} ${slot}`" width="field" @update:model-value="updateRole(slot, $event)" /></div>
            <p v-if="roleError" class="status-error">{{ roleError }}</p>
        </template>

        <template v-else-if="spec.kind === 'custom' && spec.editor === 'waves'">
            <div class="parameter-row"><FieldLabel :label="text.totalTimeout" name="timeout" :hint="text.defaultTimeout" /><input class="control" type="number" min="1" :value="dataObject.timeout ?? ''" :placeholder="text.defaultTimeout" @input="updateValue({ ...dataObject, timeout: Number(($event.target as HTMLInputElement).value) })"></div>
            <p v-if="waveNumbers.length" class="field-note wave-condition-hint">{{ text.killConditionHint }}</p>
            <section v-for="number in waveNumbers" :key="number" class="wave-card"><header><label><FieldLabel :label="text.wave" :name="`wave${number}`" /><input class="control wave-number" type="number" min="1" :value="number" @change="renameWave(number, ($event.target as HTMLInputElement).value)"></label><button class="danger mini" type="button" @click="removeWave(number)">{{ text.deleteWave }}</button></header><div v-for="(path, condition) in waveRoutes(number)" :key="String(condition)" class="wave-route"><input class="control" type="number" min="-1" step="1" :value="condition" :placeholder="text.killConditionPlaceholder" :aria-label="text.killCondition" @change="updateWaveRoute(number, String(condition), ($event.target as HTMLInputElement).value, String(path))"><input class="control" :value="path" placeholder="路径文件.json" aria-label="路径文件" @input="updateWaveRoute(number, String(condition), String(condition), ($event.target as HTMLInputElement).value)"><button class="danger" type="button" @click="removeWaveRoute(number, String(condition))">×</button></div><button type="button" @click="addWaveRoute(number)">{{ text.addPathCondition }}</button></section>
            <button type="button" @click="addWave">{{ text.addWave }}</button>
        </template>

        <template v-else-if="spec.kind === 'custom' && spec.editor === 'branches'">
            <p v-if="!branches.length" class="status-error">{{ text.emptyBranches }}</p>
            <section v-for="branch in branches" v-else :key="branch.key" class="branch-card"><header><FieldLabel :label="branch.label" :name="branch.key" /></header><StepTypeMenu :model-value="branchStep(branch.key).type" :processors="processors.filter((item) => item.type !== '用户分支选择')" :aria-label="`${branch.label} ${text.stepType}`" @change="updateBranchType(branch.key, $event)" /><StepDataEditor v-if="branchProcessor(branch.key)" :model-value="branchStep(branch.key).data" :spec="branchProcessor(branch.key)!.dataSpec" :step-type="branchStep(branch.key).type" :processors="processors" :roles="roles" :branches="[]" :path-options="pathOptions" :sub-process-options="subProcessOptions" @update="updateBranchStep(branch.key, { data: $event })" @record-path="emit('recordPath')" @edit-subprocess="emit('editSubprocess', $event)"></StepDataEditor><label><FieldLabel :label="text.note" name="note" /><input class="control" :value="branchStep(branch.key).note ?? ''" @input="updateBranchStep(branch.key, { note: ($event.target as HTMLInputElement).value })"></label></section>
        </template>

        <p v-else class="status-error">{{ text.unsupportedEditor }}</p>
    </div>
</template>

<style scoped>
.data-editor { --parameter-label-width:minmax(150px,42%); display:grid; gap:12px; }.scalar-field,.data-field,.parameter-row { min-width:0; display:grid; grid-template-columns:var(--parameter-label-width) minmax(0,1fr); align-items:center; gap:12px; }.dialog-data { grid-template-columns:1fr; }.dialog-data>.optional-picker,.dialog-data>.dialog-field-wide { grid-column:auto; }.field-control,.record-row { min-width:0; display:flex; align-items:center; gap:6px; }.field-control>.control,.field-control>.ui-select,.record-row>.control,.record-row>.ui-select { min-width:0; flex:1; }.data-field-complex { padding:9px; border:1px solid var(--color-border); border-radius:var(--radius-control); }.data-field-complex>.field-control { align-items:start; }.data-field textarea { min-height:76px; resize:vertical; }.nested-object { min-width:0; flex:1; display:grid; gap:10px; }.nested-object .parameter-row { grid-template-columns:minmax(120px,38%) minmax(0,1fr); }.nested-object .control,.parameter-row>.control,.parameter-row>.ui-select { width:100%; min-width:0; max-width:100%; }.wave-card,.branch-card { display:grid; gap:12px; padding:9px; border:1px solid var(--color-border); border-radius:var(--radius-control); }.wave-card>header,.branch-card>header { display:flex; align-items:center; justify-content:space-between; gap:8px; }.field-note { color:var(--color-text-muted); font-size:11px; }.wave-condition-hint { margin:0; }.optional-picker { width:min(100%,300px); }.wave-route { display:flex; gap:6px; align-items:center; }.wave-route .control { flex:1; }.wave-number { width:84px; }.branch-card>header { justify-content:flex-start; }.mini { flex:none; min-height:28px; height:28px; padding:0 7px; }
</style>
