<script setup lang="ts">
// 分段控件选项，当前值由父组件通过 v-model 绑定。
defineProps<{ modelValue: string; options: Array<{ value: string; label: string }>; ariaLabel?: string }>();
// 选择变化只回传选项值。
const emit = defineEmits<{ "update:modelValue": [value: string] }>();
</script>

<template>
    <div class="ui-segmented" role="radiogroup" :aria-label="ariaLabel">
        <button v-for="option in options" :key="option.value" type="button" role="radio" :aria-checked="option.value === modelValue" :class="{ active: option.value === modelValue }" @click="emit('update:modelValue', option.value)">{{ option.label }}</button>
    </div>
</template>

<style scoped>
/* 分段按钮连成一条成为一个控件，选中段使用主色实底作为原生选中态。 */
.ui-segmented { display:inline-flex; gap:2px; padding:3px; border:1px solid var(--color-border); border-radius:var(--radius-control); background:rgba(0,0,0,.14); }
.ui-segmented button { min-height:28px; height:28px; padding:0 10px; border-color:transparent; background:transparent; color:var(--color-text-muted); font-size:12px; white-space:nowrap; }
.ui-segmented button:hover:not(.active) { border-color:transparent; background:rgba(255,255,255,.05); }
.ui-segmented button.active { border-color:var(--color-primary); background:var(--color-primary); color:#fff; }
</style>
