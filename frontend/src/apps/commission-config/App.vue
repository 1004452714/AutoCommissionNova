<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { Trash2 } from "@lucide/vue";
import { requestHtmlMask, subscribeHtmlMask, toError } from "@/shared/bridge/html-mask";
import UiSelect from "@/shared/components/UiSelect.vue";
import { copy } from "@/shared/i18n/zh-CN";
import { DEFAULT_STRATEGY, ROLE_SLOTS, buildBattleGroups, filterBattleScopes, globalConfigForSave, normalizePayload, normalizeStrategyValue } from "@/apps/commission-config/model";
import type { BranchConfig, CommissionConfigPayload, ConfigOperationResult, PartyScope, StrategyEntry, StrategyNode, TeamConfig } from "@/apps/commission-config/types";

// 页面文案由共享中文文案表提供。
const text = copy.commissionConfig;
// 通用按钮文案由共享文案表提供。
const commonText = copy.common;
// 初始化前使用完整的空配置，避免模板访问空对象。
const config = ref<CommissionConfigPayload>(normalizePayload({}));
// 当前一级视图决定侧栏和详情内容。
const currentTab = ref<"global" | "battle" | "branch">("global");
// 当前委托名称在战斗和分支视图间独立校正。
const selectedCommission = ref("");
// 战斗详情使用国家和类型共同限定同名委托的地点范围。
const selectedBattleCountry = ref("");
const selectedBattleType = ref<"NPC" | "Basic">("NPC");
// 侧栏搜索仅过滤当前业务视图。
const searchTerm = ref("");
// 用户手动展开的国家分组允许多个国家同时查看。
const openBattleCountries = ref<Set<string>>(new Set());
// 用户手动展开的 NPC/Basic 分组允许独立折叠。
const openBattleTypes = ref<Set<string>>(new Set());
// 页面加载状态保留导航以展示局部加载反馈。
const loaded = ref(false);
// BetterGI 推送控制整个工作区显隐。
const visible = ref(true);
// 关闭期间禁用可能产生新请求的操作。
const closing = ref(false);
// 保存状态用于页头的短反馈。
const saveState = ref<"" | "saving" | "saved" | "error">("");
// 保存文字提供当前结果或恢复建议。
const saveText = ref<string>(copy.common.loading);
// 自动保存定时器合并连续输入。
let saveTimer: ReturnType<typeof setTimeout> | undefined;
// 宿主消息卸载函数由订阅适配器返回。
let unsubscribe = (): void => undefined;
// 浏览器侧交互按固定间隔通知宿主，供 30 秒无操作自动关闭计时。
const activityEvents: Array<keyof WindowEventMap> = ["pointerdown", "pointermove", "keydown", "input", "wheel", "touchstart"];
const idleTimeoutMs = 30_000;
const activityThrottleMs = 5_000;
const idleSecondsRemaining = ref(idleTimeoutMs / 1000);
let idleDeadlineAt = Date.now() + idleTimeoutMs;
let idleCountdownTimer: ReturnType<typeof setInterval> | undefined;
let lastActivitySentAt = 0;
// 策略选择器是否覆盖当前工作区。
const strategyOpen = ref(false);
// 策略目录读取状态。
const strategyLoading = ref(false);
// 策略读取错误显示在弹窗内部。
const strategyError = ref("");
// 策略树根节点按目录优先排序。
const strategyRoots = ref<StrategyNode[]>([]);
// 策略选择器当前要更新的业务对象。
const strategyTarget = ref<{ target: Record<string, unknown>; field: string } | null>(null);
// 当前策略值用于选中态。
const strategySelected = ref(DEFAULT_STRATEGY);
// 当前标签下所有委托名称。
const commissionNames = computed(() => {
    const names = currentTab.value === "branch"
        ? Object.keys(config.value.branches)
        : Object.keys(config.value.party.scopesByCommission);
    return names.sort((a, b) => a.localeCompare(b, "zh-CN"));
});
// 搜索结果保持委托名称和进度展示。
const filteredCommissions = computed(() => commissionNames.value.filter((name) => name.toLowerCase().includes(searchTerm.value.toLowerCase())));
// 战斗委托按国家 NPC 和 Basic 分组并附带多地点数量。
const battleGroups = computed(() => buildBattleGroups(config.value.party.scopesByCommission, searchTerm.value));
// 搜索时只自动展开首个匹配国家及其首个类型。
const searchBattlePath = computed(() => {
    const country = battleGroups.value[0];
    return { country: country?.key ?? "", type: country?.groups[0]?.key ?? "" };
});
// 当前筛选后的战斗委托总数用于侧栏状态反馈。
const filteredBattleCount = computed(() => battleGroups.value.reduce((count, country) => count + country.count, 0));
// 当前委托的分支配置由组合视图直接引用。
const selectedBranch = computed(() => config.value.branches[selectedCommission.value] ?? null);
// 当前委托的地点队伍集合由组合视图直接引用。
const selectedScopes = computed(() => filterBattleScopes(
    config.value.party.scopesByCommission[selectedCommission.value] ?? [],
    selectedBattleCountry.value,
    selectedBattleType.value,
));
// 展开的策略节点扁平化后便于虚拟层级展示。
const strategyRows = computed(() => {
    // 展示行同时包含缩进层级。
    const rows: Array<{ node: StrategyNode; depth: number }> = [];
    // 深度优先展开当前可见节点。
    const visit = (nodes: StrategyNode[], depth: number): void => {
        nodes.forEach((node) => {
            rows.push({ node, depth });
            if (node.type === "folder" && node.expanded) visit(node.children, depth + 1);
        });
    };
    visit(strategyRoots.value, 0);
    return rows;
});

// 切换主视图并保证详情仍指向可达委托。
function setTab(tab: "global" | "battle" | "branch"): void {
    currentTab.value = tab;
    searchTerm.value = "";
    if (tab === "global") {
        selectedCommission.value = "";
    } else if (tab === "branch") {
        selectedCommission.value = commissionNames.value[0] ?? "";
    } else {
        const country = battleGroups.value[0];
        const group = country?.groups[0];
        selectedCommission.value = group?.items[0]?.name ?? "";
        selectedBattleCountry.value = country?.title ?? "";
        selectedBattleType.value = group?.title ?? "NPC";
    }
    if (tab !== "battle") {
        openBattleCountries.value = new Set();
        openBattleTypes.value = new Set();
    }
    ensureBranchDefault();
}

// 判断国家分组在搜索或手动状态下是否展开。
function battleCountryOpen(key: string): boolean {
    return searchTerm.value ? searchBattlePath.value.country === key : openBattleCountries.value.has(key);
}

// 判断二级类型分组在搜索或手动状态下是否展开。
function battleTypeOpen(countryKey: string, typeKey: string): boolean {
    return searchTerm.value
        ? searchBattlePath.value.country === countryKey && searchBattlePath.value.type === typeKey
        : openBattleTypes.value.has(typeKey);
}

// 独立切换国家分组并保持其他国家状态。
function toggleBattleCountry(key: string): void {
    const next = new Set(openBattleCountries.value);
    if (next.has(key)) next.delete(key); else next.add(key);
    openBattleCountries.value = next;
}

// 独立切换国家下的 NPC 或 Basic 分组。
function toggleBattleType(key: string): void {
    const next = new Set(openBattleTypes.value);
    if (next.has(key)) next.delete(key); else next.add(key);
    openBattleTypes.value = next;
}

// 选择委托并补齐缺失的默认分支。
function selectCommission(name: string, country = "", type: "NPC" | "Basic" = "NPC"): void {
    selectedCommission.value = name;
    if (currentTab.value === "battle") {
        selectedBattleCountry.value = country;
        selectedBattleType.value = type;
    }
    ensureBranchDefault();
}

// 同名委托在不同国家或类型下是不同的侧栏选择。
function battleCommissionSelected(name: string, country: string, type: "NPC" | "Basic"): boolean {
    return selectedCommission.value === name
        && selectedBattleCountry.value === country
        && selectedBattleType.value === type;
}

// 当配置没有有效默认值时使用第一条已声明分支。
function ensureBranchDefault(): void {
    const branch = selectedBranch.value;
    if (!branch) return;
    const keys = Object.keys(branch.descriptions);
    if (keys.length && (!branch.default || !branch.descriptions[branch.default])) {
        branch.default = keys[0];
        scheduleSave();
    }
}

// 返回成就条件声明的分支条目。
function achievementBranches(branch: BranchConfig): Array<{ id: string; description: string }> {
    return Object.entries(branch.descriptions)
        .filter(([id]) => Boolean(branch.conditions[id]))
        .map(([id, description]) => ({ id, description }));
}

// 切换当前账号的成就分支完成状态。
function toggleBranchCompleted(branchId: string): void {
    const branch = selectedBranch.value;
    if (!branch) return;
    branch.completed = branch.completed.includes(branchId)
        ? branch.completed.filter((id) => id !== branchId)
        : [...branch.completed, branchId];
    scheduleSave();
}

// 计算侧栏分支完成进度。
function branchProgress(name: string): string {
    const branch = config.value.branches[name];
    if (!branch) return "";
    const ids = Object.keys(branch.conditions);
    if (!ids.length) return "";
    return `${branch.completed.filter((id) => ids.includes(id)).length}/${ids.length}`;
}

// 将 UID 输入限制为数字或开发者测试字面值。
function updateUid(index: number, event: Event): void {
    const raw = (event.target as HTMLInputElement).value.trim();
    config.value.global.uids[index] = /^[a-z]+$/i.test(raw) ? raw.toLowerCase() : raw.replace(/\D/g, "");
    scheduleSave();
}

// 新增 UID 行，存在 test 时改为打开开发者测试页。
async function addUid(): Promise<void> {
    if (config.value.global.uids.some((uid) => uid.toLowerCase() === "test")) {
        closing.value = true;
        try {
            await requestHtmlMask<ConfigOperationResult>("/openDeveloperTest", {});
        } catch (error) {
            saveState.value = "error";
            saveText.value = toError(error).message;
            closing.value = false;
        }
        return;
    }
    config.value.global.uids.push("");
    scheduleSave();
}

// 删除指定 UID 并保留至少一个可编辑行。
function removeUid(index: number): void {
    config.value.global.uids.splice(index, 1);
    if (!config.value.global.uids.length) config.value.global.uids.push("");
    scheduleSave();
}

// 合并连续编辑并在 300ms 后保存完整配置。
function scheduleSave(): void {
    saveState.value = "saving";
    saveText.value = "修改中...";
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
        saveTimer = undefined;
        void saveConfig();
    }, 300);
}

// 将当前组合视图按原协议写回 BetterGI。
async function saveConfig(): Promise<void> {
    saveState.value = "saving";
    saveText.value = text.saving;
    // 保存内容保持原有 global、branches、party 三段结构。
    const content = JSON.stringify({
        global: globalConfigForSave(config.value.global),
        branches: config.value.branches,
        party: config.value.party,
    }, null, 4);
    try {
        const result = await requestHtmlMask<ConfigOperationResult, { content: string }>("/saveConfig", { content }, 5000);
        if (result.status !== "ok") throw new Error(result.message || "保存失败");
        saveState.value = "saved";
        saveText.value = text.saved;
    } catch (error) {
        saveState.value = "error";
        saveText.value = `保存失败：${toError(error).message}`;
    }
}

// 关闭前刷新尚未触发的自动保存，再通知主流程继续。
async function requestClose(): Promise<void> {
    if (closing.value) return;
    closing.value = true;
    if (saveTimer) {
        clearTimeout(saveTimer);
        saveTimer = undefined;
        await saveConfig();
    }
    try {
        await requestHtmlMask<ConfigOperationResult>("/close", {}, 5000);
    } catch (error) {
        saveState.value = "error";
        saveText.value = toError(error).message;
        closing.value = false;
    }
}

// 请求 BetterGI 将游戏地图定位到当前委托地点。
async function locateScope(scope: PartyScope): Promise<void> {
    visible.value = false;
    saveState.value = "saving";
    saveText.value = "正在定位...";
    try {
        const result = await requestHtmlMask<ConfigOperationResult, { scope: PartyScope }>("/locateScope", { scope }, 30000);
        if (result.status === "error") throw new Error(result.message || "定位失败");
        saveState.value = "saved";
        saveText.value = "已发送定位";
    } catch (error) {
        saveState.value = "error";
        saveText.value = toError(error, "定位失败").message;
        visible.value = true;
    }
}

// 返回紧凑的国家与地点标题。
function scopeTitle(scope: PartyScope): string {
    return [scope.country, scope.locationDir || scope.location].filter(Boolean).join(" | ") || scope.label;
}

// 切换自定义队伍的输入模式并安排保存。
function setTeamMode(team: TeamConfig, mode: "teamName" | "roles"): void {
    team.teamMode = mode;
    scheduleSave();
}

// 将后端策略条目转换为可展开节点。
function prepareStrategyNodes(entries: StrategyEntry[]): StrategyNode[] {
    return entries.map<StrategyNode>((entry) => ({
        path: entry.name.replace(/\\/g, "/"),
        type: entry.type === "folder" ? "folder" : "file",
        expanded: false,
        loaded: false,
        children: [],
    })).sort((a, b) => a.type === b.type ? a.path.localeCompare(b.path, "zh-CN") : (a.type === "folder" ? -1 : 1));
}

// 打开策略选择器并读取根目录。
async function openStrategy(target: object, field: string): Promise<void> {
    // 业务配置对象在此处通过受控字段名读写策略值。
    const editableTarget = target as Record<string, unknown>;
    strategyTarget.value = { target: editableTarget, field };
    strategySelected.value = typeof editableTarget[field] === "string" ? editableTarget[field] as string : DEFAULT_STRATEGY;
    strategyRoots.value = [];
    strategyError.value = "";
    strategyOpen.value = true;
    strategyLoading.value = true;
    try {
        const result = await requestHtmlMask<{ children: StrategyEntry[]; error?: string }>("/loadStrategyTree", {}, 5000);
        if (result.error) throw new Error(result.error);
        strategyRoots.value = prepareStrategyNodes(result.children ?? []);
    } catch (error) {
        strategyError.value = toError(error, "加载策略列表失败").message;
    } finally {
        strategyLoading.value = false;
    }
}

// 展开策略目录，首次展开时通过宿主延迟读取子项。
async function toggleStrategyFolder(node: StrategyNode): Promise<void> {
    if (node.type !== "folder") return;
    node.expanded = !node.expanded;
    if (!node.expanded || node.loaded) return;
    try {
        const result = await requestHtmlMask<{ children: StrategyEntry[]; error?: string }, { path: string }>("/loadStrategyChildren", { path: node.path }, 5000);
        if (result.error) throw new Error(result.error);
        node.children = prepareStrategyNodes(result.children ?? []);
        node.loaded = true;
    } catch (error) {
        node.expanded = false;
        strategyError.value = toError(error, "读取策略目录失败").message;
    }
}

// 应用选中策略或默认策略并关闭弹窗。
function chooseStrategy(path: string): void {
    const binding = strategyTarget.value;
    if (!binding) return;
    binding.target[binding.field] = normalizeStrategyValue(path);
    strategyOpen.value = false;
    scheduleSave();
}

// 本地倒计时即时响应用户活动，宿主仍负责最终关闭判定。
function resetIdleCountdown(): void {
    idleDeadlineAt = Date.now() + idleTimeoutMs;
    idleSecondsRemaining.value = idleTimeoutMs / 1000;
}

function updateIdleCountdown(): void {
    idleSecondsRemaining.value = Math.max(0, Math.ceil((idleDeadlineAt - Date.now()) / 1000));
}

// 将真实键鼠活动节流上报，避免高频 pointermove 淹没 htmlMask 消息队列。
function reportActivity(): void {
    resetIdleCountdown();
    const now = Date.now();
    if (now - lastActivitySentAt < activityThrottleMs) return;
    lastActivitySentAt = now;
    void requestHtmlMask<ConfigOperationResult>("/activity", {}, 2_000).catch(() => undefined);
}

function installActivityTracking(): void {
    resetIdleCountdown();
    idleCountdownTimer = setInterval(updateIdleCountdown, 250);
    activityEvents.forEach((eventName) => window.addEventListener(eventName, reportActivity, { passive: true }));
}

function removeActivityTracking(): void {
    activityEvents.forEach((eventName) => window.removeEventListener(eventName, reportActivity));
}

// 卸载页面时移除宿主订阅并取消未触发的保存。
function cleanupPage(): void {
    unsubscribe();
    removeActivityTracking();
    if (idleCountdownTimer) clearInterval(idleCountdownTimer);
    if (saveTimer) clearTimeout(saveTimer);
}

// 读取组合配置并安装宿主推送处理器。
async function initialize(): Promise<void> {
    installActivityTracking();
    unsubscribe = subscribeHtmlMask((message) => {
        if (message.url === "/toggleVisibility") visible.value = (message.data as { visible?: boolean } | undefined)?.visible !== false;
    });
    try {
        config.value = normalizePayload(await requestHtmlMask<unknown>("/loadConfig", {}, 5000));
        loaded.value = true;
        saveState.value = "saved";
        saveText.value = text.loaded;
    } catch (error) {
        saveState.value = "error";
        saveText.value = toError(error, "加载失败").message;
    }
}

onMounted(initialize);
onBeforeUnmount(cleanupPage);
</script>

<template>
    <div v-show="visible" class="shell workspace-frame">
        <aside class="sidebar">
            <div class="tabs" role="tablist">
                <button :class="{ active: currentTab === 'global' }" @click="setTab('global')">{{ text.global }}</button>
                <button :class="{ active: currentTab === 'battle' }" @click="setTab('battle')">{{ text.battle }}</button>
                <button :class="{ active: currentTab === 'branch' }" @click="setTab('branch')">{{ text.branch }}</button>
            </div>
            <input v-if="currentTab !== 'global'" v-model.trim="searchTerm" class="control search" :placeholder="currentTab === 'battle' ? text.searchBattle : text.searchBranch">
            <div v-if="!loaded" class="empty">{{ commonText.loading }}</div>
            <div v-else-if="currentTab === 'global'" class="empty">{{ text.global }}</div>
            <nav v-else-if="currentTab === 'branch'" class="commission-list" aria-label="分支委托列表">
                <button v-for="name in filteredCommissions" :key="name" :class="{ active: selectedCommission === name }" @click="selectCommission(name)">
                    <span>{{ name }}</span><small>{{ branchProgress(name) }}</small>
                </button>
                <div v-if="!filteredCommissions.length" class="empty">{{ commonText.empty }}</div>
            </nav>
            <nav v-else class="commission-list battle-list" aria-label="战斗委托列表">
                <section v-for="country in battleGroups" :key="country.key" class="battle-country">
                    <button class="country-header" :aria-expanded="battleCountryOpen(country.key)" @click="toggleBattleCountry(country.key)"><span><i>{{ battleCountryOpen(country.key) ? '▾' : '▸' }}</i>{{ country.title }}</span><small>{{ country.count }}</small></button>
                    <div v-show="battleCountryOpen(country.key)" class="country-groups">
                        <section v-for="group in country.groups" :key="group.key" class="battle-group">
                            <button class="group-header" :aria-expanded="battleTypeOpen(country.key, group.key)" @click="toggleBattleType(group.key)"><span><i>{{ battleTypeOpen(country.key, group.key) ? '▾' : '▸' }}</i>{{ group.title }}</span><small>{{ group.items.length }}</small></button>
                            <div v-show="battleTypeOpen(country.key, group.key)" class="group-items"><button v-for="item in group.items" :key="`${group.key}-${item.name}`" :class="{ active: battleCommissionSelected(item.name, country.title, group.title) }" @click="selectCommission(item.name, country.title, group.title)"><span>{{ item.name }}</span><small v-if="item.progress">{{ item.progress }}</small></button></div>
                        </section>
                    </div>
                </section>
                <div v-if="!filteredBattleCount" class="empty">{{ commonText.empty }}</div>
            </nav>
            <footer class="side-footer">{{ currentTab === 'global' ? 'Data/user-config.json' : currentTab === 'battle' ? `共 ${filteredBattleCount} 个 · Data/user-config.json` : 'config/branches' }}</footer>
        </aside>

        <main class="workspace">
            <header class="topbar">
                <div><h1>{{ text.title }}</h1><span :class="`save-${saveState}`">{{ saveText }}</span></div>
                <div class="topbar-actions"><span class="idle-countdown">{{ idleSecondsRemaining }}秒后自动关闭</span><button class="primary" :disabled="closing" @click="requestClose">{{ text.close }}</button></div>
            </header>

            <section v-if="currentTab === 'global'" class="content form-content">
                <article class="section">
                    <h2>{{ text.uid }}</h2>
                    <div class="uid-grid">
                        <div v-for="(uid, index) in config.global.uids" :key="index" class="uid-field">
                            <input class="control" :value="uid" @input="updateUid(index, $event)">
                            <button class="danger icon" :title="commonText.delete" :aria-label="commonText.delete" @click="removeUid(index)"><Trash2 :size="17" aria-hidden="true" /></button>
                        </div>
                    </div>
                    <button @click="addUid">{{ text.addUid }}</button>
                </article>
                <article class="section toggle-row">
                    <div><h2>{{ text.safeTeleport }}</h2><span>{{ config.global.skipSafeTeleport ? text.enabled : text.disabled }}</span></div>
                    <button class="switch" :class="{ on: config.global.skipSafeTeleport }" role="switch" :aria-checked="config.global.skipSafeTeleport" @click="config.global.skipSafeTeleport = !config.global.skipSafeTeleport; scheduleSave()"></button>
                </article>
                <article class="section">
                    <h2>{{ text.globalParty }}</h2>
                    <div class="form-grid">
                        <label>{{ text.battleTeam }}<input v-model="config.party.global.battleTeamName" class="control" @input="scheduleSave"></label>
                        <label>{{ text.collectTeam }}<input v-model="config.party.global.elementTeamName" class="control" @input="scheduleSave"></label>
                        <label>{{ text.roleParty }}（战斗）<input v-model="config.party.global.customBattleTeamName" class="control" @input="scheduleSave"></label>
                        <label>{{ text.roleParty }}（采集）<input v-model="config.party.global.customElementTeamName" class="control" @input="scheduleSave"></label>
                        <label class="wide">{{ text.strategy }}
                            <div class="inline-field"><input v-model="config.party.global.battleStrategy" class="control" @input="scheduleSave"><button @click="openStrategy(config.party.global, 'battleStrategy')">{{ text.selectStrategy }}</button><button @click="config.party.global.battleStrategy = DEFAULT_STRATEGY; scheduleSave()">{{ text.useDefault }}</button></div>
                        </label>
                    </div>
                </article>
            </section>

            <section v-else-if="currentTab === 'branch'" class="content">
                <div v-if="!selectedCommission" class="empty detail-empty">{{ text.noSelection }}</div>
                <template v-else-if="selectedBranch">
                    <header class="detail-header"><div><h2>{{ selectedCommission }}</h2><p v-if="selectedBranch.note">{{ selectedBranch.note }}</p></div></header>
                    <article v-if="achievementBranches(selectedBranch).length" class="section">
                        <div v-for="branch in achievementBranches(selectedBranch)" :key="branch.id" class="branch-row">
                            <span>{{ branch.description }}</span>
                            <button class="switch-line" :class="{ completed: selectedBranch.completed.includes(branch.id) }" @click="toggleBranchCompleted(branch.id)">{{ selectedBranch.completed.includes(branch.id) ? text.completed : text.incomplete }}</button>
                        </div>
                    </article>
                    <article class="section">
                        <label>{{ achievementBranches(selectedBranch).length ? text.achievementDefault : text.defaultBranch }}
                            <UiSelect v-model="selectedBranch.default" :options="Object.entries(selectedBranch.descriptions).map(([value, label]) => ({ value, label }))" :aria-label="achievementBranches(selectedBranch).length ? text.achievementDefault : text.defaultBranch" width="content" :max-width="420" :menu-max-width="420" @change="scheduleSave" />
                        </label>
                    </article>
                </template>
                <div v-else class="empty detail-empty">{{ text.noBranch }}</div>
            </section>

            <section v-else class="content">
                <div v-if="!selectedCommission" class="empty detail-empty">{{ text.noSelection }}</div>
                <template v-else-if="selectedScopes.length">
                    <header class="detail-header"><h2>{{ selectedCommission }}</h2></header>
                    <article v-for="scope in selectedScopes" :key="scope.key" class="section scope-card">
                        <header><h3>{{ scopeTitle(scope) }}</h3><button @click="locateScope(scope)">{{ text.locate }}</button></header>
                        <div class="team-columns">
                            <div v-for="kind in (['battle', 'collect'] as const)" :key="kind" class="team-section">
                                <header><h4>{{ kind === 'battle' ? '战斗配置' : '元素采集配置' }}</h4><div class="segmented"><button :class="{ active: scope.config[kind].mode === 'global' }" @click="scope.config[kind].mode = 'global'; scheduleSave()">{{ text.inheritGlobal }}</button><button :class="{ active: scope.config[kind].mode === 'custom' }" @click="scope.config[kind].mode = 'custom'; scheduleSave()">{{ text.custom }}</button></div></header>
                                <template v-if="scope.config[kind].mode === 'custom'">
                                    <div class="segmented compact"><button :class="{ active: scope.config[kind].teamMode === 'teamName' }" @click="setTeamMode(scope.config[kind], 'teamName')">{{ text.teamName }}</button><button :class="{ active: scope.config[kind].teamMode === 'roles' }" @click="setTeamMode(scope.config[kind], 'roles')">{{ text.roles }}</button></div>
                                    <label v-if="scope.config[kind].teamMode === 'teamName'" class="short-field">{{ text.teamName }}<input v-model="scope.config[kind].teamName" class="control" maxlength="10" @input="scheduleSave"></label>
                                    <div v-else class="role-grid compact-roles">
                                        <label class="wide">{{ text.roleParty }}<input v-model="scope.config[kind].customTeamName" class="control" maxlength="10" @input="scheduleSave"></label>
                                        <label v-for="slot in ROLE_SLOTS" :key="slot">{{ text.role }} {{ slot }}<input v-model="scope.config[kind].roles[slot]" class="control" maxlength="6" @input="scheduleSave"></label>
                                    </div>
                                    <label v-if="kind === 'battle'" class="strategy-field">{{ text.strategy }}<div class="inline-field"><input v-model="scope.config.battle.strategy" class="control" maxlength="20" @input="scheduleSave"><button @click="openStrategy(scope.config.battle, 'strategy')">{{ text.selectStrategy }}</button><button @click="scope.config.battle.strategy = DEFAULT_STRATEGY; scheduleSave()">{{ text.useDefault }}</button></div></label>
                                </template>
                            </div>
                        </div>
                    </article>
                </template>
                <div v-else class="empty detail-empty">{{ text.noBattle }}</div>
            </section>
        </main>
    </div>

    <div v-if="visible && strategyOpen" class="modal-backdrop" role="dialog" aria-modal="true" aria-label="选择策略" @click.self="strategyOpen = false">
        <div class="modal">
            <header><h2>{{ text.selectStrategy }}</h2><button @click="strategyOpen = false">{{ commonText.close }}</button></header>
            <div class="strategy-actions"><button class="primary" @click="chooseStrategy(DEFAULT_STRATEGY)">{{ text.useDefault }}</button><span>{{ text.currentValue }}：{{ strategySelected }}</span></div>
            <div v-if="strategyError" class="status-error">{{ strategyError }}</div>
            <div v-else-if="strategyLoading" class="empty">{{ text.loadingStrategy }}</div>
            <div v-else-if="!strategyRows.length" class="empty">{{ text.emptyStrategy }}</div>
            <div v-else class="strategy-tree">
                <button v-for="row in strategyRows" :key="row.node.path" :class="{ selected: row.node.type === 'file' && normalizeStrategyValue(row.node.path) === strategySelected }" :style="{ paddingLeft: `${12 + row.depth * 20}px` }" @click="row.node.type === 'folder' ? toggleStrategyFolder(row.node) : chooseStrategy(row.node.path)">
                    <span>{{ row.node.type === 'folder' ? (row.node.expanded ? '▾' : '▸') : '•' }}</span>{{ row.node.path.split('/').pop() }}
                </button>
            </div>
        </div>
    </div>
</template>

<style scoped>
.shell { display:flex; overflow:hidden; border:1px solid var(--color-border); border-radius:var(--radius-panel); background:var(--color-workspace); box-shadow:0 14px 44px rgba(0,0,0,.5); }
.sidebar { width:260px; flex:none; display:flex; flex-direction:column; border-right:1px solid var(--color-border); background:var(--color-navigation); }
.tabs { display:grid; grid-template-columns:repeat(3,1fr); gap:4px; padding:12px; }
.tabs button { padding:0 2px; font-size:11px; white-space:nowrap; }
.tabs button.active,.commission-list button.active,.segmented button.active { border-color:var(--color-primary); background:rgba(77,141,255,.22); color:#fff; }
.search { width:calc(100% - 24px); margin:0 12px 8px; }
.commission-list { flex:1; min-height:0; overflow:auto; padding:4px 8px; }
.commission-list button { width:100%; display:flex; justify-content:space-between; align-items:center; margin:2px 0; border-color:transparent; background:transparent; text-align:left; }
.battle-country { margin-bottom:5px; }.country-header,.battle-group .group-header { min-height:34px; color:#d4dbe4; }.country-header { border-bottom:1px solid var(--color-border); font-weight:600; }.country-header span,.group-header span { display:flex; align-items:center; gap:6px; }.country-header i,.group-header i { width:12px; color:var(--color-text-muted); font-style:normal; }.country-header small,.group-header small,.group-items small { min-width:24px; padding:1px 5px; border-radius:var(--radius-control); background:rgba(255,255,255,.08); text-align:center; }.country-groups { padding-left:10px; }.battle-group .group-header { min-height:31px; color:var(--color-text-muted); }.group-items { padding-left:10px; }
.side-footer { padding:10px 12px; overflow:hidden; border-top:1px solid var(--color-border); color:var(--color-text-muted); font-size:12px; text-overflow:ellipsis; white-space:nowrap; }
.workspace { min-width:0; flex:1; display:flex; flex-direction:column; }
.topbar { height:62px; flex:none; display:flex; align-items:center; justify-content:space-between; gap:16px; padding:0 20px; border-bottom:1px solid var(--color-border); }
.topbar>div { display:flex; align-items:baseline; gap:14px; }
.topbar .topbar-actions { align-items:center; }.idle-countdown { color:var(--color-warning); font-size:14px; white-space:nowrap; }
h1,h2,h3,h4,p { margin:0; } h1 { font-size:20px; } h2 { font-size:18px; } h3 { font-size:16px; } h4 { font-size:14px; }
.save-saving { color:var(--color-warning); }.save-saved { color:var(--color-success); }.save-error { color:var(--color-error); }
.content { min-height:0; flex:1; overflow:auto; padding:16px 20px 24px; }
.form-content { display:grid; align-content:start; gap:12px; }
.section { margin-bottom:12px; padding:16px; border:1px solid var(--color-border); border-radius:var(--radius-panel); background:var(--color-surface); }
.section h2 { margin-bottom:12px; }
.inline-field { display:flex; align-items:center; gap:8px; margin-bottom:8px; }.inline-field .control { flex:1; }.uid-grid { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:8px; margin-bottom:10px; }.uid-field { display:grid; grid-template-columns:minmax(0,1fr) 36px; gap:6px; }
.icon { width:36px; padding:0; }
.toggle-row { display:flex; align-items:center; justify-content:space-between; }.toggle-row span { color:var(--color-text-muted); }
.switch { width:44px; min-height:24px; height:24px; padding:2px; border-radius:12px; }.switch::before { content:""; display:block; width:18px; height:18px; border-radius:50%; background:#aab4c0; transition:transform 180ms; }.switch.on { background:var(--color-primary); }.switch.on::before { transform:translateX(18px); background:white; }
.form-grid,.role-grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:12px; }.wide { grid-column:1 / -1; } label { display:grid; gap:6px; color:#cbd3dd; }
.detail-header { margin-bottom:12px; }.detail-header p { margin-top:5px; color:var(--color-text-muted); white-space:pre-wrap; }
.branch-row { display:flex; align-items:center; justify-content:space-between; gap:12px; padding:8px 0; border-bottom:1px solid var(--color-border); }.branch-row:last-child { border-bottom:0; }.switch-line.completed { color:var(--color-success); }
.scope-card>header { display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; }.team-columns { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:0 18px; border-top:1px solid var(--color-border); }.team-section { min-width:0; display:grid; align-content:start; gap:10px; padding:12px 0; }.team-section+ .team-section { padding-left:18px; border-left:1px solid var(--color-border); }.team-section>header { display:flex; align-items:center; justify-content:space-between; gap:8px; }.team-section .short-field { max-width:15em; }.compact-roles { grid-template-columns:repeat(2,minmax(0,9em)); gap:8px; }.compact-roles .wide { max-width:15em; }.strategy-field .inline-field { display:grid; grid-template-columns:minmax(10em,20em) auto auto; margin:0; }.strategy-field button { padding:0 8px; }
.segmented { display:flex; gap:4px; }.segmented button { min-height:32px; }.segmented.compact { justify-self:start; }
.empty { padding:24px 12px; color:var(--color-text-muted); text-align:center; }.detail-empty { display:grid; min-height:100%; place-items:center; }
.modal-backdrop { position:fixed; inset:0; display:grid; place-items:center; background:rgba(0,0,0,.62); }.modal { width:min(720px,88vw); max-height:78vh; display:flex; flex-direction:column; overflow:hidden; border:1px solid var(--color-border); border-radius:var(--radius-panel); background:var(--color-surface); box-shadow:0 20px 60px rgba(0,0,0,.55); }.modal>header { display:flex; align-items:center; justify-content:space-between; padding:14px 16px; border-bottom:1px solid var(--color-border); }.strategy-actions { display:flex; align-items:center; gap:12px; padding:12px 16px; }.strategy-actions span { color:var(--color-text-muted); }.strategy-tree { min-height:0; overflow:auto; padding:0 8px 12px; }.strategy-tree button { width:100%; display:flex; gap:8px; align-items:center; border-color:transparent; background:transparent; text-align:left; }.strategy-tree button.selected { color:var(--color-primary-hover); background:rgba(77,141,255,.15); }
@media (max-width:1100px) { .uid-grid { grid-template-columns:repeat(2,minmax(0,1fr)); }.team-columns { grid-template-columns:1fr; }.team-section+ .team-section { padding-left:0; border-top:1px solid var(--color-border); border-left:0; } }
@media (max-width:959px) { .shell { width:96vw; height:94vh; }.sidebar { width:210px; } }
@media (max-width:760px) { .uid-grid { grid-template-columns:1fr; }.form-grid,.role-grid { grid-template-columns:1fr; }.wide { grid-column:auto; }.topbar { padding:0 12px; }.content { padding:12px; }.strategy-field .inline-field { grid-template-columns:minmax(0,1fr); } }
</style>
