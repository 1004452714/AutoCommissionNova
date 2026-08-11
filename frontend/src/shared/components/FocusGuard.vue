<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from "vue";
import { copy } from "@/shared/i18n/zh-CN";

// 失焦保护状态只在窗口失焦后启用，初次打开不阻挡操作。
const guarded = ref(false);

// WebView 失焦时覆盖全部交互区域，等待下一次主动点击。
function handleWindowBlur(): void {
    guarded.value = true;
}

// 首次点击由保护层消费，并恢复后续界面交互。
function dismissGuard(): void {
    guarded.value = false;
}

// 注册窗口级失焦监听，使所有入口共享相同行为。
function initializeGuard(): void {
    window.addEventListener("blur", handleWindowBlur);
}

// 卸载入口时清理监听，避免开发环境重复挂载。
function cleanupGuard(): void {
    window.removeEventListener("blur", handleWindowBlur);
}

onMounted(initializeGuard);
onBeforeUnmount(cleanupGuard);
</script>

<template>
    <button v-if="guarded" class="focus-guard" type="button" :aria-label="copy.common.clickToContinue" @click.stop="dismissGuard">
        <span>{{ copy.common.clickToContinue }}</span>
    </button>
</template>

<style scoped>
.focus-guard {
    position: fixed;
    z-index: 10000;
    inset: 0;
    display: grid;
    width: 100vw;
    height: 100vh;
    min-height: 0;
    padding: 0;
    place-items: center;
    border: 0;
    border-radius: 0;
    background: rgba(5, 8, 9, 0.56);
    color: var(--color-text);
    cursor: default;
}

.focus-guard:hover,
.focus-guard:active {
    border: 0;
    background: rgba(5, 8, 9, 0.56);
    transform: none;
}

.focus-guard:focus-visible {
    outline: none;
}

.focus-guard span {
    padding: 8px 14px;
    border: 1px solid var(--color-border-strong);
    border-radius: var(--radius-control);
    background: var(--color-surface-raised);
    box-shadow: var(--shadow-popover);
    color: var(--color-text-muted);
    font-size: 13px;
}
</style>
