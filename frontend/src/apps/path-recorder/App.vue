<script setup lang="ts">
import { Copy, Play, RefreshCw, Search, Trash2 } from "@lucide/vue";
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, toRaw } from "vue";
import { requestHtmlMask, subscribeHtmlMask, toError } from "@/shared/bridge/html-mask";
import UiSelect from "@/shared/components/UiSelect.vue";
import FocusGuard from "@/shared/components/FocusGuard.vue";
import { copy } from "@/shared/i18n/zh-CN";
import { ACTION_GROUPS, DEFAULT_SETTINGS, MOVE_MODES, PARAMETER_ACTIONS, POINT_TYPES, actionParameterHint, changePointAction, clonePoints, combatCompletions, createPoint, duplicatePoint, reconcileRouteAuthors, renumberPoints, timeControlValue } from "@/apps/path-recorder/model";
import type { CombatSyntax, PathPoint, RecorderResult, RecorderSettings, RecorderState, RouteAuthor } from "@/apps/path-recorder/types";
import type { UiSelectOption } from "@/shared/types/ui";

// 页面文案由共享中文文案表提供。
const text = copy.pathRecorder;
// 通用操作文案由共享中文文案表提供。
const commonText = copy.common;
// 点位类型选项复用既有业务常量并使用共享选择样式。
const pointTypeOptions: UiSelectOption[] = POINT_TYPES.map((option) => ({ value: option.value, label: option.label }));
// 移动方式选项保持既有值和值顺序。
const moveModeOptions: UiSelectOption[] = MOVE_MODES.map((option) => ({ value: option.value, label: option.label }));
// 动作选项保留原分组名称供菜单显示分组标题。
const actionOptions: UiSelectOption[] = ACTION_GROUPS.flatMap((group) => group.items.map(([value, label]) => ({ value, label, group: group.label })));
// 地图匹配选项按最长中文文案确定稳定内容宽度。
const mapMatchOptions: UiSelectOption[] = [{ value: "TemplateMatch", label: "模板匹配（支持分层地图）" }, { value: "SIFT", label: "特征匹配" }];
// 当前录制阶段控制主按钮和保存资格。
const phase = ref<RecorderState["phase"]>("idle");
// 路径录制器持久化设置使用页面局部副本。
const settings = ref<RecorderSettings>(structuredClone(DEFAULT_SETTINGS));
// 当前路线作者可与作者预设默认值分别调整。
const routeAuthors = ref<RouteAuthor[]>([]);
// 当前路线地图匹配方式默认继承设置。
const routeMapMatchMethod = ref<"TemplateMatch" | "SIFT">("TemplateMatch");
// 当前路线点位由 Vue 表格统一编辑。
const points = ref<PathPoint[]>([]);
// BetterGI 正在识别坐标时禁用采样。
const sampling = ref(false);
// 路线执行期间锁定所有变更。
const running = ref(false);
// 宿主根据快捷键和 Alt 状态推送显示模式。
const displayMode = ref<RecorderState["displayMode"]>("normal");
// 保存文件名使用后端建议值初始化。
const fileName = ref("");
// 状态栏显示最近操作或恢复建议。
const statusText = ref<string>(copy.common.loading);
// 状态语义颜色区分成功、警告和错误。
const statusKind = ref<"" | "success" | "warning" | "error">("");
// 点位或路线元数据修改后需要重新保存。
const dirty = ref(false);
// 保存成功标记决定关闭时使用 done 还是 cancel。
const saved = ref(false);
// 设置弹窗占用交互并阻止点击穿透。
const settingsOpen = ref(false);
// 设置页签保持快捷键、策略、路线预设三块紧凑内容。
const settingsTab = ref<"keys" | "scripts" | "route">("keys");
// 设置自动保存定时器合并连续输入。
let settingsTimer: ReturnType<typeof setTimeout> | undefined;
// 设置保存串行链保证较慢响应不会覆盖较新快照。
let settingsSaveChain: Promise<boolean> = Promise.resolve(true);
// 设置草稿修订号随每次本地编辑递增。
let settingsRevision = 0;
// 最近成功持久化的设置修订号用于关闭前判断。
let savedSettingsRevision = 0;
// 点位同步定时器合并表格连续编辑。
let pointsTimer: ReturnType<typeof setTimeout> | undefined;
// 点位同步串行链保证宿主按页面编辑顺序接收快照。
let pointsSyncChain: Promise<void> = Promise.resolve();
// 本地点位修订号用于识别尚未同步的编辑。
let pointsRevision = 0;
// 最近成功同步到宿主的点位修订号。
let syncedPointsRevision = 0;
// 当前等待 BetterGI 捕获的快捷键字段。
const bindingField = ref<"addKey" | "finishKey" | "toggleKey" | "">("");
// 坐标弹窗支持新增和编辑两种模式。
const coordinateDialog = reactive({ open: false, index: -1, x: "", y: "", error: "" });
// 确认弹窗处理未保存退出、清空点位和同名文件覆盖。
const confirmAction = ref<"" | "close" | "clear" | "overwrite">("");
// 拖放点位源索引。
const dragIndex = ref(-1);
// 宿主提供的简易策略语法用于参数提示和键盘补全。
const combatSyntax = ref<CombatSyntax[]>([]);
// 当前显示语法补全的点位索引。
const syntaxPointIndex = ref(-1);
// 当前语法补全候选。
const syntaxItems = ref<Array<{ value: string; label: string; hint: string }>>([]);
// 当前键盘选中的补全候选索引。
const syntaxSelected = ref(0);
// 当前接收语法补全的文本框元素。
const syntaxTarget = ref<HTMLTextAreaElement | null>(null);
// 作者预设弹层是否展开。
const authorsOpen = ref(false);
// 作者预设弹层根元素用于判断外部点击。
const authorsMenuElement = ref<HTMLElement | null>(null);
// 当前展开策略预设搜索的点位索引。
const strategyExpandedIndex = ref(-1);
// 策略预设搜索文字与实际脚本参数分离。
const strategyQuery = ref("");
// 策略预设键盘选择索引。
const strategySelectedIndex = ref(0);
// 交互锁的宿主确认状态用于判断是否仍需发送请求。
const interactionLocked = ref(false);
// 最新期望状态允许焦点在宿主响应前再次变化。
let interactionLockDesired = false;
// 串行链确保较慢的旧响应不会覆盖新的焦点状态。
let interactionLockChain: Promise<void> = Promise.resolve();
// WebView 当前拥有焦点时，可编辑控件才需要阻断宿主快捷键。
const windowFocused = ref(true);
// 宿主推送卸载函数。
let unsubscribe = (): void => undefined;
// 当前是否处于录制阶段。
const recording = computed(() => phase.value === "recording");
// 当前策略查询匹配名称或脚本文本。
const filteredStrategies = computed(() => {
    const query = strategyQuery.value.trim().toLocaleLowerCase("zh-CN");
    return settings.value.combatScripts.filter((script) => !query || `${script.name}\n${script.value}`.toLocaleLowerCase("zh-CN").includes(query));
});
// 存在点位、结束录制且未运行时允许保存。
const canSave = computed(() => points.value.length > 0 && !recording.value && !running.value && !sampling.value);
// 运行和采样期间统一锁定所有会改变路线的控件。
const interactionBusy = computed(() => running.value || sampling.value);
// 主按钮文字随录制阶段切换。
const recordButtonText = computed(() => recording.value ? text.finish : text.start);
// 当前点位数量供紧凑标题展示。
const pointCountText = computed(() => `${points.value.length} 点`);

// 更新状态文字和对应语义颜色。
function setStatus(message: string, kind: typeof statusKind.value = ""): void {
    statusText.value = message;
    statusKind.value = kind;
}

// 应用后端会话视图中存在的字段。
function applyState(state: Partial<RecorderState>): void {
    if (state.phase) phase.value = state.phase;
    if (state.settings) {
        settings.value = structuredClone(state.settings);
    }
    if (Array.isArray(state.points) && pointsRevision === syncedPointsRevision) points.value = clonePoints(state.points);
    if (typeof state.sampling === "boolean") sampling.value = state.sampling;
    if (typeof state.running === "boolean") running.value = state.running;
    if (state.displayMode) {
        displayMode.value = state.displayMode;
        nextTick(() => void syncInteractionLock());
    }
    if (state.suggestedFileName) fileName.value = state.suggestedFileName;
    if (state.message) setStatus(state.message, state.running ? "" : "success");
    if (state.error) setStatus(state.error, "error");
}

// 将点位编辑标为未保存并延迟同步到后端会话。
function markPointsChanged(): void {
    points.value = renumberPoints(points.value);
    pointsRevision += 1;
    dirty.value = true;
    saved.value = false;
    setStatus("点位已修改，尚未保存");
    if (pointsTimer) clearTimeout(pointsTimer);
    pointsTimer = setTimeout(() => void syncPoints().catch(() => undefined), 180);
}

// 将当前点位快照串行同步给后端。
function syncPoints(): Promise<void> {
    if (running.value) return Promise.resolve();
    // 快照和修订号必须在入队时固定，避免后续响应错误确认新编辑。
    const snapshot = structuredClone(toRaw(points.value));
    const revision = pointsRevision;
    pointsSyncChain = pointsSyncChain.catch(() => undefined).then(async () => {
        const result = await requestHtmlMask<RecorderResult, { points: PathPoint[] }>("/points", { points: snapshot });
        if (result.status === "error") throw new Error(result.message || "同步点位失败");
        if (result.phase) phase.value = result.phase;
        syncedPointsRevision = Math.max(syncedPointsRevision, revision);
    });
    return pointsSyncChain.catch((error) => {
        setStatus(toError(error).message, "error");
        throw error;
    });
}

// 在宿主操作前取消防抖并等待最新点位同步完成。
async function flushPoints(): Promise<void> {
    if (pointsTimer) {
        clearTimeout(pointsTimer);
        pointsTimer = undefined;
    }
    if (pointsRevision > syncedPointsRevision) await syncPoints();
    else await pointsSyncChain;
}

// 续录现有点位或结束当前录制阶段。
async function toggleRecording(): Promise<void> {
    if (interactionBusy.value) return;
    try {
        if (recording.value) {
            await flushPoints();
            applyState(await requestHtmlMask<RecorderState>("/finish", {}));
            dirty.value = points.value.length > 0;
            setStatus("录制已结束，请检查点位后保存", "success");
        } else {
            await flushPoints();
            applyState(await requestHtmlMask<RecorderState>("/start", {}));
            dirty.value = true;
            saved.value = false;
            setStatus("录制中，可通过快捷键或按钮添加点位");
        }
    } catch (error) {
        setStatus(toError(error).message, "error");
    }
}

// 请求 BetterGI 识别当前位置并追加点位。
async function samplePoint(): Promise<void> {
    if (sampling.value || running.value) return;
    try {
        await flushPoints();
        const result = await requestHtmlMask<RecorderResult>("/sample", {});
        if (result.status === "error") throw new Error(result.message || "添加点位失败");
        setStatus("正在识别当前位置...");
    } catch (error) {
        setStatus(toError(error).message, "error");
    }
}

// 重新识别指定点位的游戏坐标。
async function resamplePoint(index: number): Promise<void> {
    if (interactionBusy.value) return;
    try {
        await flushPoints();
        const result = await requestHtmlMask<RecorderResult, { index: number }>("/resample", { index });
        if (result.status === "error") throw new Error(result.message || "重新录制失败");
        if (result.points) points.value = clonePoints(result.points);
        dirty.value = true;
        saved.value = false;
        setStatus(`已更新点位 #${index + 1}`, "success");
    } catch (error) {
        setStatus(toError(error).message, "error");
    }
}

// 打开新增或编辑坐标弹窗。
function openCoordinate(index = -1): void {
    if (interactionBusy.value) return;
    const point = index >= 0 ? points.value[index] : null;
    coordinateDialog.open = true;
    coordinateDialog.index = index;
    coordinateDialog.x = point ? String(point.x) : "";
    coordinateDialog.y = point ? String(point.y) : "";
    coordinateDialog.error = "";
    nextTick(() => void syncInteractionLock());
}

// 校验坐标并更新现有点位或追加新点位。
function applyCoordinate(): void {
    const x = Number(coordinateDialog.x);
    const y = Number(coordinateDialog.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
        coordinateDialog.error = "X 和 Y 必须是有限数字";
        return;
    }
    if (coordinateDialog.index >= 0) {
        points.value[coordinateDialog.index].x = x;
        points.value[coordinateDialog.index].y = y;
    } else {
        points.value.push(createPoint(x, y, points.value.length));
    }
    coordinateDialog.open = false;
    markPointsChanged();
    void syncInteractionLock();
}

// 关闭坐标弹窗并按其他交互面状态释放宿主锁。
function closeCoordinate(): void {
    coordinateDialog.open = false;
    void syncInteractionLock();
}

// 删除指定点位并重新编号。
function deletePoint(index: number): void {
    if (interactionBusy.value) return;
    points.value.splice(index, 1);
    markPointsChanged();
}

// 复制指定点位并立即同步新的编号。
function copyPoint(index: number): void {
    if (interactionBusy.value) return;
    points.value = duplicatePoint(points.value, index);
    markPointsChanged();
}

// 切换点位动作并重置不兼容参数。
function updatePointAction(index: number, action: string): void {
    if (interactionBusy.value || !points.value[index]) return;
    points.value[index] = changePointAction(points.value[index], action, settings.value);
    if (strategyExpandedIndex.value === index) closeStrategyPicker();
    markPointsChanged();
}

// 判断当前动作是否需要显示参数输入。
function actionSupportsParams(action: string): boolean {
    return PARAMETER_ACTIONS.has(action);
}

// 将原生时间控件的合法分钟值写回当前点位动作参数。
function updatePointTime(index: number, event: Event): void {
    const point = points.value[index];
    if (!point) return;
    point.action_params = (event.target as HTMLInputElement).value;
    markPointsChanged();
}

// 展开指定点位的策略搜索并聚焦输入框。
function openStrategyPicker(index: number): void {
    if (interactionBusy.value) return;
    if (strategyExpandedIndex.value === index) {
        closeStrategyPicker();
        return;
    }
    strategyExpandedIndex.value = index;
    strategyQuery.value = "";
    strategySelectedIndex.value = 0;
    nextTick(() => document.querySelector<HTMLInputElement>(`[data-strategy-search="${index}"]`)?.focus());
}

// 关闭策略搜索并清空临时查询。
function closeStrategyPicker(): void {
    strategyExpandedIndex.value = -1;
    strategyQuery.value = "";
    strategySelectedIndex.value = 0;
}

// 焦点离开当前策略选择区域后关闭自动联想菜单。
function handleStrategyFocusOut(event: FocusEvent): void {
    const nextElement = event.relatedTarget as Element | null;
    if (nextElement) {
        if (!nextElement.closest("[data-strategy-picker]")) closeStrategyPicker();
        return;
    }
    nextTick(() => {
        const activeElement = document.activeElement as Element | null;
        if (!activeElement?.closest("[data-strategy-picker]")) closeStrategyPicker();
    });
}

// 将选中策略预设写入指定点位动作参数。
function applyStrategyPreset(index: number, presetIndex = strategySelectedIndex.value): void {
    const script = filteredStrategies.value[presetIndex];
    if (!script || !points.value[index]) return;
    points.value[index].action_params = script.value;
    markPointsChanged();
    closeStrategyPicker();
}

// 处理策略搜索弹层的方向键、确认和关闭。
function handleStrategyKeydown(event: KeyboardEvent, index: number): void {
    if (event.key === "Escape") {
        event.preventDefault();
        closeStrategyPicker();
        return;
    }
    if (!filteredStrategies.value.length) return;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        const offset = event.key === "ArrowDown" ? 1 : -1;
        strategySelectedIndex.value = (strategySelectedIndex.value + offset + filteredStrategies.value.length) % filteredStrategies.value.length;
    } else if (event.key === "Enter") {
        event.preventDefault();
        applyStrategyPreset(index);
    }
}

// 根据光标位置刷新简易策略补全候选。
function refreshSyntax(index: number, target: HTMLTextAreaElement): void {
    syntaxPointIndex.value = index;
    syntaxTarget.value = target;
    syntaxItems.value = combatCompletions(target.value, target.selectionStart ?? target.value.length, combatSyntax.value);
    syntaxSelected.value = 0;
}

// 将选中补全替换到当前方法名或参数片段。
function applySyntaxCompletion(index = syntaxSelected.value): void {
    const target = syntaxTarget.value;
    const point = points.value[syntaxPointIndex.value];
    const item = syntaxItems.value[index];
    if (!target || !point || !item) return;
    const cursor = target.selectionStart ?? target.value.length;
    const before = target.value.slice(0, cursor);
    const parameterMatch = before.match(/([\w\u4e00-\u9fff]+)\(([^,()]*)$/);
    const tokenMatch = before.match(/[\w\u4e00-\u9fff]+$/);
    const start = parameterMatch ? cursor - parameterMatch[2].length : cursor - (tokenMatch?.[0].length ?? 0);
    point.action_params = `${target.value.slice(0, start)}${item.value}${target.value.slice(cursor)}`;
    markPointsChanged();
    syntaxItems.value = [];
    syntaxPointIndex.value = -1;
    nextTick(() => {
        const nextCursor = start + item.value.length;
        target.focus();
        target.setSelectionRange(nextCursor, nextCursor);
    });
}

// 处理简易策略补全菜单的方向键、确认和关闭。
function handleSyntaxKeydown(event: KeyboardEvent, index: number): void {
    const target = event.target as HTMLTextAreaElement;
    if (!syntaxItems.value.length || syntaxPointIndex.value !== index) {
        if (event.ctrlKey && event.code === "Space") {
            event.preventDefault();
            refreshSyntax(index, target);
        }
        return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        const offset = event.key === "ArrowDown" ? 1 : -1;
        syntaxSelected.value = (syntaxSelected.value + offset + syntaxItems.value.length) % syntaxItems.value.length;
    } else if (event.key === "Enter" || event.key === "Tab") {
        event.preventDefault();
        applySyntaxCompletion();
    } else if (event.key === "Escape") {
        event.preventDefault();
        syntaxItems.value = [];
    }
}

// 记录拖动点位的源索引。
function startDrag(index: number, event: DragEvent): void {
    if (interactionBusy.value) {
        event.preventDefault();
        return;
    }
    dragIndex.value = index;
    event.dataTransfer?.setData("text/plain", String(index));
}

// 将拖动点位插入目标行前后。
function dropPoint(targetIndex: number, event: DragEvent): void {
    event.preventDefault();
    if (dragIndex.value < 0 || interactionBusy.value) return;
    const row = event.currentTarget as HTMLElement;
    const after = event.clientY > row.getBoundingClientRect().top + row.offsetHeight / 2;
    const [point] = points.value.splice(dragIndex.value, 1);
    let insertion = targetIndex + (after ? 1 : 0);
    if (dragIndex.value < insertion) insertion -= 1;
    points.value.splice(insertion, 0, point);
    dragIndex.value = -1;
    markPointsChanged();
}

// 从指定点位构建临时路线并交给 BetterGI 执行。
async function runFromPoint(index: number): Promise<void> {
    if (interactionBusy.value) return;
    try {
        await flushPoints();
        const result = await requestHtmlMask<RecorderResult>("/runFromPoint", {
            points: points.value, index, authors: routeAuthors.value, mapMatchMethod: routeMapMatchMethod.value,
        });
        if (result.status === "error") throw new Error(result.message || "运行路线失败");
        running.value = true;
        displayMode.value = result.displayMode ?? "compact";
        setStatus("路线执行中，已锁定侧边穿透模式");
    } catch (error) {
        setStatus(toError(error).message, "error");
    }
}

// 保存路径文件和当前路线元数据，并按确认结果显式允许覆盖。
async function saveRoute(overwrite = false): Promise<void> {
    if (!canSave.value) return;
    try {
        await flushPoints();
        const result = await requestHtmlMask<RecorderResult>("/save", {
            points: points.value, fileName: fileName.value,
            authors: routeAuthors.value, mapMatchMethod: routeMapMatchMethod.value, overwrite,
        });
        if (result.status === "error") throw new Error(result.message || "保存失败");
        if (result.status === "confirm_overwrite") {
            confirmAction.value = "overwrite";
            await nextTick();
            await syncInteractionLock();
            return;
        }
        if (result.fileName) fileName.value = result.fileName;
        phase.value = "saved";
        saved.value = true;
        dirty.value = false;
        setStatus(`已保存：${result.path ?? result.fileName ?? ""}`, "success");
        await requestHtmlMask<RecorderResult>("/done", {});
    } catch (error) {
        setStatus(toError(error).message, "error");
    }
}

// 清空全部点位并同步空会话。
async function clearPoints(): Promise<void> {
    points.value = [];
    dirty.value = true;
    saved.value = false;
    await syncPoints();
    setStatus("点位已清空，尚未保存");
}

// 有点位时通过确认弹窗保护清空操作。
function requestClearPoints(): void {
    if (points.value.length && !interactionBusy.value) {
        confirmAction.value = "clear";
        nextTick(() => void syncInteractionLock());
    }
}

// 打开设置并锁定侧边模式的点击穿透。
async function openSettings(): Promise<void> {
    if (interactionBusy.value) return;
    settingsOpen.value = true;
    await setInteractionLock(true);
}

// 标记设置草稿已变更并按需排队自动保存。
function markSettingsChanged(queue = true): void {
    settingsRevision += 1;
    if (queue) queueSettingsSave();
}

// 延迟保存完整设置，合并连续输入。
function queueSettingsSave(): void {
    if (settingsTimer) clearTimeout(settingsTimer);
    settingsTimer = setTimeout(() => {
        settingsTimer = undefined;
        void saveSettings();
    }, 300);
}

// 删除设置中完全空白的本地草稿并返回是否发生变化。
function discardBlankSettingsDrafts(): boolean {
    const authorCount = settings.value.authors.length;
    const scriptCount = settings.value.combatScripts.length;
    settings.value.authors = settings.value.authors.filter((author) => author.name.trim() || author.links.trim());
    settings.value.combatScripts = settings.value.combatScripts.filter((script) => script.name.trim() || script.value.trim());
    return authorCount !== settings.value.authors.length || scriptCount !== settings.value.combatScripts.length;
}

// 校验部分填写的作者和策略草稿，避免宿主静默丢弃内容。
function settingsDraftIsValid(value: RecorderSettings): boolean {
    return value.authors.every((author) => !author.links.trim() || Boolean(author.name.trim()))
        && value.combatScripts.every((script) => Boolean(script.name.trim()) === Boolean(script.value.trim()));
}

// 判断设置中是否仍有只保存在页面内的完全空白草稿。
function hasBlankSettingsDraft(value: RecorderSettings): boolean {
    return value.authors.some((author) => !author.name.trim() && !author.links.trim())
        || value.combatScripts.some((script) => !script.name.trim() && !script.value.trim());
}

// 从响应式表单显式构造仅含宿主协议字段的设置快照。
function createSettingsSnapshot(): RecorderSettings {
    return {
        addKey: settings.value.addKey,
        finishKey: settings.value.finishKey,
        toggleKey: settings.value.toggleKey,
        authors: settings.value.authors.map((author) => ({ name: author.name, links: author.links, def: author.def === true })),
        mapMatchMethod: settings.value.mapMatchMethod,
        combatScripts: settings.value.combatScripts.map((script) => ({ name: script.name, value: script.value, def: script.def === true })),
    };
}

// 将设置快照串行写入 BetterGI，并仅让最新修订响应回写页面。
function saveSettings(): Promise<boolean> {
    // 快照必须在入队时固定，避免后续表单编辑污染当前请求。
    const snapshot = createSettingsSnapshot();
    const revision = settingsRevision;
    if (!settingsDraftIsValid(snapshot)) {
        setStatus(text.incompletePreset, "error");
        return Promise.resolve(false);
    }
    if (hasBlankSettingsDraft(snapshot)) return Promise.resolve(true);
    settingsSaveChain = settingsSaveChain.catch(() => false).then(async () => {
        try {
            const result = await requestHtmlMask<RecorderResult, RecorderSettings>("/settings", snapshot);
            if (result.status === "error") throw new Error(result.message || "设置保存失败");
            const normalized = structuredClone(result.settings ?? snapshot);
            if (revision === settingsRevision) {
                const previousAuthors = JSON.stringify(routeAuthors.value);
                const previousMapMatch = routeMapMatchMethod.value;
                settings.value = normalized;
                routeAuthors.value = reconcileRouteAuthors(routeAuthors.value, normalized);
                routeMapMatchMethod.value = normalized.mapMatchMethod;
                savedSettingsRevision = revision;
                if (points.value.length && (previousAuthors !== JSON.stringify(routeAuthors.value) || previousMapMatch !== routeMapMatchMethod.value)) {
                    dirty.value = true;
                    saved.value = false;
                }
                setStatus("设置已自动保存", "success");
            }
            return true;
        } catch (error) {
            setStatus(toError(error).message, "error");
            return false;
        }
    });
    return settingsSaveChain;
}

// 保存设置并解除侧边模式交互锁。
async function closeSettings(): Promise<void> {
    // 关闭前必须等待最后一次防抖保存或已经排队的保存。
    if (discardBlankSettingsDrafts()) markSettingsChanged(false);
    if (!settingsDraftIsValid(settings.value)) {
        setStatus(text.incompletePreset, "error");
        return;
    }
    let savedSuccessfully: boolean;
    if (settingsTimer) {
        clearTimeout(settingsTimer);
        settingsTimer = undefined;
        savedSuccessfully = await saveSettings();
    } else if (savedSettingsRevision !== settingsRevision) {
        savedSuccessfully = await saveSettings();
    } else {
        savedSuccessfully = await settingsSaveChain;
    }
    // 等待期间若又产生新修订，继续保存最新快照后再允许关闭。
    while (savedSuccessfully && savedSettingsRevision !== settingsRevision) {
        if (settingsTimer) {
            clearTimeout(settingsTimer);
            settingsTimer = undefined;
        }
        if (discardBlankSettingsDrafts()) markSettingsChanged(false);
        if (!settingsDraftIsValid(settings.value)) {
            setStatus(text.incompletePreset, "error");
            return;
        }
        savedSuccessfully = await saveSettings();
    }
    if (!savedSuccessfully) return;
    settingsOpen.value = false;
    bindingField.value = "";
    try {
        await requestHtmlMask<RecorderResult>("/binding", { active: false });
    } catch { /* 关闭时宿主可能已结束，无需覆盖保存结果。 */ }
    await syncInteractionLock();
}

// 让 BetterGI 捕获下一次键盘输入。
async function beginBinding(field: "addKey" | "finishKey" | "toggleKey"): Promise<void> {
    bindingField.value = field;
    try {
        const result = await requestHtmlMask<RecorderResult>("/binding", { active: true });
        if (result.status === "error") throw new Error(result.message || "无法开始按键绑定");
        setStatus("请按下新的快捷键");
    } catch (error) {
        bindingField.value = "";
        setStatus(toError(error).message, "error");
    }
}

// 新增空作者预设并保持数组响应式。
function addAuthorPreset(): void {
    settings.value.authors.push({ name: "", links: "", def: false });
    markSettingsChanged(false);
}

// 新增空简易策略预设。
function addScriptPreset(): void {
    settings.value.combatScripts.push({ name: "", value: "", def: false });
    markSettingsChanged(false);
}

// 删除作者预设并在保存成功后清理路线失效作者。
function removeAuthorPreset(index: number): void {
    settings.value.authors.splice(index, 1);
    markSettingsChanged();
}

// 删除策略预设并保持默认策略唯一。
function removeScriptPreset(index: number): void {
    settings.value.combatScripts.splice(index, 1);
    markSettingsChanged();
}

// 将指定简易策略设为唯一默认项。
function setDefaultScript(index: number): void {
    settings.value.combatScripts.forEach((script, scriptIndex) => { script.def = scriptIndex === index; });
    markSettingsChanged();
}

// 切换当前路线是否使用指定作者。
function toggleRouteAuthor(author: RouteAuthor, checked: boolean): void {
    if (interactionBusy.value) return;
    const key = `${author.name}\n${author.links}`;
    routeAuthors.value = checked
        ? [...routeAuthors.value.filter((item) => `${item.name}\n${item.links}` !== key), { name: author.name, links: author.links }]
        : routeAuthors.value.filter((item) => `${item.name}\n${item.links}` !== key);
    dirty.value = true;
    saved.value = false;
}

// 判断路线是否已包含指定作者。
function hasRouteAuthor(author: RouteAuthor): boolean {
    return routeAuthors.value.some((item) => item.name === author.name && item.links === author.links);
}

// 切换作者弹层并关闭同页策略弹层。
function toggleAuthorsMenu(): void {
    if (interactionBusy.value) return;
    authorsOpen.value = !authorsOpen.value;
    if (authorsOpen.value) closeStrategyPicker();
}

// 外部点击关闭作者和策略弹层，但不干扰对应触发器。
function handleDocumentPointerDown(event: PointerEvent): void {
    const target = event.target as Node | null;
    if (authorsOpen.value && target && !authorsMenuElement.value?.contains(target)) authorsOpen.value = false;
    if (strategyExpandedIndex.value >= 0 && target && !(target as Element).closest?.("[data-strategy-picker]")) closeStrategyPicker();
}

// Escape 优先关闭页面内临时弹层。
function handleDocumentKeydown(event: KeyboardEvent): void {
    if (event.key !== "Escape") return;
    if (authorsOpen.value) {
        authorsOpen.value = false;
        return;
    }
    if (strategyExpandedIndex.value >= 0) closeStrategyPicker();
}

// 关闭请求根据保存状态选择 done 或 cancel 协议。
async function requestClose(force = false): Promise<void> {
    if (interactionBusy.value) return;
    if (!force && dirty.value && !saved.value) {
        confirmAction.value = "close";
        nextTick(() => void syncInteractionLock());
        return;
    }
    try {
        await requestHtmlMask<RecorderResult>(saved.value ? "/done" : "/cancel", {});
    } catch (error) {
        setStatus(toError(error).message, "error");
    }
}

// 执行确认弹窗当前绑定的清空、关闭或覆盖动作。
async function acceptConfirmation(): Promise<void> {
    const action = confirmAction.value;
    confirmAction.value = "";
    if (action === "clear") await clearPoints();
    if (action === "close") await requestClose(true);
    if (action === "overwrite") await saveRoute(true);
    await syncInteractionLock();
}

// 取消确认操作并按剩余弹窗状态释放交互锁。
function cancelConfirmation(): void {
    confirmAction.value = "";
    void syncInteractionLock();
}

// 串行收敛宿主点击穿透交互锁到最新焦点期望状态。
function setInteractionLock(active: boolean): Promise<void> {
    interactionLockDesired = active;
    interactionLockChain = interactionLockChain.catch(() => undefined).then(async () => {
        while (interactionLocked.value !== interactionLockDesired) {
            const requestedState = interactionLockDesired;
            try {
                const result = await requestHtmlMask<RecorderResult>("/interactionLock", { active: requestedState });
                if (result.status === "error") throw new Error(result.message || "交互锁切换失败");
                interactionLocked.value = requestedState;
            } catch {
                // 宿主关闭或通信失败时停止本轮收敛，后续交互会重新触发同步。
                return;
            }
        }
    });
    return interactionLockChain;
}

// 判断元素是否会接收文字、数字或选择类键盘输入。
function isEditableElement(element: Element | null): boolean {
    if (!element) return false;
    return Boolean(element.closest('input,textarea,select,[role="combobox"],[contenteditable]:not([contenteditable="false"])'));
}

// 根据可编辑控件、紧凑编辑区和全部弹窗统一协调交互锁。
async function syncInteractionLock(): Promise<void> {
    const activeElement = document.activeElement as HTMLElement | null;
    const editableFocused = windowFocused.value && isEditableElement(activeElement);
    const compactFocused = windowFocused.value && displayMode.value === "compact-edit" && Boolean(activeElement?.closest("[data-interactive-surface]"));
    await setInteractionLock(settingsOpen.value || coordinateDialog.open || Boolean(confirmAction.value) || editableFocused || compactFocused);
}

// 聚焦任一交互面时立即保持点击交互。
function handleInteractionFocus(): void {
    void setInteractionLock(true);
}

// 焦点切换完成后仅在所有交互面都失焦时释放锁。
function handleInteractionBlur(): void {
    nextTick(() => void syncInteractionLock());
}

// 页面内焦点进入可编辑控件时立即暂停全部宿主快捷键。
function handleDocumentFocusIn(event: FocusEvent): void {
    windowFocused.value = true;
    if (isEditableElement(event.target as Element | null)) void setInteractionLock(true);
    else void syncInteractionLock();
}

// 页面内焦点切换完成后根据新焦点决定是否恢复宿主快捷键。
function handleDocumentFocusOut(): void {
    nextTick(() => void syncInteractionLock());
}

// WebView 失焦时关闭临时联想并释放仅由输入焦点产生的锁。
function handleWindowBlur(): void {
    windowFocused.value = false;
    closeStrategyPicker();
    void syncInteractionLock();
}

// WebView 重新获得焦点时按当前活动控件恢复交互锁。
function handleWindowFocus(): void {
    windowFocused.value = true;
    void syncInteractionLock();
}

// 初始化会话并订阅点位、按键和显示模式推送。
async function initialize(): Promise<void> {
    document.addEventListener("pointerdown", handleDocumentPointerDown);
    document.addEventListener("keydown", handleDocumentKeydown);
    document.addEventListener("focusin", handleDocumentFocusIn);
    document.addEventListener("focusout", handleDocumentFocusOut);
    window.addEventListener("blur", handleWindowBlur);
    window.addEventListener("focus", handleWindowFocus);
    unsubscribe = subscribeHtmlMask((message) => {
        if (message.url === "/bindingKey") {
            const keyCode = String((message.data as { keyCode?: string } | undefined)?.keyCode ?? "").trim();
            if (bindingField.value && keyCode) {
                settings.value[bindingField.value] = keyCode;
                bindingField.value = "";
                markSettingsChanged();
                void requestHtmlMask<RecorderResult>("/binding", { active: false });
            }
            return;
        }
        if (message.url === "/displayMode") {
            displayMode.value = (message.data as { mode?: RecorderState["displayMode"] } | undefined)?.mode ?? "normal";
            nextTick(() => void syncInteractionLock());
            return;
        }
        if (message.url === "/state") applyState(message.data as Partial<RecorderState>);
    });
    try {
        const result = await requestHtmlMask<RecorderState>("/init", {});
        applyState(result);
        routeAuthors.value = structuredClone(result.routeAuthors ?? []);
        routeMapMatchMethod.value = result.routeMapMatchMethod ?? result.settings.mapMatchMethod;
        combatSyntax.value = structuredClone(result.combatSyntax ?? []);
        setStatus(result.warning || copy.common.ready, result.warning ? "warning" : "success");
    } catch (error) {
        setStatus(toError(error).message, "error");
    }
}

// 卸载录制器时清理宿主订阅和所有延迟任务。
function cleanupRecorder(): void {
    unsubscribe();
    document.removeEventListener("pointerdown", handleDocumentPointerDown);
    document.removeEventListener("keydown", handleDocumentKeydown);
    document.removeEventListener("focusin", handleDocumentFocusIn);
    document.removeEventListener("focusout", handleDocumentFocusOut);
    window.removeEventListener("blur", handleWindowBlur);
    window.removeEventListener("focus", handleWindowFocus);
    if (settingsTimer) clearTimeout(settingsTimer);
    if (pointsTimer) clearTimeout(pointsTimer);
}

onMounted(initialize);
onBeforeUnmount(cleanupRecorder);
</script>

<template>
    <section v-if="displayMode === 'compact'" class="compact">
        <header><div><h1>{{ text.title }}</h1><span>{{ phase }}</span></div><strong>{{ pointCountText }}</strong></header>
        <div class="compact-shortcuts"><span>{{ settings.addKey }} {{ text.sample }}</span><span>{{ settings.finishKey }} {{ text.finishKey }}</span><span>{{ settings.toggleKey }} 切换</span><span>Alt 编辑</span></div>
        <div class="compact-list">
            <article v-for="(point,index) in points" :key="point.id">
                <strong>#{{ index + 1 }}</strong><span>{{ Math.round(point.x) }}, {{ Math.round(point.y) }}</span>
                <span>{{ POINT_TYPES.find((option) => option.value === point.type)?.label }}</span>
            </article>
            <div v-if="!points.length" class="empty">{{ text.noPoints }}</div>
        </div>
    </section>

    <div v-else class="app workspace-frame" :class="{ 'compact-edit': displayMode === 'compact-edit' }" :data-interactive-surface="displayMode === 'compact-edit' ? '' : undefined" @focusin="displayMode === 'compact-edit' && handleInteractionFocus()" @focusout="displayMode === 'compact-edit' && handleInteractionBlur()">
        <header class="topbar"><h1>{{ text.title }}</h1><span class="phase">{{ phase }}</span><div class="top-spacer"></div><button :disabled="interactionBusy" @click="requestClose()">{{ commonText.close }}</button></header>
        <section class="toolbar">
            <button :disabled="interactionBusy" @click="openSettings">{{ text.settings }}</button>
            <div ref="authorsMenuElement" class="authors-picker">
                <button type="button" :disabled="interactionBusy" :aria-expanded="authorsOpen" aria-haspopup="listbox" @click="toggleAuthorsMenu">{{ text.author }}：{{ routeAuthors.map((item) => item.name).join('、') || '未选择' }}</button>
                <div v-if="authorsOpen" class="authors-popover" role="listbox" :aria-label="text.author">
                    <label v-for="author in settings.authors" :key="`${author.name}-${author.links}`"><input type="checkbox" :disabled="interactionBusy" :checked="hasRouteAuthor(author)" @change="toggleRouteAuthor(author, ($event.target as HTMLInputElement).checked)">{{ author.name || '未命名' }}</label>
                    <span v-if="!settings.authors.length">{{ commonText.empty }}</span>
                </div>
            </div>
            <label class="file-field">{{ text.fileName }}<input v-model.trim="fileName" class="control" :disabled="interactionBusy" @input="dirty = true; saved = false"></label>
            <div class="toolbar-actions"><button class="danger" :disabled="!points.length || interactionBusy" @click="requestClearPoints">{{ text.clear }}</button><button class="primary" :disabled="interactionBusy" @click="toggleRecording">{{ recordButtonText }}</button><button :disabled="interactionBusy" @click="samplePoint">{{ text.sample }}</button><button :disabled="interactionBusy" @click="openCoordinate()">{{ text.coordinate }}</button></div>
        </section>
        <main class="content">
            <div class="point-table">
                <div class="point-row point-header"><span></span><span></span><span>#</span><span>坐标</span><span>{{ text.pointType }}</span><span>{{ text.moveMode }}</span><span>{{ text.action }}</span><span>{{ text.actionParams }}</span><span>操作</span></div>
                <div v-for="(point,index) in points" :key="point.id" class="point-row" :draggable="!interactionBusy" @dragstart="startDrag(index,$event)" @dragover.prevent @drop="dropPoint(index,$event)">
                    <span class="drag">⋮⋮</span>
                    <button class="icon-button run-point" type="button" :title="text.run" :aria-label="`${text.run} #${index + 1}`" :disabled="interactionBusy" @click="runFromPoint(index)"><Play :size="16" /></button>
                    <strong>{{ index + 1 }}</strong><button class="coordinate" :disabled="interactionBusy" @click="openCoordinate(index)">{{ point.x.toFixed(4) }}, {{ point.y.toFixed(4) }}</button>
                    <UiSelect v-model="point.type" :options="pointTypeOptions" :aria-label="`点位类型 #${index + 1}`" :disabled="interactionBusy" width="table" @change="markPointsChanged" />
                    <UiSelect v-model="point.move_mode" :options="moveModeOptions" :aria-label="`移动方式 #${index + 1}`" :disabled="interactionBusy" width="table" @change="markPointsChanged" />
                    <UiSelect :model-value="point.action" :options="actionOptions" :aria-label="`动作 #${index + 1}`" :disabled="interactionBusy" width="table" @change="updatePointAction(index, $event)" />
                    <div class="param-cell" :class="{ 'combat-param': point.action === 'combat_script' }">
                        <template v-if="point.action === 'combat_script'">
                            <div class="strategy-picker" :class="{ expanded: strategyExpandedIndex === index }" data-strategy-picker @focusout="handleStrategyFocusOut($event)">
                                <button v-if="strategyExpandedIndex !== index" class="icon-button strategy-trigger" type="button" :title="text.searchScript" :aria-label="text.searchScript" :disabled="interactionBusy || !settings.combatScripts.length" @click="openStrategyPicker(index)"><Search :size="16" /></button>
                                <input v-else v-model="strategyQuery" class="control strategy-search" :data-strategy-search="index" :placeholder="text.searchScript" @input="strategySelectedIndex = 0" @keydown="handleStrategyKeydown($event,index)">
                                <div v-if="strategyExpandedIndex === index" class="strategy-menu" role="listbox" :aria-label="text.searchScript">
                                    <button v-for="(script,scriptIndex) in filteredStrategies" :key="`${script.name}-${scriptIndex}`" type="button" :class="{ active: strategySelectedIndex === scriptIndex }" @mousedown.prevent="applyStrategyPreset(index,scriptIndex)"><strong>{{ script.name }}</strong><small>{{ script.value }}</small></button>
                                    <span v-if="!filteredStrategies.length">{{ commonText.empty }}</span>
                                </div>
                            </div>
                            <textarea v-model="point.action_params" class="control action-params" :disabled="interactionBusy" :placeholder="actionParameterHint(point.action)" rows="1" @input="markPointsChanged(); refreshSyntax(index, $event.target as HTMLTextAreaElement)" @focus="refreshSyntax(index, $event.target as HTMLTextAreaElement)" @keydown="handleSyntaxKeydown($event,index)"></textarea>
                        </template>
                        <input v-else-if="point.action === 'set_time'" type="time" step="60" :value="timeControlValue(point.action_params)" class="control action-params" :disabled="interactionBusy" :aria-label="`${text.actionParams} #${index + 1}`" @input="updatePointTime(index, $event)">
                        <input v-else-if="actionSupportsParams(point.action)" v-model="point.action_params" class="control action-params" :disabled="interactionBusy" :placeholder="actionParameterHint(point.action)" @input="markPointsChanged">
                        <span v-else class="no-params">—</span>
                        <div v-if="syntaxPointIndex === index && syntaxItems.length" class="syntax-menu"><button v-for="(item,itemIndex) in syntaxItems" :key="`${item.label}-${item.value}`" type="button" :class="{ active: syntaxSelected === itemIndex }" @mousedown.prevent="applySyntaxCompletion(itemIndex)"><strong>{{ item.label }}</strong><small>{{ item.hint }}</small></button></div>
                    </div>
                    <div class="row-actions"><button class="icon-button" type="button" :title="text.duplicate" :aria-label="`${text.duplicate} #${index + 1}`" :disabled="interactionBusy" @click="copyPoint(index)"><Copy :size="16" /></button><button class="icon-button" type="button" :title="text.resample" :aria-label="`${text.resample} #${index + 1}`" :disabled="interactionBusy" @click="resamplePoint(index)"><RefreshCw :size="16" /></button><button class="icon-button danger" type="button" :title="commonText.delete" :aria-label="`${commonText.delete} #${index + 1}`" :disabled="interactionBusy" @click="deletePoint(index)"><Trash2 :size="16" /></button></div>
                </div>
                <div v-if="!points.length" class="empty">{{ text.noPoints }}</div>
            </div>
        </main>
        <footer class="footer"><div :class="`status-${statusKind}`" role="status">{{ statusText }}</div><button class="primary" :disabled="!canSave" @click="saveRoute()">{{ text.save }}</button></footer>
    </div>

    <div v-if="settingsOpen" class="modal-backdrop" data-interactive-surface role="dialog" aria-modal="true" :aria-label="text.settings" @focusin="handleInteractionFocus" @focusout="handleInteractionBlur">
        <div class="settings-modal">
            <header><div><h2>{{ text.settings }}</h2><span>{{ text.autoSaved }}</span></div><button class="primary" @click="closeSettings">{{ commonText.close }}</button></header>
            <p v-if="statusKind === 'error'" class="settings-error" role="alert">{{ statusText }}</p>
            <nav><button :class="{ active: settingsTab === 'keys' }" @click="settingsTab='keys'">{{ text.shortcuts }}</button><button :class="{ active: settingsTab === 'scripts' }" @click="settingsTab='scripts'">{{ text.scripts }}</button><button :class="{ active: settingsTab === 'route' }" @click="settingsTab='route'">{{ text.routePreset }}</button></nav>
            <section v-if="settingsTab === 'keys'" class="settings-content key-grid"><label>{{ text.addKey }}<button :class="{ binding: bindingField === 'addKey' }" @click="beginBinding('addKey')">{{ bindingField === 'addKey' ? '请按键...' : settings.addKey }}</button></label><label>{{ text.finishKey }}<button :class="{ binding: bindingField === 'finishKey' }" @click="beginBinding('finishKey')">{{ bindingField === 'finishKey' ? '请按键...' : settings.finishKey }}</button></label><label>{{ text.toggleKey }}<button :class="{ binding: bindingField === 'toggleKey' }" @click="beginBinding('toggleKey')">{{ bindingField === 'toggleKey' ? '请按键...' : settings.toggleKey }}</button></label></section>
            <section v-else-if="settingsTab === 'scripts'" class="settings-content"><article v-for="(script,index) in settings.combatScripts" :key="index" class="preset-card"><label>名称<input v-model="script.name" class="control" @input="markSettingsChanged()"></label><label class="wide">策略<textarea v-model="script.value" class="control" @input="markSettingsChanged()"></textarea></label><label class="check"><input type="radio" name="default-script" :checked="script.def" @change="setDefaultScript(index)">默认</label><button class="danger" @click="removeScriptPreset(index)">{{ commonText.delete }}</button></article><button @click="addScriptPreset">{{ text.addScript }}</button></section>
            <section v-else class="settings-content route-settings"><label>{{ text.mapMatch }}<UiSelect v-model="settings.mapMatchMethod" :options="mapMatchOptions" :aria-label="text.mapMatch" width="content" :max-width="260" :menu-max-width="300" @change="markSettingsChanged()" /></label><article v-for="(author,index) in settings.authors" :key="index" class="preset-card"><label>姓名<input v-model="author.name" class="control" @input="markSettingsChanged()"></label><label>链接<input v-model="author.links" class="control" @input="markSettingsChanged()"></label><label class="check"><input v-model="author.def" type="checkbox" @change="markSettingsChanged()">默认</label><button class="danger" @click="removeAuthorPreset(index)">{{ commonText.delete }}</button></article><button @click="addAuthorPreset">{{ text.addAuthor }}</button></section>
        </div>
    </div>

    <div v-if="coordinateDialog.open" class="modal-backdrop" data-interactive-surface role="dialog" aria-modal="true" aria-label="编辑坐标" @focusin="handleInteractionFocus" @focusout="handleInteractionBlur">
        <div class="small-modal"><h2>{{ coordinateDialog.index >= 0 ? '编辑坐标' : text.coordinate }}</h2><div class="coordinate-fields"><label>{{ text.coordinateX }}<input v-model="coordinateDialog.x" class="control" type="number" step="0.0001"></label><label>{{ text.coordinateY }}<input v-model="coordinateDialog.y" class="control" type="number" step="0.0001"></label></div><p class="status-error">{{ coordinateDialog.error }}</p><footer><button @click="closeCoordinate">{{ commonText.cancel }}</button><button class="primary" @click="applyCoordinate">{{ commonText.confirm }}</button></footer></div>
    </div>

    <div v-if="confirmAction" class="modal-backdrop" data-interactive-surface role="dialog" aria-modal="true" :aria-label="confirmAction === 'clear' ? text.clearTitle : confirmAction === 'overwrite' ? text.overwriteTitle : text.discardTitle" @focusin="handleInteractionFocus" @focusout="handleInteractionBlur">
        <div class="small-modal"><h2>{{ confirmAction === 'clear' ? text.clearTitle : confirmAction === 'overwrite' ? text.overwriteTitle : text.discardTitle }}</h2><p>{{ confirmAction === 'clear' ? text.clearMessage : confirmAction === 'overwrite' ? text.overwriteMessage : text.discardMessage }}</p><footer><button @click="cancelConfirmation">{{ commonText.cancel }}</button><button class="primary" @click="acceptConfirmation">{{ commonText.confirm }}</button></footer></div>
    </div>
    <FocusGuard />
</template>

<style scoped>
.app { display:flex; flex-direction:column; overflow:hidden; border:1px solid var(--color-border); border-radius:var(--radius-panel); background:var(--color-workspace); box-shadow:0 14px 44px rgba(0,0,0,.5); }
.app.compact-edit { top:32.407407vh; left:0; width:52.083333vw; height:50vh; transform:none; }
.topbar { height:54px; flex:none; display:flex; align-items:center; gap:12px; padding:0 14px; border-bottom:1px solid var(--color-border); }
.topbar h1 { margin:0; font-size:19px; }
.phase { color:var(--color-success); }
.top-spacer { flex:1; }
.toolbar { display:flex; align-items:end; gap:10px; flex:none; padding:10px 12px; overflow:visible; border-bottom:1px solid var(--color-border); background:var(--color-navigation); }
.file-field { min-width:190px; flex:1; display:grid; gap:3px; color:var(--color-text-muted); font-size:12px; }
.toolbar-actions { display:flex; gap:6px; }
.authors-picker { position:relative; min-width:180px; max-width:260px; }
.authors-picker>button { width:100%; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.authors-popover { position:absolute; z-index:8; top:calc(100% + 5px); left:0; width:max(100%,220px); max-width:320px; max-height:220px; overflow:auto; padding:5px; border:1px solid var(--color-border-strong); border-radius:var(--radius-control); background:var(--color-surface-raised); box-shadow:0 12px 30px rgba(0,0,0,.52); }
.authors-popover label { display:flex; gap:7px; align-items:center; min-height:34px; padding:4px 6px; border-radius:4px; cursor:pointer; }
.authors-popover label:hover { background:#2a3441; }
.authors-popover input { width:auto; }
.authors-popover>span { display:block; padding:8px; color:var(--color-text-muted); }
.content { min-height:0; flex:1; overflow:auto; padding:10px 12px; }
.point-table { min-width:1120px; }
.point-row { display:grid; grid-template-columns:28px 34px 34px 150px 104px 114px 142px minmax(300px,1fr) 106px; gap:7px; align-items:center; min-height:54px; padding:6px 7px; border-bottom:1px solid var(--color-border); }
.point-row:hover:not(.point-header) { background:rgba(255,255,255,.025); }
.point-header { position:sticky; z-index:2; top:0; min-height:38px; background:var(--color-navigation); color:var(--color-text-muted); font-size:12px; }
.drag { color:var(--color-text-muted); cursor:grab; }
.coordinate { overflow:hidden; padding:0 7px; background:transparent; text-overflow:ellipsis; white-space:nowrap; }
.icon-button { width:34px; min-width:34px; min-height:34px; display:inline-grid; padding:0; place-items:center; }
.param-cell { position:relative; min-width:0; }
.param-cell.combat-param { display:flex; gap:6px; align-items:center; }
.action-params { min-height:36px; height:36px; resize:none; }
textarea.action-params { overflow:hidden; white-space:nowrap; }
.strategy-picker { position:relative; width:34px; min-width:34px; transition:width 180ms; }
.strategy-picker.expanded { width:150px; min-width:150px; }
.strategy-trigger,.strategy-search { width:100%; }
.strategy-search { height:36px; padding:5px 8px; }
.strategy-menu,.syntax-menu { position:absolute; z-index:7; top:calc(100% + 4px); max-height:190px; overflow:auto; padding:5px; border:1px solid var(--color-border-strong); border-radius:var(--radius-control); background:var(--color-surface-raised); box-shadow:0 12px 30px rgba(0,0,0,.52); }
.strategy-menu { left:0; width:260px; }
.syntax-menu { right:0; left:40px; }
.strategy-menu button,.syntax-menu button { width:100%; display:grid; min-height:40px; height:auto; padding:5px 8px; border:0; border-radius:4px; background:transparent; text-align:left; }
.strategy-menu button:hover,.syntax-menu button:hover { background:#2a3441; }.strategy-menu button.active,.syntax-menu button.active { background:rgba(77,141,255,.2); }
.strategy-menu small,.syntax-menu small { overflow:hidden; color:var(--color-text-muted); text-overflow:ellipsis; white-space:nowrap; }
.strategy-menu>span { display:block; padding:9px; color:var(--color-text-muted); }
.no-params { display:block; color:var(--color-text-muted); text-align:center; }
.row-actions { display:flex; gap:3px; }
.footer { min-height:54px; flex:none; display:flex; align-items:center; justify-content:space-between; gap:12px; padding:8px 14px; border-top:1px solid var(--color-border); }
.footer>div { min-width:0; overflow:hidden; white-space:pre-line; }
.compact { position:absolute; top:32.407407vh; left:0; width:15.625vw; height:50vh; display:flex; flex-direction:column; overflow:hidden; border:1px solid var(--color-border); border-radius:var(--radius-panel); background:var(--color-workspace); box-shadow:0 10px 36px rgba(0,0,0,.5); pointer-events:none; }
.compact header { display:flex; align-items:center; justify-content:space-between; padding:10px 12px; border-bottom:1px solid var(--color-border); }
.compact h1 { margin:0; font-size:15px; }
.compact header span { color:var(--color-text-muted); font-size:12px; }
.compact-shortcuts { display:flex; flex-wrap:wrap; gap:4px 10px; padding:8px 12px; border-bottom:1px solid var(--color-border); color:var(--color-text-muted); font-size:11px; }
.compact-list { overflow:auto; padding:6px; }
.compact-list article { display:grid; grid-template-columns:32px minmax(0,1fr) auto; gap:6px; align-items:center; min-height:36px; padding:4px 6px; border-bottom:1px solid var(--color-border); }
.compact-list article span { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.empty { display:grid; min-height:100px; place-items:center; color:var(--color-text-muted); }
.modal-backdrop { position:fixed; z-index:10; inset:0; display:grid; place-items:center; background:rgba(0,0,0,.64); }
.settings-modal { width:min(820px,90vw); max-height:82vh; display:flex; flex-direction:column; overflow:hidden; border:1px solid var(--color-border); border-radius:var(--radius-panel); background:var(--color-surface); box-shadow:0 18px 56px rgba(0,0,0,.55); }
.settings-modal>header { display:flex; align-items:center; justify-content:space-between; padding:12px 16px; border-bottom:1px solid var(--color-border); }
.settings-modal h2,.small-modal h2 { margin:0; font-size:18px; }
.settings-modal header span { color:var(--color-text-muted); font-size:12px; }
.settings-error { margin:0; padding:8px 16px; border-bottom:1px solid var(--color-border); color:var(--color-error); }
.settings-modal>nav { display:flex; gap:4px; padding:8px 12px; border-bottom:1px solid var(--color-border); }
.settings-modal>nav .active { border-color:var(--color-primary); background:rgba(77,141,255,.2); }
.settings-content { min-height:0; overflow:auto; display:grid; gap:10px; padding:14px 16px 18px; }
.route-settings { justify-items:start; }.route-settings>.preset-card { width:100%; }.route-settings>button { justify-self:start; }
.settings-content>label,.preset-card label,.coordinate-fields label { display:grid; gap:5px; color:#cbd3dd; font-size:12px; }
.key-grid { grid-template-columns:repeat(3,1fr); }
.key-grid .binding { color:var(--color-warning); }
.preset-card { display:grid; grid-template-columns:1fr 1fr auto auto; gap:8px; align-items:end; padding:10px; border:1px solid var(--color-border); border-radius:var(--radius-control); }
.preset-card .wide { grid-column:1 / 3; }
.preset-card textarea { min-height:70px; }
.preset-card .check { display:flex; flex-direction:row; align-items:center; }
.preset-card .check input { width:auto; }
.small-modal { width:min(430px,90vw); padding:18px; border:1px solid var(--color-border); border-radius:var(--radius-panel); background:var(--color-surface); box-shadow:0 18px 56px rgba(0,0,0,.55); }
.small-modal>p { min-height:20px; color:var(--color-text-muted); }
.small-modal>footer { display:flex; justify-content:flex-end; gap:8px; }
.coordinate-fields { display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-top:14px; }
@media (max-width:959px) { .app.compact-edit { top:50%; left:50%; width:96vw; height:94vh; transform:translate(-50%,-50%); }.toolbar { align-items:stretch; flex-wrap:wrap; overflow-y:visible; }.file-field { width:100%; }.point-table { min-width:1080px; }.key-grid { grid-template-columns:1fr; }.preset-card { grid-template-columns:1fr; }.preset-card .wide { grid-column:auto; } }
</style>
