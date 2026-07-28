(function () {
    "use strict";

    const TYPE_OPTIONS = [["teleport", "传送"], ["path", "途经"], ["target", "目标"], ["orientation", "朝向"]];
    const MOVE_OPTIONS = [["walk", "行走"], ["dash", "间歇冲刺"], ["run", "持续奔跑"], ["fly", "飞行"], ["swim", "游泳"], ["climb", "攀爬"], ["jump", "跳跃"]];
    const ACTION_TREE = [
        { value: "", label: "无" },
        { value: "fight", label: "战斗" },
        { value: "combat_script", label: "简易策略脚本" },
        { value: "stop_flying", label: "下落攻击" },
        { value: "up_down_grab_leaf", label: "四叶印" },
        { value: "use_gadget", label: "使用小道具" },
        {
            label: "采集拾取",
            children: [
                { value: "nahida_collect", label: "纳西妲长E采集" },
                { value: "mining", label: "挖矿" },
                { value: "linnea_mining", label: "莉奈娅挖矿" },
                { value: "fishing", label: "钓鱼" },
                { value: "pick_up_collect", label: "聚集材料" },
                { value: "pick_around", label: "在附近拾取" },
            ],
        },
        {
            label: "元素采集",
            children: [
                { value: "hydro_collect", label: "水元素力采集" },
                { value: "electro_collect", label: "雷元素力采集" },
                { value: "anemo_collect", label: "风元素力采集" },
                { value: "pyro_collect", label: "火元素力采集" },
            ],
        },
        {
            label: "系统动作",
            children: [
                { value: "force_tp", label: "强制传送" },
                { value: "log_output", label: "输出日志" },
                { value: "exit_and_relogin", label: "退出重新登录" },
                { value: "wonderland_cycle", label: "进出千星奇域" },
                { value: "set_time", label: "设置时间" },
            ],
        },
    ];
    const ACTION_OPTIONS = ACTION_TREE.flatMap(item => item.children || [item]);
    const ACTION_PARAM_ACTIONS = new Set([
        "combat_script", "log_output", "stop_flying", "up_down_grab_leaf", "mining",
        "linnea_mining", "pick_up_collect", "pick_around", "use_gadget", "set_time",
    ]);
    const TYPE_LABELS = Object.fromEntries(TYPE_OPTIONS);
    const MOVE_LABELS = Object.fromEntries(MOVE_OPTIONS);
    const ACTION_LABELS = Object.fromEntries(ACTION_OPTIONS.map(item => [item.value, item.label]));
    const VIRTUAL_KEY_LABELS = {
        SPACE: "空格", ESCAPE: "Esc", RETURN: "回车", TAB: "Tab", SHIFT: "Shift", CONTROL: "Ctrl", MENU: "Alt",
        LEFT: "左方向键", UP: "上方向键", RIGHT: "右方向键", DOWN: "下方向键",
        LBUTTON: "鼠标左键", RBUTTON: "鼠标右键", MBUTTON: "鼠标中键",
        NUMPAD0: "小键盘 0", NUMPAD1: "小键盘 1", NUMPAD2: "小键盘 2", NUMPAD3: "小键盘 3", NUMPAD4: "小键盘 4",
        NUMPAD5: "小键盘 5", NUMPAD6: "小键盘 6", NUMPAD7: "小键盘 7", NUMPAD8: "小键盘 8", NUMPAD9: "小键盘 9",
    };
    const PHASE_LABELS = { idle: "待开始", recording: "录制中", stopped: "待保存", saved: "已保存" };
    const DEFAULT_SETTINGS = { addKey: "NumPad2", finishKey: "NumPad1", toggleKey: "Oem3", authors: [], mapMatchMethod: "TemplateMatch", combatScripts: [] };
    const state = {
        phase: "idle",
        settings: JSON.parse(JSON.stringify(DEFAULT_SETTINGS)),
        routeAuthors: [],
        routeMapMatchMethod: "TemplateMatch",
        combatSyntax: [],
        points: [],
        sampling: false,
        running: false,
        dirty: false,
        saved: false,
        binding: "",
        dragIndex: -1,
        commissionMode: false,
        displayMode: "normal",
        interactionLock: false,
        actionIndex: -1,
        syntaxTarget: null,
        syntaxItems: [],
        syntaxSelected: 0,
        strategyTarget: null,
        coordinateIndex: -1,
        coordinateMode: "edit",
        coordinateAnchor: null,
        confirmAction: null,
        statusText: "正在加载...",
        statusKind: "",
    };
    let lastCompactCount = 0;
    let settingsSaveChain = Promise.resolve();
    let settingsSaveTimer = 0;
    let strategyHideTimer = 0;
    const $ = id => document.getElementById(id);
    const request = (url, data = {}) => Promise.resolve(window.htmlMask.request(url, data)).then(result => result.data || result);
    const escapeHtml = value => String(value ?? "").replace(/[&<>"]/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" }[char]));
    const clone = value => JSON.parse(JSON.stringify(value));
    const round4 = value => Math.round(Number(value) * 10000) / 10000;
    const coordinate = value => Number.isFinite(Number(value)) ? Number(value).toFixed(4) : "";
    const coordinateDisplay = value => Number.isFinite(Number(value)) ? String(Math.round(Number(value))) : "--";

    function keyName(code) {
        const names = {
            Space: "空格", Enter: "回车", Return: "回车", Escape: "Esc", Tab: "Tab", Back: "退格", Backspace: "退格",
            Delete: "删除", Insert: "插入", Home: "Home", End: "End", Prior: "Page Up", PageUp: "Page Up", Next: "Page Down", PageDown: "Page Down",
            ArrowLeft: "左方向键", ArrowUp: "上方向键", ArrowRight: "右方向键", ArrowDown: "下方向键",
            NumPadAdd: "小键盘 +", NumPadSubtract: "小键盘 -", NumPadMultiply: "小键盘 *", NumPadDivide: "小键盘 /", NumPadDecimal: "小键盘 .",
            Left: "左方向键", Up: "上方向键", Right: "右方向键", Down: "下方向键",
            Add: "小键盘 +", Subtract: "小键盘 -", Multiply: "小键盘 *", Divide: "小键盘 /", Decimal: "小键盘 .",
            Capital: "Caps Lock", CapsLock: "Caps Lock", ControlKey: "Ctrl", LControlKey: "左 Ctrl", RControlKey: "右 Ctrl",
            ShiftKey: "Shift", LShiftKey: "左 Shift", RShiftKey: "右 Shift", Oem3: "~", Oemtilde: "~", Backquote: "~",
            Menu: "Alt", LMenu: "左 Alt", RMenu: "右 Alt",
        };
        const value = String(code || "");
        if (!value) return "未设置";
        if (/^NumPad\d$/.test(value)) return "小键盘 " + value.slice(-1);
        if (/^D\d$/.test(value)) return value.slice(-1);
        if (/^Digit\d$/.test(value)) return value.slice(-1);
        return names[value] || value.replace(/^Key/, "");
    }

    function renderSelectControl(kind, value, disabled) {
        const labels = kind === "type" ? TYPE_LABELS : MOVE_LABELS;
        const field = kind === "type" ? "type" : "move_mode";
        const options = (kind === "type" ? TYPE_OPTIONS : MOVE_OPTIONS)
            .map(([optionValue, label]) => `<option value="${escapeHtml(optionValue)}" ${optionValue === value ? "selected" : ""}>${escapeHtml(label)}</option>`).join("");
        return `<select data-field="${field}" aria-label="${kind === "type" ? "点位类型" : "移动方式"}" ${disabled}>${options}</select>`;
    }

    function authorKey(author) {
        return String(author?.name || "") + "\n" + String(author?.links || "");
    }

    function setStatus(text, kind = "") {
        state.statusText = String(text || "");
        state.statusKind = kind;
        $("status").textContent = state.statusText;
        $("status").className = "status" + (kind ? " " + kind : "");
    }

    function applyDisplayMode(mode) {
        state.displayMode = mode || "normal";
        $("app").classList.remove("mode-normal", "mode-compact", "mode-compact-edit");
        $("app").classList.add("mode-" + state.displayMode);
        document.querySelector(".compact-view").setAttribute("aria-hidden", state.displayMode === "compact" ? "false" : "true");
        closePopups();
    }

    function renderSettings() {
        for (const name of ["addKey", "finishKey", "toggleKey"]) {
            const button = $(name);
            const code = state.settings[name];
            button.textContent = state.binding === name ? "请按下一个按键..." : `${keyName(code)} (${code})`;
            button.classList.toggle("binding", state.binding === name);
            button.disabled = state.running;
        }
        $("compactAddKey").textContent = "当前点 " + keyName(state.settings.addKey);
        $("compactFinishKey").textContent = "结束录制 " + keyName(state.settings.finishKey);
        $("compactToggleKey").textContent = "切换 " + keyName(state.settings.toggleKey);
        $("toggleHint").textContent = keyName(state.settings.toggleKey) + " 切换侧边模式";
    }

    function updateCompactHeader() {
        const phase = state.running ? "执行中" : PHASE_LABELS[state.phase] || state.phase;
        $("compactPhase").textContent = "地图路径录制器 · " + phase;
        $("compactCount").textContent = state.points.length + " 点";
    }

    function renderCompactPoints() {
        const box = $("compactPoints");
        const shouldFollow = state.points.length > lastCompactCount && box.scrollHeight - box.scrollTop - box.clientHeight < 80;
        lastCompactCount = state.points.length;
        box.innerHTML = state.points.length ? state.points.map((point, index) => {
            const action = point.action ? `<span class="compact-tag compact-action">${escapeHtml(ACTION_LABELS[point.action] || point.action)}</span>` : "";
            return `<div class="compact-row"><span class="compact-index">${index + 1}</span><span class="compact-coords">${coordinateDisplay(point.x)}, ${coordinateDisplay(point.y)}</span><span class="compact-meta"><span class="compact-tag">${escapeHtml(TYPE_LABELS[point.type] || point.type)}</span>${action}</span></div>`;
        }).join("") : '<div class="compact-empty">尚未采集路径点</div>';
        updateCompactHeader();
        if (shouldFollow) box.scrollTop = box.scrollHeight;
    }

    function actionPlaceholder(action) {
        const placeholders = {
            combat_script: "输入简易策略，例如 keydown(w),wait(0.2),keyup(w)",
            log_output: "需要输出的日志",
            stop_flying: "下落攻击等待时间（毫秒）",
            up_down_grab_leaf: "方向 up 或 down（可选）",
            mining: "可填 disablePickupAround",
            set_time: "时间 HH:MM",
            linnea_mining: "射箭次数,旋转寻矿次数，例如 1,5",
            pick_up_collect: "可填角色或动作，例如 琴-短E",
            pick_around: "拾取轮数（正整数）",
            use_gadget: "最大等待秒数或 not_wait",
        };
        return placeholders[action] || "动作参数（可选）";
    }

    function renderActionCell(point, disabled) {
        const label = ACTION_LABELS[point.action] || point.action || "无";
        const input = point.action === "combat_script"
            ? `<div class="strategy-picker" data-strategy-picker><button class="strategy-trigger" data-strategy-toggle type="button" title="搜索策略预设" aria-label="搜索策略预设" ${disabled}><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5"></circle><path d="m16 16 4 4"></path></svg></button><input class="input strategy-search" data-strategy-search placeholder="搜索策略预设" ${disabled}></div><textarea class="input action-param combat-script" data-field="action_params" rows="1" wrap="off" placeholder="${escapeHtml(actionPlaceholder(point.action))}" ${disabled}>${escapeHtml(point.action_params || "")}</textarea>`
            : ACTION_PARAM_ACTIONS.has(point.action)
                ? `<input class="input action-param" data-field="action_params" placeholder="${escapeHtml(actionPlaceholder(point.action))}" value="${escapeHtml(point.action_params || "")}" ${disabled}>`
                : `<input type="hidden" data-field="action_params" value="${escapeHtml(point.action_params || "")}">`;
        return `<div class="action-cell"><button class="menu-button action-button" data-action-toggle type="button" ${disabled}><span>${escapeHtml(label)}</span><span class="menu-arrow">▼</span></button><input type="hidden" data-field="action" value="${escapeHtml(point.action || "")}">${input}</div>`;
    }

    function renderPoints() {
        const disabled = state.running ? "disabled" : "";
        $("points").innerHTML = state.points.length ? state.points.map((point, index) => `
          <div class="point point-grid" data-index="${index}">
            <button class="drag-handle" draggable="${state.running ? "false" : "true"}" type="button" title="拖动排序" ${disabled}>${"<i></i>".repeat(6)}</button>
            <button class="play-button" data-run type="button" title="从此处运行" ${state.running ? "disabled" : ""}><span class="play-triangle"></span></button>
            <strong>${index + 1}</strong>
            <div class="coordinate-cell"><button class="coords" data-coordinate type="button" title="编辑 X / Y 坐标" ${disabled}><span class="coord-line"><span class="coord-label">X</span>${coordinateDisplay(point.x)}</span><span class="coord-line"><span class="coord-label">Y</span>${coordinateDisplay(point.y)}</span></button><input type="hidden" data-field="x" value="${coordinate(point.x)}"><input type="hidden" data-field="y" value="${coordinate(point.y)}"></div>
            ${renderSelectControl("type", point.type, disabled)}
            ${renderSelectControl("move", point.move_mode, disabled)}
            ${renderActionCell(point, disabled)}
            <div class="point-actions"><button class="btn icon" data-copy title="复制点位" ${disabled}><span class="copy-icon" aria-hidden="true"></span></button><button class="btn icon" data-resample title="重新录制坐标" ${disabled}>↻</button><button class="btn icon danger" data-delete title="删除点位" ${disabled}>×</button></div>
          </div>`).join("") : '<div class="empty">点击“开始录制”、“添加当前点位”或“添加坐标”创建路径点</div>';
        window.MaskSelect?.enhance($("points"));
        renderCompactPoints();
        updateControls();
    }

    function updateControls() {
        const recording = state.phase === "recording";
        const stopped = state.phase === "stopped";
        $("phase").textContent = state.running ? "执行中" : PHASE_LABELS[state.phase] || state.phase;
        $("phase").classList.toggle("recording", recording);
        $("phase").classList.toggle("running", state.running);
        $("recordToggle").disabled = state.running || state.sampling;
        $("recordToggle").textContent = recording ? "结束录制" : "开始录制";
        $("recordToggle").classList.toggle("primary", !recording);
        $("recordToggle").classList.toggle("danger", recording);
        $("sample").disabled = !recording || state.sampling || state.running;
        $("addCoordinate").disabled = state.running;
        $("clearPoints").disabled = !state.points.length || state.running;
        $("save").disabled = !stopped || !state.points.length || state.running;
        $("fileName").disabled = state.running;
        $("routeAuthors").disabled = state.running;
        $("settingsButton").disabled = state.running;
        $("close").disabled = state.running;
        renderSettings();
        renderRouteAuthorButton();
    }

    function readPoints() {
        const rows = Array.from(document.querySelectorAll(".point"));
        if (!rows.length) return state.points;
        const readCoordinate = input => input.value.trim() === "" ? null : round4(input.value);
        return rows.map((row, index) => ({
            id: index + 1,
            x: readCoordinate(row.querySelector('[data-field="x"]')),
            y: readCoordinate(row.querySelector('[data-field="y"]')),
            type: row.querySelector('[data-field="type"]').value,
            move_mode: row.querySelector('[data-field="move_mode"]').value,
            action: row.querySelector('[data-field="action"]').value,
            action_params: row.querySelector('[data-field="action_params"]').value,
        }));
    }

    function routePayload() {
        return { authors: clone(state.routeAuthors), mapMatchMethod: state.routeMapMatchMethod };
    }

    function markDirty() {
        state.dirty = true;
        state.saved = false;
    }

    async function syncPoints() {
        state.points = readPoints();
        markDirty();
        const result = await request("/points", { points: state.points });
        if (result.status === "error") throw new Error(result.message);
        if (result.phase && result.phase !== state.phase) {
            state.phase = result.phase;
            updateControls();
        }
    }

    async function setInteractionLock(active) {
        if (state.interactionLock === active) return;
        state.interactionLock = active;
        try {
            const result = await request("/interactionLock", { active });
            if (result.status === "error") throw new Error(result.message);
        } catch (error) {
            state.interactionLock = !active;
            setStatus(error.message, "error");
        }
    }

    function positionPopup(popup, anchor, preferredWidth) {
        popup.classList.remove("hidden");
        popup.style.width = preferredWidth ? Math.min(preferredWidth, window.innerWidth - 16) + "px" : "";
        const rect = anchor.getBoundingClientRect();
        const popupRect = popup.getBoundingClientRect();
        let left = rect.left;
        let top = rect.bottom + 4;
        if (left + popupRect.width > window.innerWidth - 8) left = Math.max(8, rect.right - popupRect.width);
        if (top + popupRect.height > window.innerHeight - 8) top = Math.max(8, rect.top - popupRect.height - 4);
        popup.style.left = left + "px";
        popup.style.top = top + "px";
    }

    function hidePopup(popup) {
        popup.classList.add("hidden");
        popup.innerHTML = "";
    }

    function closePopups(except) {
        for (const id of ["routeAuthorsMenu", "actionMenu", "strategyMenu", "syntaxMenu"]) {
            const popup = $(id);
            if (popup !== except) hidePopup(popup);
        }
        if (except !== $("actionMenu")) state.actionIndex = -1;
        if (except !== $("strategyMenu")) state.strategyTarget = null;
        if (except !== $("syntaxMenu")) {
            state.syntaxTarget = null;
            state.syntaxItems = [];
        }
    }

    function closeCoordinatePopup() {
        $("coordinatePopup").classList.add("hidden");
        $("coordinateError").textContent = "";
        state.coordinateIndex = -1;
        state.coordinateMode = "edit";
        state.coordinateAnchor = null;
        if ($("settingsModal").classList.contains("hidden") && $("confirmModal").classList.contains("hidden")) setInteractionLock(false);
    }

    function openCoordinatePopup(anchor, index) {
        if (state.running) return;
        state.points = readPoints();
        const point = state.points[index];
        if (!point) return;
        closePopups();
        state.coordinateIndex = index;
        state.coordinateMode = "edit";
        state.coordinateAnchor = anchor;
        $("coordinateTitle").textContent = "编辑坐标";
        $("coordinateApply").textContent = "确认";
        $("coordinateX").value = coordinate(point.x);
        $("coordinateY").value = coordinate(point.y);
        $("coordinateError").textContent = "";
        positionPopup($("coordinatePopup"), anchor, 330);
        setInteractionLock(true);
        $("coordinateX").focus();
        $("coordinateX").select();
    }

    function openAddCoordinatePopup() {
        if (state.running) return;
        state.points = readPoints();
        closePopups();
        state.coordinateIndex = -1;
        state.coordinateMode = "add";
        state.coordinateAnchor = $("addCoordinate");
        $("coordinateTitle").textContent = "添加坐标";
        $("coordinateApply").textContent = "添加";
        $("coordinateX").value = "";
        $("coordinateY").value = "";
        $("coordinateError").textContent = "";
        positionPopup($("coordinatePopup"), $("addCoordinate"), 330);
        setInteractionLock(true);
        $("coordinateX").focus();
    }

    async function applyCoordinatePopup() {
        const rawX = $("coordinateX").value.trim();
        const rawY = $("coordinateY").value.trim();
        const x = Number(rawX);
        const y = Number(rawY);
        if (!rawX || !rawY || !Number.isFinite(x) || !Number.isFinite(y)) {
            $("coordinateError").textContent = "X 和 Y 必须是有效数字";
            return false;
        }
        const adding = state.coordinateMode === "add";
        const index = state.coordinateIndex;
        state.points = readPoints();
        if (adding) {
            state.points.push({
                id: state.points.length + 1,
                x: round4(x),
                y: round4(y),
                type: state.points.length ? "path" : "teleport",
                move_mode: "walk",
                action: "",
                action_params: "",
            });
            if (state.phase !== "recording") state.phase = "stopped";
        } else {
            if (index < 0 || !state.points[index]) return false;
            state.points[index].x = round4(x);
            state.points[index].y = round4(y);
        }
        markDirty();
        try {
            const result = await request("/points", { points: state.points });
            if (result.status === "error") throw new Error(result.message);
            closeCoordinatePopup();
            renderPoints();
            setStatus(adding ? "已添加手动坐标" : "坐标已更新", "ok");
            return true;
        } catch (error) {
            $("coordinateError").textContent = error.message;
            return false;
        }
    }

    function renderRouteAuthorButton() {
        const names = state.routeAuthors.map(author => author.name).filter(Boolean);
        $("routeAuthors").querySelector("span").textContent = names.length ? names.join("、") : "未选择";
    }

    function openRouteAuthorsMenu() {
        const popup = $("routeAuthorsMenu");
        closePopups(popup);
        const selected = new Set(state.routeAuthors.map(authorKey));
        popup.innerHTML = state.settings.authors.length ? state.settings.authors.map((author, index) => `
          <label><input type="checkbox" data-author-index="${index}" ${selected.has(authorKey(author)) ? "checked" : ""}><span>${escapeHtml(author.name)}</span></label>`).join("") : '<div class="muted" style="padding:10px">请先添加作者预设</div>';
        positionPopup(popup, $("routeAuthors"), Math.max(240, $("routeAuthors").offsetWidth));
    }

    function setSettingsStatus(text, kind = "") {
        $("settingsStatus").textContent = text;
        $("settingsStatus").className = "settings-status" + (kind ? " " + kind : "");
    }

    function renderSettingsRows() {
        const settings = state.settings;
        $("presetMapMatch").value = settings.mapMatchMethod;
        window.MaskSelect?.refresh($("presetMapMatch"));
        $("presetAuthors").innerHTML = settings.authors.map(author => `
          <div class="preset-row author-preset-row"><input class="input" data-name placeholder="作者姓名" value="${escapeHtml(author.name)}"><input class="input" data-links placeholder="作者链接（可选）" value="${escapeHtml(author.links)}"><label class="check-label"><input type="checkbox" data-def ${author.def ? "checked" : ""}>默认</label><button class="btn icon danger" data-remove-author>×</button></div>`).join("");
        $("presetScripts").innerHTML = settings.combatScripts.map(script => `
          <div class="preset-row script-row"><input class="input" data-name placeholder="策略名称" value="${escapeHtml(script.name)}"><textarea class="input combat-script preset-combat-script" data-value placeholder="简易策略脚本">${escapeHtml(script.value)}</textarea><label class="check-label"><input type="radio" name="defaultScript" data-def ${script.def ? "checked" : ""}>默认</label><button class="btn icon danger" data-remove-script>×</button></div>`).join("");
    }

    function openSettingsModal() {
        closePopups();
        renderSettingsRows();
        setSettingsStatus("修改后自动保存");
        $("settingsModal").classList.remove("hidden");
        setInteractionLock(true);
    }

    function readSettingsForm() {
        const authors = Array.from(document.querySelectorAll(".author-preset-row")).map(row => ({
            name: row.querySelector("[data-name]").value,
            links: row.querySelector("[data-links]").value,
            def: row.querySelector("[data-def]").checked,
        }));
        const combatScripts = Array.from(document.querySelectorAll(".script-row")).map(row => ({
            name: row.querySelector("[data-name]").value,
            value: row.querySelector("[data-value]").value,
            def: row.querySelector("[data-def]").checked,
        }));
        return { ...state.settings, authors, combatScripts, mapMatchMethod: $("presetMapMatch").value };
    }

    function reconcileRouteAuthors(previousAuthors) {
        const available = new Map(state.settings.authors.map(author => [authorKey(author), author]));
        state.routeAuthors = previousAuthors.map(author => available.get(authorKey(author))).filter(Boolean).map(author => ({ name: author.name, links: author.links }));
        if (state.points.length && JSON.stringify(previousAuthors) !== JSON.stringify(state.routeAuthors)) markDirty();
        renderRouteAuthorButton();
    }

    function queueSettingsSave(settings, message = "设置已自动保存") {
        clearTimeout(settingsSaveTimer);
        const snapshot = clone(settings);
        const previousAuthors = clone(state.routeAuthors);
        const previousMapMatch = state.routeMapMatchMethod;
        setSettingsStatus("正在保存...");
        settingsSaveChain = settingsSaveChain.catch(() => {}).then(async () => {
            const result = await request("/settings", snapshot);
            if (result.status === "error") throw new Error(result.message);
            state.settings = result.settings;
            reconcileRouteAuthors(previousAuthors);
            state.routeMapMatchMethod = state.settings.mapMatchMethod;
            if (state.points.length && previousMapMatch !== state.routeMapMatchMethod) markDirty();
            renderSettings();
            setSettingsStatus(message, "ok");
            return true;
        }).catch(error => {
            setSettingsStatus(error.message, "error");
            return false;
        });
        return settingsSaveChain;
    }

    function saveSettingsForm(message) {
        return queueSettingsSave(readSettingsForm(), message);
    }

    function debounceSettingsSave() {
        clearTimeout(settingsSaveTimer);
        setSettingsStatus("等待保存...");
        settingsSaveTimer = setTimeout(() => saveSettingsForm(), 500);
    }

    async function closeSettingsModal() {
        if (state.binding) {
            await request("/binding", { active: false }).catch(() => {});
            state.binding = "";
        }
        clearTimeout(settingsSaveTimer);
        const saved = await saveSettingsForm();
        if (!saved) return;
        $("settingsModal").classList.add("hidden");
        setInteractionLock(false);
    }

    function renderActionMenu(anchor, index) {
        const popup = $("actionMenu");
        closePopups(popup);
        state.actionIndex = index;
        popup.innerHTML = ACTION_TREE.map(item => item.children
            ? `<div class="action-group"><button class="popup-item" data-action-group type="button"><span>${escapeHtml(item.label)}</span><span>›</span></button><div class="action-submenu">${item.children.map(child => `<button class="popup-item" data-action-value="${escapeHtml(child.value)}" type="button">${escapeHtml(child.label)}</button>`).join("")}</div></div>`
            : `<button class="popup-item" data-action-value="${escapeHtml(item.value)}" type="button">${escapeHtml(item.label)}</button>`).join("");
        positionPopup(popup, anchor, 190);
        popup.classList.toggle("flip", popup.getBoundingClientRect().right + 190 > window.innerWidth - 8);
    }

    function closeActionGroups(except) {
        $("actionMenu").querySelectorAll(".action-group.open").forEach(group => {
            if (group !== except) {
                group.classList.remove("open");
                delete group.dataset.keyboardOpen;
            }
        });
    }

    function syntaxContext(input) {
        const caret = input.selectionStart ?? input.value.length;
        const before = input.value.slice(0, caret);
        let depth = 0;
        let segmentStart = 0;
        let lastOpen = -1;
        for (let index = 0; index < before.length; index++) {
            const char = before[index];
            if (char === "(") {
                depth++;
                lastOpen = index;
            } else if (char === ")") {
                depth = Math.max(0, depth - 1);
                if (!depth) lastOpen = -1;
            } else if (!depth && (char === ";" || char === "|" || char === "," || char === "\n")) {
                segmentStart = index + 1;
            }
        }
        if (depth > 0 && lastOpen >= segmentStart) {
            const methodMatch = /([^\s(),;|]+)\s*$/.exec(before.slice(segmentStart, lastOpen));
            const method = state.combatSyntax.find(item => item.code === methodMatch?.[1] || item.aliases.includes(methodMatch?.[1]));
            if (!method?.params?.length) return null;
            const argumentText = before.slice(lastOpen + 1);
            const tokenMatch = /([^,\s]*)$/.exec(argumentText);
            return { kind: "param", method, query: tokenMatch?.[1] || "", start: caret - (tokenMatch?.[1]?.length || 0), end: caret };
        }
        const tokenMatch = /([^\s(),;|]*)$/.exec(before.slice(segmentStart));
        const query = tokenMatch?.[1] || "";
        return { kind: "method", query, start: caret - query.length, end: caret };
    }

    function updateSyntaxMenu(input) {
        const context = syntaxContext(input);
        if (!context) return hidePopup($("syntaxMenu"));
        const query = context.query.toLowerCase();
        const keyParameter = ["keydown", "keyup", "keypress"].includes(context.method?.code);
        const items = context.kind === "param"
            ? context.method.params.filter(value => !keyParameter || !/^[A-Z]$/.test(value)).filter(value => value.toLowerCase().includes(query) || (keyParameter && (VIRTUAL_KEY_LABELS[value] || "").includes(context.query))).map(value => ({ label: value, detail: keyParameter ? (VIRTUAL_KEY_LABELS[value] || value) : context.method.hint, insert: value, start: context.start, end: context.end }))
            : state.combatSyntax.filter(method => [method.code, ...method.aliases].some(value => value.toLowerCase().includes(query))).map(method => ({
                label: method.code,
                detail: method.aliases.length ? `${method.hint} · 别名 ${method.aliases.join("、")}` : method.hint,
                insert: method.template,
                start: context.start,
                end: context.end,
                caret: method.template.includes("(") ? method.template.indexOf("(") + 1 : method.template.length,
            }));
        if (!items.length) return hidePopup($("syntaxMenu"));
        state.syntaxTarget = input;
        state.syntaxItems = items;
        state.syntaxSelected = 0;
        const popup = $("syntaxMenu");
        closePopups(popup);
        popup.classList.toggle("in-modal", Boolean(input.closest("#settingsModal")));
        popup.innerHTML = items.map((item, index) => `<button class="popup-item syntax-item ${index === 0 ? "focused" : ""}" data-syntax-index="${index}" type="button"><strong>${escapeHtml(item.label)}</strong><small>${escapeHtml(item.detail || "")}</small></button>`).join("");
        positionPopup(popup, input, Math.min(360, Math.max(260, input.offsetWidth)));
    }

    function chooseSyntax(index) {
        const item = state.syntaxItems[index];
        const input = state.syntaxTarget;
        if (!item || !input) return;
        input.value = input.value.slice(0, item.start) + item.insert + input.value.slice(item.end);
        const caret = item.start + (item.caret ?? item.insert.length);
        input.focus();
        input.setSelectionRange(caret, caret);
        if (input.closest("#settingsModal")) debounceSettingsSave();
        else markDirty();
        hidePopup($("syntaxMenu"));
        state.syntaxTarget = null;
        state.syntaxItems = [];
    }

    function moveSyntaxSelection(delta) {
        if (!state.syntaxItems.length) return;
        state.syntaxSelected = (state.syntaxSelected + delta + state.syntaxItems.length) % state.syntaxItems.length;
        $("syntaxMenu").querySelectorAll("[data-syntax-index]").forEach((item, index) => item.classList.toggle("focused", index === state.syntaxSelected));
        $("syntaxMenu").querySelector(`[data-syntax-index="${state.syntaxSelected}"]`)?.scrollIntoView({ block: "nearest" });
    }

    function handleSyntaxKeydown(event) {
        if (event.target !== state.syntaxTarget || $("syntaxMenu").classList.contains("hidden")) return false;
        if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            moveSyntaxSelection(event.key === "ArrowDown" ? 1 : -1);
        } else if (event.key === "Enter" || event.key === "Tab") {
            event.preventDefault();
            chooseSyntax(state.syntaxSelected);
        } else if (event.key === "Escape") {
            event.preventDefault();
            hidePopup($("syntaxMenu"));
        } else return false;
        event.stopPropagation();
        return true;
    }

    function updateStrategyMenu(input, anchor = input) {
        const query = input.value.trim().toLowerCase();
        const scripts = state.settings.combatScripts.filter(script => !query || script.name.toLowerCase().includes(query));
        if (!scripts.length) return hidePopup($("strategyMenu"));
        state.strategyTarget = input;
        const popup = $("strategyMenu");
        closePopups(popup);
        popup.innerHTML = scripts.map((script, index) => `<button class="popup-item" data-strategy-index="${state.settings.combatScripts.indexOf(script)}" type="button"><span>${escapeHtml(script.name)}</span>${script.def ? "<small>默认</small>" : ""}</button>`).join("");
        positionPopup(popup, anchor, Math.max(220, anchor.offsetWidth));
    }

    function clearDragMarks() {
        document.querySelectorAll(".point").forEach(row => row.classList.remove("drag-before", "drag-after"));
    }

    async function saveKeySettings(name, code) {
        const next = { ...readSettingsForm(), [name]: code };
        try {
            await queueSettingsSave(next, "快捷键已保存");
        } finally {
            request("/binding", { active: false }).catch(() => {});
            state.binding = "";
            renderSettings();
        }
    }

    async function beginBinding(name) {
        try {
            const result = await request("/binding", { active: true });
            if (result.status === "error") throw new Error(result.message);
            state.binding = name;
            renderSettings();
        } catch (error) { setSettingsStatus(error.message, "error"); }
    }

    $("addKey").onclick = () => beginBinding("addKey");
    $("finishKey").onclick = () => beginBinding("finishKey");
    $("toggleKey").onclick = () => beginBinding("toggleKey");
    $("routeAuthors").onclick = openRouteAuthorsMenu;
    $("settingsButton").onclick = openSettingsModal;
    document.querySelector(".settings-tabs").onclick = event => {
        const tab = event.target.closest("[data-settings-tab]");
        if (!tab) return;
        document.querySelectorAll("[data-settings-tab]").forEach(item => item.classList.toggle("active", item === tab));
        document.querySelectorAll("[data-settings-panel]").forEach(panel => panel.classList.toggle("hidden", panel.dataset.settingsPanel !== tab.dataset.settingsTab));
    };
    $("addAuthor").onclick = () => {
        $("presetAuthors").insertAdjacentHTML("beforeend", '<div class="preset-row author-preset-row"><input class="input" data-name placeholder="作者姓名"><input class="input" data-links placeholder="作者链接（可选）"><label class="check-label"><input type="checkbox" data-def>默认</label><button class="btn icon danger" data-remove-author>×</button></div>');
    };
    $("addScript").onclick = () => {
        $("presetScripts").insertAdjacentHTML("beforeend", '<div class="preset-row script-row"><input class="input" data-name placeholder="策略名称"><textarea class="input combat-script preset-combat-script" data-value placeholder="简易策略脚本"></textarea><label class="check-label"><input type="radio" name="defaultScript" data-def>默认</label><button class="btn icon danger" data-remove-script>×</button></div>');
    };
    $("presetAuthors").onclick = event => {
        const remove = event.target.closest("[data-remove-author]");
        if (!remove) return;
        remove.closest(".preset-row").remove();
        saveSettingsForm();
    };
    $("presetScripts").onclick = event => {
        const remove = event.target.closest("[data-remove-script]");
        if (!remove) return;
        remove.closest(".preset-row").remove();
        saveSettingsForm();
    };
    $("settingsModal").addEventListener("input", event => {
        if (event.target.matches("[data-name],[data-links],[data-value]")) debounceSettingsSave();
        if (event.target.matches(".preset-combat-script")) updateSyntaxMenu(event.target);
    });
    $("settingsModal").addEventListener("focusin", event => {
        if (event.target.matches(".preset-combat-script")) updateSyntaxMenu(event.target);
    });
    $("settingsModal").addEventListener("keydown", event => handleSyntaxKeydown(event));
    $("settingsModal").addEventListener("change", event => {
        if (event.target.matches("[data-def]")) saveSettingsForm();
        if (event.target === $("presetMapMatch")) saveSettingsForm();
    });
    $("settingsClose").onclick = closeSettingsModal;

    $("recordToggle").onclick = async () => {
        if (state.phase === "recording") {
            try {
                await syncPoints();
                const result = await request("/finish");
                if (result.status === "error") throw new Error(result.message);
                state.phase = "stopped";
                updateControls();
                setStatus("录制已结束，请检查点位后保存", "ok");
            } catch (error) { setStatus(error.message, "error"); }
            return;
        }
        try {
            const result = await request("/start");
            if (result.status === "error") throw new Error(result.message);
            state.phase = "recording";
            state.points = Array.isArray(result.points) ? result.points : [];
            markDirty();
            renderPoints();
            setStatus("正在录制当前坐标...");
        } catch (error) { setStatus(error.message, "error"); }
    };
    $("sample").onclick = async () => {
        try {
            await syncPoints();
            const result = await request("/sample");
            if (result.status === "error") throw new Error(result.message);
        } catch (error) { setStatus(error.message, "error"); }
    };
    $("addCoordinate").onclick = openAddCoordinatePopup;
    $("save").onclick = async () => {
        try {
            await syncPoints();
            $("save").disabled = true;
            const result = await request("/save", { points: state.points, fileName: $("fileName").value, ...routePayload() });
            if (result.status === "error") throw new Error(result.message);
            state.saved = true;
            state.dirty = false;
            state.phase = "saved";
            $("fileName").value = result.fileName || $("fileName").value;
            setStatus("已保存：" + result.path, "ok");
            updateControls();
            await request("/done");
        } catch (error) {
            setStatus(error.message, "error");
            updateControls();
        }
    };

    $("routeAuthorsMenu").onchange = event => {
        const index = Number(event.target.dataset.authorIndex);
        if (!Number.isInteger(index)) return;
        const author = state.settings.authors[index];
        const selected = new Map(state.routeAuthors.map(item => [authorKey(item), item]));
        if (event.target.checked) selected.set(authorKey(author), { name: author.name, links: author.links });
        else selected.delete(authorKey(author));
        state.routeAuthors = Array.from(selected.values());
        if (state.points.length) markDirty();
        renderRouteAuthorButton();
    };

    $("points").addEventListener("input", event => {
        markDirty();
        if (event.target.matches(".combat-script")) updateSyntaxMenu(event.target);
        else if (event.target.matches("[data-strategy-search]")) updateStrategyMenu(event.target);
    });
    $("points").addEventListener("focusin", event => {
        if (event.target.matches(".combat-script")) updateSyntaxMenu(event.target);
        else if (event.target.matches("[data-strategy-search]")) updateStrategyMenu(event.target);
    });
    $("points").addEventListener("keydown", event => {
        if (handleSyntaxKeydown(event)) return;
        const actionButton = event.target.closest("[data-action-toggle]");
        if (actionButton && ["ArrowDown", "Enter", " "].includes(event.key)) {
            event.preventDefault();
            const row = actionButton.closest(".point");
            renderActionMenu(actionButton, Number(row.dataset.index));
            $("actionMenu").querySelector(".popup-item")?.focus();
        }
    });
    $("points").addEventListener("change", async event => {
        if (event.target.matches("[data-strategy-search],.combat-script")) return;
        try { await syncPoints(); } catch (error) { setStatus(error.message, "error"); }
    });
    $("points").addEventListener("click", async event => {
        const row = event.target.closest(".point");
        if (!row) return;
        const index = Number(row.dataset.index);
        const strategyToggle = event.target.closest("[data-strategy-toggle]");
        if (strategyToggle) {
            const picker = strategyToggle.closest("[data-strategy-picker]");
            const input = picker.querySelector("[data-strategy-search]");
            picker.classList.add("expanded");
            input.focus();
            updateStrategyMenu(input);
            return;
        }
        const coordinateButton = event.target.closest("[data-coordinate]");
        if (coordinateButton) {
            openCoordinatePopup(coordinateButton, index);
            return;
        }
        if (event.target.closest("[data-action-toggle]")) {
            renderActionMenu(event.target.closest("[data-action-toggle]"), index);
            return;
        }
        if (event.target.closest("[data-run]")) {
            try {
                state.points = readPoints();
                const result = await request("/runFromPoint", { points: state.points, index, ...routePayload() });
                if (result.status === "error") throw new Error(result.message);
                state.running = true;
                applyDisplayMode("compact");
                renderPoints();
                setStatus("路线执行中，已切换到侧边穿透模式");
            } catch (error) { setStatus(error.message, "error"); }
            return;
        }
        if (event.target.closest("[data-resample]")) {
            try {
                await syncPoints();
                const result = await request("/resample", { index });
                if (result.status === "error") throw new Error(result.message);
                state.points = result.points;
                markDirty();
                renderPoints();
                setStatus("坐标已重新录制", "ok");
            } catch (error) { setStatus(error.message, "error"); }
            return;
        }
        if (event.target.closest("[data-copy]")) {
            state.points = readPoints();
            state.points.splice(index, 0, clone(state.points[index]));
            markDirty();
            renderPoints();
            try {
                await syncPoints();
                setStatus("已复制点位 #" + (index + 1), "ok");
            } catch (error) { setStatus(error.message, "error"); }
            return;
        }
        if (!event.target.closest("[data-delete]")) return;
        state.points = readPoints();
        state.points.splice(index, 1);
        markDirty();
        renderPoints();
        try { await syncPoints(); } catch (error) { setStatus(error.message, "error"); }
    });

    $("actionMenu").onclick = async event => {
        const group = event.target.closest("[data-action-group]");
        if (group) {
            const container = group.parentElement;
            const opening = !container.classList.contains("open");
            closeActionGroups(opening ? container : null);
            container.classList.toggle("open", opening);
            delete container.dataset.keyboardOpen;
            return;
        }
        const item = event.target.closest("[data-action-value]");
        if (!item || state.actionIndex < 0) return;
        state.points = readPoints();
        const point = state.points[state.actionIndex];
        const nextAction = item.dataset.actionValue;
        if (point.action !== nextAction) point.action_params = "";
        point.action = nextAction;
        if (point.action === "combat_script" && !point.action_params.trim()) {
            point.action_params = state.settings.combatScripts.find(script => script.def)?.value || "";
        }
        markDirty();
        hidePopup($("actionMenu"));
        state.actionIndex = -1;
        renderPoints();
        try { await syncPoints(); } catch (error) { setStatus(error.message, "error"); }
    };
    $("actionMenu").onkeydown = event => {
        const current = event.target.closest(".popup-item");
        if (!current) return;
        if (event.key === "ArrowRight" && current.matches("[data-action-group]")) {
            event.preventDefault();
            closeActionGroups(current.parentElement);
            current.parentElement.classList.add("open");
            current.parentElement.dataset.keyboardOpen = "true";
            current.parentElement.querySelector(".action-submenu .popup-item")?.focus();
        } else if (event.key === "ArrowLeft" && current.closest(".action-submenu")) {
            event.preventDefault();
            const parent = current.closest(".action-group");
            parent.classList.remove("open");
            delete parent.dataset.keyboardOpen;
            parent.querySelector("[data-action-group]").focus();
        } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            const container = current.closest(".action-submenu") || $("actionMenu");
            const items = Array.from(container.querySelectorAll(":scope > .popup-item, :scope > .action-group > .popup-item"));
            const next = (items.indexOf(current) + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
            items[next]?.focus();
        } else if (event.key === "Escape") {
            hidePopup($("actionMenu"));
            state.actionIndex = -1;
        }
    };
    $("actionMenu").addEventListener("pointerover", event => {
        const group = event.target.closest(".action-group");
        if (group) closeActionGroups(group);
    });
    $("actionMenu").addEventListener("pointerout", event => {
        const group = event.target.closest(".action-group");
        if (group && !group.contains(event.relatedTarget) && !group.dataset.keyboardOpen) group.classList.remove("open");
    });
    $("actionMenu").addEventListener("pointerleave", () => {
        $("actionMenu").querySelectorAll(".action-group.open:not([data-keyboard-open])").forEach(group => group.classList.remove("open"));
    });
    $("actionMenu").addEventListener("focusout", event => {
        const group = event.target.closest(".action-group");
        if (group && !group.contains(event.relatedTarget)) {
            group.classList.remove("open");
            delete group.dataset.keyboardOpen;
        }
    });
    $("strategyMenu").onclick = event => {
        const item = event.target.closest("[data-strategy-index]");
        if (!item || !state.strategyTarget) return;
        const script = state.settings.combatScripts[Number(item.dataset.strategyIndex)];
        const row = state.strategyTarget.closest(".point");
        row.querySelector('[data-field="action_params"]').value = script.value;
        state.strategyTarget.value = "";
        markDirty();
        state.strategyTarget.closest("[data-strategy-picker]")?.classList.remove("expanded");
        hidePopup($("strategyMenu"));
    };
    $("points").addEventListener("mouseover", event => {
        const picker = event.target.closest("[data-strategy-picker]");
        if (!picker || picker.contains(event.relatedTarget)) return;
        clearTimeout(strategyHideTimer);
        if (!picker.classList.contains("expanded")) updateStrategyMenu(picker.querySelector("[data-strategy-search]"), picker.querySelector("[data-strategy-toggle]"));
    });
    $("points").addEventListener("mouseout", event => {
        const picker = event.target.closest("[data-strategy-picker]");
        if (!picker || picker.contains(event.relatedTarget) || picker.classList.contains("expanded") || $("strategyMenu").contains(event.relatedTarget)) return;
        strategyHideTimer = setTimeout(() => hidePopup($("strategyMenu")), 160);
    });
    $("strategyMenu").onmouseenter = () => clearTimeout(strategyHideTimer);
    $("strategyMenu").onmouseleave = () => {
        strategyHideTimer = setTimeout(() => {
            if (!state.strategyTarget?.closest("[data-strategy-picker]")?.classList.contains("expanded")) hidePopup($("strategyMenu"));
        }, 160);
    };
    $("syntaxMenu").onclick = event => {
        const item = event.target.closest("[data-syntax-index]");
        if (item) chooseSyntax(Number(item.dataset.syntaxIndex));
    };

    $("points").addEventListener("dragstart", event => {
        const handle = event.target.closest(".drag-handle");
        if (!handle || state.running) return event.preventDefault();
        state.points = readPoints();
        state.dragIndex = Number(handle.closest(".point").dataset.index);
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", String(state.dragIndex));
    });
    $("points").addEventListener("dragover", event => {
        const row = event.target.closest(".point");
        if (!row || state.dragIndex < 0) return;
        event.preventDefault();
        clearDragMarks();
        row.classList.add(event.clientY > row.getBoundingClientRect().top + row.offsetHeight / 2 ? "drag-after" : "drag-before");
    });
    $("points").addEventListener("drop", async event => {
        const row = event.target.closest(".point");
        if (!row || state.dragIndex < 0) return;
        event.preventDefault();
        const target = Number(row.dataset.index);
        const after = event.clientY > row.getBoundingClientRect().top + row.offsetHeight / 2;
        const point = state.points.splice(state.dragIndex, 1)[0];
        let insert = target + (after ? 1 : 0);
        if (state.dragIndex < insert) insert--;
        state.points.splice(insert, 0, point);
        state.dragIndex = -1;
        clearDragMarks();
        markDirty();
        renderPoints();
        try { await syncPoints(); } catch (error) { setStatus(error.message, "error"); }
    });
    $("points").addEventListener("dragend", () => { state.dragIndex = -1; clearDragMarks(); });

    function closeConfirmModal() {
        $("confirmModal").classList.add("hidden");
        state.confirmAction = null;
        setInteractionLock(false);
    }

    function openConfirmModal(title, text, action) {
        if (!$("coordinatePopup").classList.contains("hidden")) closeCoordinatePopup();
        $("confirmTitle").textContent = title;
        $("confirmText").textContent = text;
        state.confirmAction = action;
        setInteractionLock(true);
        $("confirmModal").classList.remove("hidden");
        $("confirmCancel").focus();
    }

    async function clearAllPoints() {
        state.points = [];
        if (state.phase !== "recording") state.phase = "idle";
        markDirty();
        const result = await request("/points", { points: [] });
        if (result.status === "error") throw new Error(result.message);
        renderPoints();
        setStatus("已清除所有点位", "ok");
    }

    function requestClose() {
        if (state.running) return setStatus("路线执行过程中不能关闭录制器，请先停止 BetterGI 任务", "error");
        if (state.dirty && !state.saved && state.points.length) {
            openConfirmModal("放弃路径录制", "当前录制结果尚未保存，确定要关闭吗？", () => request("/cancel"));
        } else request("/cancel").catch(() => {});
    }
    $("close").onclick = requestClose;
    $("clearPoints").onclick = () => openConfirmModal("清除所有点位", "确定要清除所有点位吗？此操作不会立即写入路径文件。", clearAllPoints);
    $("confirmCancel").onclick = closeConfirmModal;
    $("confirmAccept").onclick = async () => {
        const action = state.confirmAction;
        $("confirmModal").classList.add("hidden");
        state.confirmAction = null;
        try {
            if (action) await action();
        } catch (error) {
            setStatus(error.message, "error");
        } finally {
            setInteractionLock(false);
        }
    };
    $("coordinateApply").onclick = applyCoordinatePopup;
    $("coordinateCancel").onclick = closeCoordinatePopup;
    $("coordinatePopup").addEventListener("keydown", event => {
        if (event.key === "Enter") {
            event.preventDefault();
            applyCoordinatePopup();
        } else if (event.key === "Escape") {
            event.preventDefault();
            closeCoordinatePopup();
        }
    });

    document.addEventListener("click", event => {
        if (!event.target.closest("#routeAuthors,#routeAuthorsMenu,#actionMenu,[data-action-toggle],#strategyMenu,[data-strategy-picker],#syntaxMenu,.combat-script")) closePopups();
        if (!event.target.closest("[data-strategy-picker],#strategyMenu")) document.querySelectorAll("[data-strategy-picker].expanded").forEach(picker => picker.classList.remove("expanded"));
        if (!$('coordinatePopup').classList.contains("hidden") && !event.target.closest("#coordinatePopup,#addCoordinate,[data-coordinate]")) applyCoordinatePopup();
    });
    document.addEventListener("keydown", event => {
        if (!state.binding) {
            if (event.key === "Escape") {
                if (!$("coordinatePopup").classList.contains("hidden")) closeCoordinatePopup();
                else if (!$("settingsModal").classList.contains("hidden")) closeSettingsModal();
                else if (!$("confirmModal").classList.contains("hidden")) closeConfirmModal();
                else {
                    closePopups();
                    document.querySelectorAll("[data-strategy-picker].expanded").forEach(picker => picker.classList.remove("expanded"));
                }
            }
            return;
        }
        event.preventDefault();
        event.stopPropagation();
    }, true);
    document.addEventListener("focusin", event => {
        if (state.displayMode === "compact-edit" && event.target.matches("input,select,textarea,button")) setInteractionLock(true);
    });
    document.addEventListener("focusout", () => {
        setTimeout(() => {
            if (!state.interactionLock || state.binding || !$("confirmModal").classList.contains("hidden") || !$("settingsModal").classList.contains("hidden") || !$("coordinatePopup").classList.contains("hidden")) return;
            if (!document.activeElement?.matches("input,select,textarea,button")) setInteractionLock(false);
        }, 200);
    });

    window.htmlMask.onMessage = message => {
        if (message?.url === "/bindingKey") {
            const keyCode = String(message.data?.keyCode || "").trim();
            if (state.binding && keyCode) saveKeySettings(state.binding, keyCode);
            return;
        }
        if (message?.url === "/displayMode") return applyDisplayMode(message.data?.mode);
        if (message?.url !== "/state") return;
        const data = message.data || {};
        if (data.phase) state.phase = data.phase;
        if (data.settings) state.settings = data.settings;
        if (Array.isArray(data.points)) state.points = data.points;
        state.sampling = Boolean(data.sampling);
        state.running = Boolean(data.running);
        if (data.displayMode) applyDisplayMode(data.displayMode);
        renderPoints();
        if (data.error) setStatus(data.error, "error");
        else if (data.message) setStatus(data.message, data.phase === "stopped" || !state.running ? "ok" : "");
    };

    request("/init").then(result => {
        state.phase = result.phase || "idle";
        state.settings = result.settings || clone(DEFAULT_SETTINGS);
        state.routeAuthors = result.routeAuthors || [];
        state.routeMapMatchMethod = result.routeMapMatchMethod || state.settings.mapMatchMethod;
        state.combatSyntax = result.combatSyntax || [];
        state.points = result.points || [];
        state.commissionMode = Boolean(result.commissionMode);
        state.running = Boolean(result.running);
        applyDisplayMode(result.displayMode || "normal");
        $("fileName").value = result.suggestedFileName || "";
        const measure = document.createElement("span");
        measure.style.cssText = "position:absolute;visibility:hidden;white-space:nowrap;font:14px/1.5 'Microsoft YaHei'";
        document.body.appendChild(measure);
        let actionWidth = 0;
        for (const option of ACTION_OPTIONS) {
            measure.textContent = option.label;
            actionWidth = Math.max(actionWidth, measure.getBoundingClientRect().width);
        }
        measure.remove();
        document.documentElement.style.setProperty("--action-menu-width", Math.ceil(actionWidth + 42) + "px");
        renderPoints();
        setStatus(result.warning || "准备就绪", result.warning ? "warning" : "ok");
    }).catch(error => setStatus(error.message, "error"));
})();
