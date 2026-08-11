<script setup lang="ts">
import { Check, ChevronDown } from "@lucide/vue";
import { computed, nextTick, onBeforeUnmount, ref, useAttrs, useId, watch } from "vue";
import { copy } from "@/shared/i18n/zh-CN";
import type { CSSProperties } from "vue";
import type { UiSelectOption, UiSelectWidth } from "@/shared/types/ui";

// 控件属性统一普通选择和允许自由输入的候选选择。
const props = withDefaults(defineProps<{
    modelValue?: string | null;
    options: UiSelectOption[];
    placeholder?: string;
    ariaLabel?: string;
    disabled?: boolean;
    editable?: boolean;
    width?: UiSelectWidth;
    maxWidth?: number;
    menuMaxWidth?: number;
}>(), {
    modelValue: "",
    ariaLabel: "",
    placeholder: copy.common.select,
    disabled: false,
    editable: false,
    width: "field",
    maxWidth: undefined,
    menuMaxWidth: 360,
});
// 选择事件兼容 v-model、原生 change 和自由输入监听方式。
const emit = defineEmits<{
    "update:modelValue": [value: string];
    change: [value: string];
    input: [value: string];
}>();
// 透传属性兼容模板中的标准 aria-label 写法。
const attrs = useAttrs();
// 控件根节点用于识别外部点击。
const rootElement = ref<HTMLElement | null>(null);
// 按钮或输入框是弹层定位和焦点恢复锚点。
const triggerElement = ref<HTMLElement | null>(null);
// 传送到 body 的菜单节点用于点击和滚动判断。
const menuElement = ref<HTMLElement | null>(null);
// 弹层展开状态只属于当前控件。
const open = ref(false);
// 可编辑模式查询与已提交值分离，避免打开时只剩一个精确匹配。
const query = ref("");
// 键盘高亮索引指向过滤后选项。
const activeIndex = ref(-1);
// 菜单固定定位样式在每次打开时根据视口重新计算。
const menuStyle = ref<CSSProperties>({});
// 唯一列表标识连接触发器和弹层语义。
const listboxId = `ui-select-${useId()}`;

// 可访问名称优先使用显式属性，其次读取标准 aria-label。
const accessibleLabel = computed(() => props.ariaLabel || String(attrs["aria-label"] ?? ""));
// 当前值对应的展示文字，未知自由输入值直接显示自身。
const selectedLabel = computed(() => props.options.find((option) => option.value === props.modelValue)?.label ?? props.modelValue ?? "");
// 最长展示文字用于所有非表格控件生成稳定的内容宽度基准。
const longestLabel = computed(() => [props.placeholder, selectedLabel.value, ...props.options.map((option) => option.label)].reduce((longest, label) => label.length > longest.length ? label : longest, ""));
// 可编辑模式仅在用户输入后过滤候选。
const visibleOptions = computed(() => {
    const keyword = props.editable ? query.value.trim().toLocaleLowerCase("zh-CN") : "";
    return props.options.filter((option) => !keyword || option.label.toLocaleLowerCase("zh-CN").includes(keyword) || option.value.toLocaleLowerCase("zh-CN").includes(keyword));
});
// 宽度变量允许页面按场景覆盖默认上限。
const rootStyle = computed<CSSProperties>(() => ({ "--ui-select-max-width": `${props.maxWidth ?? (props.width === "compact" ? 160 : 320)}px` } as CSSProperties));

// 查找指定方向上最近的可用选项。
function nextEnabledIndex(start: number, direction: 1 | -1): number {
    // 当前过滤结果决定可导航范围。
    const options = visibleOptions.value;
    if (!options.length) return -1;
    // 循环偏移保证导航能够跨过禁用项并首尾衔接。
    for (let offset = 0; offset < options.length; offset += 1) {
        // 候选索引按方向归一化到合法区间。
        const index = (start + offset * direction + options.length) % options.length;
        if (!options[index].disabled) return index;
    }
    return -1;
}

// 让键盘高亮项保持在菜单可视范围内。
function scrollActiveOption(): void {
    nextTick(() => {
        // 当前高亮节点可能因过滤或关闭而不存在。
        const option = menuElement.value?.querySelector<HTMLElement>(`[data-option-index="${activeIndex.value}"]`);
        if (typeof option?.scrollIntoView === "function") option.scrollIntoView({ block: "nearest" });
    });
}

// 根据锚点和可用空间定位弹层，底部空间不足时向上展开。
function positionMenu(): void {
    // 触发器缺失时无需计算弹层几何。
    const trigger = triggerElement.value;
    if (!trigger) return;
    // 锚点矩形用于计算上下空间和水平边界。
    const rect = trigger.getBoundingClientRect();
    // 菜单实际内容宽度由浏览器排版结果决定，避免中英文字符估算偏宽。
    const contentWidth = menuElement.value?.scrollWidth ?? rect.width;
    // 弹层至少与触发器等宽，同时受调用方上限约束。
    const estimated = Math.max(rect.width, Math.min(props.menuMaxWidth, contentWidth));
    // 最终宽度始终限制在当前视口内。
    const width = Math.min(estimated, window.innerWidth - 16);
    // 菜单最大高度为视口留出安全边距。
    const maxHeight = Math.min(240, window.innerHeight - 16);
    // 锚点下方可用空间。
    const below = window.innerHeight - rect.bottom - 8;
    // 锚点上方可用空间。
    const above = rect.top - 8;
    // 底部不足且上方更宽裕时向上展开。
    const opensUp = below < Math.min(160, maxHeight) && above > below;
    // 实际高度由展开方向的可用空间决定。
    const height = Math.min(maxHeight, opensUp ? above : below);
    // 水平位置在左右各保留八像素安全边距。
    const left = Math.min(Math.max(8, rect.left), window.innerWidth - width - 8);
    menuStyle.value = {
        position: "fixed",
        zIndex: 1000,
        left: `${left}px`,
        width: `${width}px`,
        maxHeight: `${Math.max(80, height)}px`,
        top: opensUp ? "auto" : `${rect.bottom + 5}px`,
        bottom: opensUp ? `${window.innerHeight - rect.top + 5}px` : "auto",
    };
}

// 打开菜单并把高亮定位到当前值或首个可用项，输入触发时保留查询文字。
function openMenu(preserveQuery = false): void {
    if (props.disabled || open.value) return;
    if (!preserveQuery) query.value = "";
    open.value = true;
    // 当前值优先成为打开后的键盘高亮项。
    const selected = visibleOptions.value.findIndex((option) => option.value === props.modelValue && !option.disabled);
    activeIndex.value = selected >= 0 ? selected : nextEnabledIndex(0, 1);
    nextTick(() => {
        positionMenu();
        scrollActiveOption();
    });
}

// 关闭菜单并按需恢复触发器焦点。
function closeMenu(restoreFocus = false): void {
    if (!open.value) return;
    open.value = false;
    query.value = "";
    if (restoreFocus) nextTick(() => triggerElement.value?.focus());
}

// 切换普通选择菜单状态。
function toggleMenu(): void {
    if (open.value) closeMenu(); else openMenu();
}

// 提交一个可用选项并触发与原生选择等价的事件。
function chooseOption(option: UiSelectOption): void {
    if (option.disabled) return;
    emit("update:modelValue", option.value);
    emit("change", option.value);
    if (props.editable) emit("input", option.value);
    closeMenu(true);
}

// 自由输入时立即回传文本并使用输入内容过滤候选。
function updateEditableValue(event: Event): void {
    // 输入框文本既是业务值也是本次候选过滤词。
    const value = (event.target as HTMLInputElement).value;
    query.value = value;
    emit("update:modelValue", value);
    emit("input", value);
    if (!open.value) openMenu(true);
    else nextTick(positionMenu);
}

// 处理触发器和输入框上的完整键盘选择行为。
function handleTriggerKeydown(event: KeyboardEvent): void {
    if (event.key === "Tab") {
        closeMenu();
        return;
    }
    if (event.key === "Escape") {
        event.preventDefault();
        closeMenu(true);
        return;
    }
    if (event.key === "Enter" || event.key === " " && !props.editable) {
        event.preventDefault();
        if (!open.value) openMenu();
        else if (activeIndex.value >= 0) chooseOption(visibleOptions.value[activeIndex.value]);
        return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        if (!open.value) {
            openMenu();
            return;
        }
        // 方向决定循环导航的前后顺序。
        const direction = event.key === "ArrowDown" ? 1 : -1;
        activeIndex.value = nextEnabledIndex(activeIndex.value < 0 ? (direction === 1 ? 0 : visibleOptions.value.length - 1) : activeIndex.value + direction, direction);
        scrollActiveOption();
        return;
    }
    if (event.key === "Home" || event.key === "End") {
        if (!open.value) return;
        event.preventDefault();
        activeIndex.value = nextEnabledIndex(event.key === "Home" ? 0 : visibleOptions.value.length - 1, event.key === "Home" ? 1 : -1);
        scrollActiveOption();
    }
}

// 外部指针按下时关闭当前弹层。
function handleDocumentPointer(event: PointerEvent): void {
    // 指针目标同时排除本体和传送后的菜单。
    const target = event.target as Node | null;
    if (target && !rootElement.value?.contains(target) && !menuElement.value?.contains(target)) closeMenu();
}

// 视口变化时重新定位，外部滚动则关闭避免锚点脱离。
function handleViewportChange(event: Event): void {
    if (!open.value) return;
    if (event.type === "scroll" && menuElement.value?.contains(event.target as Node)) return;
    if (event.type === "resize") positionMenu(); else closeMenu();
}

// 展开期间安装全局监听，关闭后立即释放。
watch(open, (isOpen) => {
    if (isOpen) {
        document.addEventListener("pointerdown", handleDocumentPointer, true);
        window.addEventListener("resize", handleViewportChange);
        window.addEventListener("scroll", handleViewportChange, true);
    } else {
        document.removeEventListener("pointerdown", handleDocumentPointer, true);
        window.removeEventListener("resize", handleViewportChange);
        window.removeEventListener("scroll", handleViewportChange, true);
    }
});

// 组件卸载时确保不残留全局事件。
function cleanupSelect(): void {
    document.removeEventListener("pointerdown", handleDocumentPointer, true);
    window.removeEventListener("resize", handleViewportChange);
    window.removeEventListener("scroll", handleViewportChange, true);
}

onBeforeUnmount(cleanupSelect);
</script>

<template>
    <span ref="rootElement" class="ui-select" :class="[`ui-select--${width}`, { 'ui-select--open': open, 'ui-select--disabled': disabled }]" :style="rootStyle">
        <span v-if="width !== 'table'" class="ui-select__sizer" aria-hidden="true">{{ longestLabel }}</span>
        <input v-if="editable" ref="triggerElement" class="ui-select__trigger ui-select__input" type="text" role="combobox" autocomplete="off" :value="modelValue ?? ''" :placeholder="placeholder" :disabled="disabled" :aria-label="accessibleLabel" :aria-expanded="open" :aria-controls="listboxId" @focus="openMenu()" @input="updateEditableValue" @keydown="handleTriggerKeydown">
        <button v-else ref="triggerElement" class="ui-select__trigger" type="button" role="combobox" :disabled="disabled" :aria-label="accessibleLabel" :aria-expanded="open" :aria-controls="listboxId" aria-haspopup="listbox" @click="toggleMenu" @keydown="handleTriggerKeydown">
            <span :class="{ placeholder: !selectedLabel }" :title="selectedLabel || placeholder">{{ selectedLabel || placeholder }}</span><ChevronDown :size="16" aria-hidden="true" />
        </button>
        <Teleport to="body">
            <div v-if="open" :id="listboxId" ref="menuElement" class="ui-select__menu" data-interactive-surface role="listbox" :aria-label="accessibleLabel" :style="menuStyle">
                <template v-for="(option, index) in visibleOptions" :key="`${option.group ?? ''}-${option.value}`">
                    <div v-if="option.group && option.group !== visibleOptions[index - 1]?.group" class="ui-select__group">{{ option.group }}</div>
                    <button class="ui-select__option" type="button" role="option" :class="{ active: activeIndex === index, selected: option.value === modelValue }" :disabled="option.disabled" :aria-selected="option.value === modelValue" :data-option-index="index" :data-option-value="option.value" :title="option.label" @mouseenter="activeIndex = index" @mousedown.prevent="chooseOption(option)">
                        <span>{{ option.label }}</span><Check v-if="option.value === modelValue" :size="15" aria-hidden="true" />
                    </button>
                </template>
                <span v-if="!visibleOptions.length" class="ui-select__empty">{{ copy.common.noMatches }}</span>
            </div>
        </Teleport>
    </span>
</template>

<style>
.ui-select { min-width:0; max-width:100%; display:inline-grid; grid-template-areas:"control"; vertical-align:middle; }
.ui-select--table { width:100%; }.ui-select--field,.ui-select--compact,.ui-select--content { width:max-content; max-width:min(100%,var(--ui-select-max-width)); }
.ui-select--compact { min-width:min(96px,100%); }
.ui-select__sizer,.ui-select__trigger { grid-area:control; }.ui-select__sizer { min-height:var(--control-height); padding:7px 38px 7px 11px; overflow:hidden; visibility:hidden; white-space:nowrap; }
.ui-select__trigger { width:100%; min-width:0; min-height:var(--control-height); height:var(--control-height); display:flex; align-items:center; justify-content:space-between; gap:8px; padding:0 10px 0 11px; overflow:hidden; border:1px solid var(--color-border); border-radius:var(--radius-control); background:var(--color-surface-raised); color:var(--color-text); text-align:left; }
.ui-select__trigger>span { min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }.ui-select__trigger .placeholder { color:var(--color-text-muted); }.ui-select__trigger svg { flex:none; color:var(--color-text-muted); transition:transform 180ms; }.ui-select--open .ui-select__trigger svg { transform:rotate(180deg); }
.ui-select__input { display:block; padding:7px 34px 7px 10px; background-image:linear-gradient(45deg,transparent 50%,var(--color-text-muted) 50%),linear-gradient(135deg,var(--color-text-muted) 50%,transparent 50%); background-position:calc(100% - 17px) 15px,calc(100% - 12px) 15px; background-repeat:no-repeat; background-size:5px 5px; }
.ui-select__trigger:hover:not(:disabled) { border-color:var(--color-border-strong); background-color:var(--color-surface-hover); }.ui-select--open .ui-select__trigger { border-color:var(--color-primary); background-color:var(--color-surface-hover); box-shadow:0 0 0 3px var(--color-primary-soft); }.ui-select__trigger:disabled { cursor:not-allowed; opacity:.45; }
.ui-select__menu { width:max-content; max-width:calc(100vw - 16px); overflow:auto; padding:5px; border:1px solid var(--color-border-strong); border-radius:var(--radius-control); background:var(--color-surface-raised); box-shadow:var(--shadow-popover); color:var(--color-text); }
.ui-select__group { padding:7px 8px 4px; color:var(--color-text-muted); font-size:11px; font-weight:600; }
.ui-select__option { width:100%; min-height:34px; height:auto; display:flex; align-items:center; justify-content:space-between; gap:8px; padding:6px 8px; border:0; border-radius:4px; background:transparent; color:var(--color-text); text-align:left; }
.ui-select__option>span { min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }.ui-select__option svg { flex:none; color:var(--color-primary); }.ui-select__option.active { background:var(--color-surface-hover); }.ui-select__option.selected { color:var(--color-primary-hover); background:var(--color-primary-soft); }.ui-select__option:disabled { opacity:.42; }
.ui-select__empty { display:block; padding:9px; color:var(--color-text-muted); text-align:center; }
@media (max-width:600px) { .ui-select--compact,.ui-select--content,.ui-select--field { max-width:100%; } }
@media (prefers-reduced-motion:reduce) { .ui-select__trigger svg { transition:none; } }
</style>
