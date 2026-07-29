<script setup lang="ts">
import { Check, ChevronDown, ChevronRight } from "@lucide/vue";
import { computed, nextTick, onBeforeUnmount, ref, useAttrs, useId, watch } from "vue";
import { copy } from "@/shared/i18n/zh-CN";
import type { CSSProperties } from "vue";
import type { ProcessorMeta } from "@/apps/process-editor/types";

// 步骤类型菜单属性保持后端处理器顺序和当前值。
const props = withDefaults(defineProps<{ modelValue: string; processors: ProcessorMeta[]; ariaLabel?: string; disabled?: boolean; maxWidth?: number }>(), { ariaLabel: "", disabled: false, maxWidth: 320 });
// 类型选择同时支持 v-model 和原生 change 风格调用。
const emit = defineEmits<{ "update:modelValue": [value: string]; change: [value: string] }>();
// 菜单静态文案来自共享中文文案表。
const text = copy.processEditor;
// 透传属性兼容标准 aria-label 模板写法。
const attrs = useAttrs();
// 菜单根节点用于识别外部点击。
const rootElement = ref<HTMLElement | null>(null);
// 触发按钮提供定位锚点和关闭后的焦点恢复。
const triggerElement = ref<HTMLButtonElement | null>(null);
// 传送弹层节点用于外部点击排除。
const menuElement = ref<HTMLElement | null>(null);
// 二级菜单展开状态。
const open = ref(false);
// 当前分类索引决定右列内容。
const categoryIndex = ref(0);
// 当前步骤索引用于右列键盘导航。
const itemIndex = ref(0);
// 键盘当前操作分类列或步骤列。
const keyboardColumn = ref<"category" | "item">("item");
// 菜单固定定位样式避免被检查器滚动裁剪。
const menuStyle = ref<CSSProperties>({});
// 唯一菜单标识连接触发器和悬浮面板。
const menuId = `step-menu-${useId()}`;

// 可访问名称优先使用显式属性，其次读取标准 aria-label。
const accessibleLabel = computed(() => props.ariaLabel || String(attrs["aria-label"] ?? ""));
// 处理器按宿主返回顺序归入分类。
const groups = computed(() => Object.entries(props.processors.reduce<Record<string, ProcessorMeta[]>>((result, processor) => {
    (result[processor.category] ??= []).push(processor);
    return result;
}, {})));
// 当前分类中的步骤列表。
const activeItems = computed(() => groups.value[categoryIndex.value]?.[1] ?? []);
// 当前值对应处理器用于初始化分类。
const selectedProcessor = computed(() => props.processors.find((processor) => processor.type === props.modelValue));
// 最长步骤名称让触发器在容器允许时完整展示候选文本。
const longestType = computed(() => props.processors.reduce((longest, processor) => processor.type.length > longest.length ? processor.type : longest, props.modelValue || text.selectStepType));

// 使用当前控件字体测量菜单文本，避免按字符数估算造成中文列过宽。
function measureTextWidth(labels: string[]): number {
    // 隐藏测量节点使用真实页面字体，不进入可见布局。
    const measurer = document.createElement("span");
    measurer.style.cssText = "position:fixed;visibility:hidden;white-space:nowrap;pointer-events:none";
    // 触发器计算样式与菜单按钮使用相同的页面字体。
    const style = triggerElement.value ? window.getComputedStyle(triggerElement.value) : null;
    measurer.style.font = style?.font || "14px sans-serif";
    document.body.appendChild(measurer);
    // 测量结果在无布局引擎的测试环境退回保守字符宽度。
    const width = Math.max(0, ...labels.map((label) => {
        measurer.textContent = label;
        return measurer.getBoundingClientRect().width || label.length * 8;
    }));
    measurer.remove();
    return Math.ceil(width);
}

// 根据触发器位置将两列菜单限制在视口中。
function positionMenu(): void {
    // 触发器缺失时无需计算弹层几何。
    const trigger = triggerElement.value;
    if (!trigger) return;
    // 锚点矩形用于计算菜单方向和边界。
    const rect = trigger.getBoundingClientRect();
    // 分类列按最长文本留出图标及内边距。
    const desiredCategoryWidth = Math.max(144, measureTextWidth(groups.value.map(([category]) => category)) + 54);
    // 步骤列按全部处理器测量，切换分类时弹层宽度保持稳定。
    const desiredItemWidth = Math.max(132, measureTextWidth(props.processors.map((processor) => processor.type)) + 46);
    // 两列菜单在窄视口内同比收缩，并优先保障步骤列的可用宽度。
    const availableWidth = Math.max(120, window.innerWidth - 16);
    // 弹层总宽度不超过视口安全区。
    const width = Math.min(desiredCategoryWidth + desiredItemWidth + 1, availableWidth);
    // 窄视口下二级步骤列至少占 55%，一级列仍保留最低可操作宽度。
    const minimumItemWidth = Math.min(132, width * 0.55);
    // 一级列使用剩余空间，避免固定宽度挤掉二级菜单。
    const categoryWidth = Math.min(desiredCategoryWidth, Math.max(Math.min(88, width * 0.45), width - minimumItemWidth));
    // 锚点下方可用空间。
    const below = window.innerHeight - rect.bottom - 8;
    // 锚点上方可用空间。
    const above = rect.top - 8;
    // 下方空间不足时改为向上展开。
    const opensUp = below < 260 && above > below;
    // 菜单高度在可用空间和内容上限之间取值。
    const maxHeight = Math.max(180, Math.min(360, opensUp ? above : below));
    // 水平位置限制在视口安全区内。
    const left = Math.min(Math.max(8, rect.left), window.innerWidth - width - 8);
    menuStyle.value = { position: "fixed", zIndex: 1000, left: `${left}px`, width: `${width}px`, "--step-menu-category-width": `${categoryWidth}px`, maxHeight: `${maxHeight}px`, top: opensUp ? "auto" : `${rect.bottom + 5}px`, bottom: opensUp ? `${window.innerHeight - rect.top + 5}px` : "auto" } as CSSProperties;
}

// 打开时定位到当前步骤所在分类和条目。
function openMenu(): void {
    if (props.disabled || open.value) return;
    // 当前步骤所在分类作为首次展开分类。
    const groupIndex = groups.value.findIndex(([, items]) => items.some((item) => item.type === props.modelValue));
    categoryIndex.value = Math.max(0, groupIndex);
    itemIndex.value = Math.max(0, activeItems.value.findIndex((item) => item.type === props.modelValue));
    keyboardColumn.value = "item";
    open.value = true;
    nextTick(() => {
        positionMenu();
        menuElement.value?.focus();
    });
}

// 关闭菜单并按需恢复触发按钮焦点。
function closeMenu(restoreFocus = false): void {
    if (!open.value) return;
    open.value = false;
    if (restoreFocus) nextTick(() => triggerElement.value?.focus());
}

// 鼠标悬停或键盘移动时切换分类并重置步骤焦点。
function activateCategory(index: number): void {
    categoryIndex.value = Math.min(Math.max(index, 0), Math.max(0, groups.value.length - 1));
    itemIndex.value = 0;
}

// 选择步骤类型并关闭菜单。
function chooseType(type: string): void {
    emit("update:modelValue", type);
    emit("change", type);
    closeMenu(true);
}

// 处理两列菜单的方向键、确认和取消操作。
function handleMenuKeydown(event: KeyboardEvent): void {
    if (event.key === "Escape" || event.key === "Tab") {
        if (event.key === "Escape") event.preventDefault();
        closeMenu(event.key === "Escape");
        return;
    }
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
        event.preventDefault();
        keyboardColumn.value = event.key === "ArrowLeft" ? "category" : "item";
        return;
    }
    if (event.key === "ArrowUp" || event.key === "ArrowDown" || event.key === "Home" || event.key === "End") {
        event.preventDefault();
        // 上下方向用于分类列和步骤列的循环移动。
        const direction = event.key === "ArrowUp" ? -1 : 1;
        if (keyboardColumn.value === "category") {
            // 分类目标支持首尾键和循环方向键。
            const target = event.key === "Home" ? 0 : event.key === "End" ? groups.value.length - 1 : categoryIndex.value + direction;
            activateCategory((target + groups.value.length) % groups.value.length);
        } else {
            // 当前分类步骤数量决定右列导航边界。
            const length = activeItems.value.length;
            // 步骤目标支持首尾键和循环方向键。
            const target = event.key === "Home" ? 0 : event.key === "End" ? length - 1 : itemIndex.value + direction;
            itemIndex.value = length ? (target + length) % length : 0;
        }
        return;
    }
    if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        if (keyboardColumn.value === "category") keyboardColumn.value = "item";
        else if (activeItems.value[itemIndex.value]) chooseType(activeItems.value[itemIndex.value].type);
    }
}

// 触发按钮支持点击及键盘直接打开菜单。
function handleTriggerKeydown(event: KeyboardEvent): void {
    if (["Enter", " ", "ArrowDown"].includes(event.key)) {
        event.preventDefault();
        openMenu();
    } else if (event.key === "Escape") closeMenu();
}

// 外部指针按下时关闭步骤菜单。
function handleDocumentPointer(event: PointerEvent): void {
    // 指针目标同时排除本体和传送后的菜单。
    const target = event.target as Node | null;
    if (target && !rootElement.value?.contains(target) && !menuElement.value?.contains(target)) closeMenu();
}

// 视口尺寸变化重新定位，外部滚动关闭菜单。
function handleViewportChange(event: Event): void {
    if (!open.value) return;
    if (event.type === "scroll" && menuElement.value?.contains(event.target as Node)) return;
    if (event.type === "resize") positionMenu(); else closeMenu();
}

// 仅在菜单展开期间安装全局监听。
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

// 组件卸载时释放所有全局监听。
function cleanupMenu(): void {
    document.removeEventListener("pointerdown", handleDocumentPointer, true);
    window.removeEventListener("resize", handleViewportChange);
    window.removeEventListener("scroll", handleViewportChange, true);
}

onBeforeUnmount(cleanupMenu);
</script>

<template>
    <span ref="rootElement" class="step-type-menu" :style="{ '--step-menu-max-width': `${maxWidth}px` }">
        <span class="step-type-sizer" aria-hidden="true">{{ longestType }}</span>
        <button ref="triggerElement" class="step-type-trigger" type="button" role="combobox" :disabled="disabled" :aria-label="accessibleLabel" :aria-expanded="open" :aria-controls="menuId" aria-haspopup="menu" @click="open ? closeMenu() : openMenu()" @keydown="handleTriggerKeydown">
            <span>{{ selectedProcessor?.type || modelValue || text.selectStepType }}</span><ChevronDown :size="16" aria-hidden="true" />
        </button>
        <Teleport to="body">
            <div v-if="open" :id="menuId" ref="menuElement" class="step-type-popover" data-interactive-surface role="menu" tabindex="-1" :aria-label="accessibleLabel" :style="menuStyle" @keydown="handleMenuKeydown">
                <div class="step-type-categories">
                    <button v-for="([category], index) in groups" :key="category" type="button" role="menuitem" :class="{ active: categoryIndex === index, keyboard: keyboardColumn === 'category' && categoryIndex === index }" aria-haspopup="menu" @mouseenter="activateCategory(index)" @focus="activateCategory(index)" @click="activateCategory(index); keyboardColumn = 'item'">
                        <span>{{ category }}</span><ChevronRight :size="15" aria-hidden="true" />
                    </button>
                </div>
                <div class="step-type-items" role="menu">
                    <button v-for="(item, index) in activeItems" :key="item.type" type="button" role="menuitemradio" :aria-checked="item.type === modelValue" :class="{ active: item.type === modelValue, keyboard: keyboardColumn === 'item' && itemIndex === index }" @mouseenter="itemIndex = index" @mousedown.prevent="chooseType(item.type)">
                        <span>{{ item.type }}</span><Check v-if="item.type === modelValue" :size="15" aria-hidden="true" />
                    </button>
                </div>
            </div>
        </Teleport>
    </span>
</template>

<style>
.step-type-menu { width:max-content; max-width:min(100%,var(--step-menu-max-width)); min-width:0; display:inline-grid; grid-template-areas:"control"; }.step-type-sizer,.step-type-trigger { grid-area:control; }.step-type-sizer { min-height:var(--control-height); padding:7px 38px 7px 11px; overflow:hidden; visibility:hidden; white-space:nowrap; }.step-type-trigger { width:100%; min-width:0; height:var(--control-height); display:flex; align-items:center; justify-content:space-between; gap:8px; padding:0 10px 0 11px; overflow:hidden; border:1px solid var(--color-border); border-radius:var(--radius-control); background:var(--color-surface-raised); color:var(--color-text); text-align:left; }.step-type-trigger>span { min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }.step-type-trigger svg { flex:none; color:var(--color-text-muted); }.step-type-trigger:hover:not(:disabled) { border-color:var(--color-border-strong); background:#252d38; }
.step-type-popover { min-height:180px; display:grid; grid-template-columns:var(--step-menu-category-width) minmax(0,1fr); overflow:hidden; border:1px solid var(--color-border-strong); border-radius:var(--radius-control); background:var(--color-surface-raised); box-shadow:0 12px 32px rgba(0,0,0,.55); color:var(--color-text); outline:none; }.step-type-categories,.step-type-items { min-height:0; overflow:auto; padding:5px; }.step-type-categories { border-right:1px solid var(--color-border); background:var(--color-navigation); }.step-type-popover button { width:100%; min-height:35px; height:auto; display:flex; align-items:center; justify-content:space-between; gap:8px; padding:6px 8px; border:0; border-radius:4px; background:transparent; color:var(--color-text); text-align:left; }.step-type-popover button span { min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }.step-type-popover button:hover,.step-type-popover button.keyboard { background:#2a3441; }.step-type-popover button.active { background:rgba(77,141,255,.18); color:#fff; }.step-type-items svg { color:var(--color-primary); }
</style>
