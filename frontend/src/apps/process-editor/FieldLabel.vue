<script setup lang="ts">
// 字段信息同时承载中文名称、流程 JSON 原始键和参数说明。
defineProps<{ label: string; name: string; required?: boolean; hint?: string }>();
</script>

<template>
    <span class="field-label" :class="{ required }"><span class="field-label-title"><span>{{ label }}</span><i aria-hidden="true">|</i><small>{{ name }}</small></span><span v-if="hint" class="field-label-hint" :title="hint">{{ hint }}</span></span>
</template>

<style scoped>
.field-label { min-width:0; display:grid; gap:3px; color:#cbd3dd; }.field-label-title { min-width:0; display:flex; align-items:baseline; gap:6px; white-space:nowrap; }.field-label-title>span { overflow:hidden; text-overflow:ellipsis; }.field-label-title i { color:var(--color-border-strong); font-style:normal; }.field-label small { overflow:hidden; color:var(--color-text-muted); font:11px/1.2 Consolas,monospace; text-overflow:ellipsis; }.field-label-hint { overflow:hidden; color:var(--color-text-muted); font-size:11px; line-height:1.35; text-overflow:ellipsis; white-space:nowrap; }.field-label.required .field-label-title>span::after { content:" *"; color:var(--color-error); }
</style>
