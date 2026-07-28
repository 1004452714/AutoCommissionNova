(function () {
    "use strict";

    const COMMON_FIELDS = ["desc", "loc", "note", "retry", "retryOn"];
    const DISPLAY_FIELDS = ["desc", "loc", "data", "note", "retry", "retryOn"];
    const FIELD_META = {
        desc: { label: "执行条件", key: "desc" },
        loc: { label: "地址检测", key: "loc" },
        data: { label: "步骤数据", key: "data" },
        note: { label: "步骤说明", key: "note" },
        retry: { label: "重试次数", key: "retry" },
        retryOn: { label: "重试条件", key: "retryOn" },
    };
    const COUNTRY_ORDER = ["蒙德", "璃月", "稻妻", "须弥", "枫丹", "纳塔", "挪德卡莱"];
    const state = {
        scopes: [],
        processors: [],
        roles: [],
        branches: [],
        recentFiles: [],
        steps: [],
        selected: -1,
        create: false,
        savedScope: null,
        shownCommon: new Set(),
        shownData: new Set(),
        dataVisible: false,
        dragIndex: -1,
        dirty: false,
        loading: false,
        saving: false,
        recording: false,
        loadedPath: null,
        targetRequest: 0,
        confirmResolve: null,
        confirmFocus: null,
    };
    const $ = id => document.getElementById(id);
    let countryCombo;
    let locationCombo;
    let activeEditableCombo = null;
    const roleCombos = new WeakMap();
    const request = (url, data = {}) => Promise.resolve(window.htmlMask.request(url, data)).then(result => result.data || result);
    const escapeHtml = value => String(value ?? "").replace(/[&<>"]/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[char]);

    function fieldLabel(label, key, required = false) {
        return `<span class="field-label-content${required ? " required" : ""}"><span>${escapeHtml(label)}</span><small class="field-key">${escapeHtml(key)}</small></span>`;
    }

    function setStatus(text, kind = "") {
        $("status").textContent = text;
        $("status").className = "status " + kind;
    }

    function diagnosticText(result, successText = "校验通过") {
        const errors = result.errors || [];
        const warnings = result.warnings || [];
        const sections = [];
        if (errors.length) sections.push("错误：\n" + errors.join("\n"));
        if (warnings.length) sections.push("警告：\n" + warnings.join("\n"));
        return sections.length ? sections.join("\n") : successText;
    }

    function unique(values) {
        return Array.from(new Set(values.filter(Boolean))).sort((a, b) => a.localeCompare(b, "zh-CN"));
    }

    function orderedCountries(values) {
        return Array.from(new Set(values.filter(Boolean))).sort((a, b) => {
            const ai = COUNTRY_ORDER.indexOf(a);
            const bi = COUNTRY_ORDER.indexOf(b);
            if (ai >= 0 || bi >= 0) {
                if (ai < 0) return 1;
                if (bi < 0) return -1;
                return ai - bi;
            }
            return a.localeCompare(b, "zh-CN");
        });
    }

    function markDirty() {
        state.dirty = true;
        if (!$("status").classList.contains("error")) setStatus("有未保存的修改");
    }

    function closeConfirmation(result) {
        if (!state.confirmResolve) return;
        const resolve = state.confirmResolve;
        const focus = state.confirmFocus;
        state.confirmResolve = null;
        state.confirmFocus = null;
        $("confirmModal").classList.add("hidden");
        document.querySelector(".app").classList.remove("modal-locked");
        if (focus && typeof focus.focus === "function") focus.focus();
        resolve(result);
    }

    function confirmDiscard(action) {
        if (!state.dirty) return Promise.resolve(true);
        if (state.confirmResolve) return Promise.resolve(false);
        state.confirmFocus = document.activeElement;
        $("confirmMessage").textContent = "当前流程有未保存的修改，确定要" + action + "吗？";
        $("confirmModal").classList.remove("hidden");
        document.querySelector(".app").classList.add("modal-locked");
        return new Promise(resolve => {
            state.confirmResolve = resolve;
            requestAnimationFrame(() => $("confirmCancel").focus());
        });
    }

    function setOptions(element, values, selected) {
        element.innerHTML = values.map(value => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`).join("");
        if (selected && values.includes(selected)) element.value = selected;
        window.MaskSelect?.refresh(element);
    }

    function setGroupedStepOptions(element, selected) {
        element.innerHTML = groupedOptions(selected);
        if (selected) element.value = selected;
        window.MaskSelect?.refresh(element);
    }

    function createEditableSelect(root, onValueChange) {
        const input = root.querySelector("input");
        const toggle = root.querySelector(".editable-toggle");
        const optionsElement = root.querySelector(".editable-options");
        let items = [];
        let filtered = [];
        let activeIndex = -1;
        let showAll = false;

        function close() {
            root.classList.remove("open");
            optionsElement.classList.add("hidden");
            input.setAttribute("aria-expanded", "false");
            activeIndex = -1;
            showAll = false;
            if (activeEditableCombo?.root === root) activeEditableCombo = null;
        }

        function render() {
            const query = input.value.trim().toLowerCase();
            filtered = items.filter(item => showAll || !query || item.toLowerCase().includes(query));
            if (!showAll && query) {
                filtered.sort((a, b) => Number(b.toLowerCase().startsWith(query)) - Number(a.toLowerCase().startsWith(query)));
            }
            if (!showAll && query && activeIndex < 0 && filtered.length) activeIndex = 0;
            if (activeIndex >= filtered.length) activeIndex = filtered.length - 1;
            optionsElement.innerHTML = filtered.length
                ? filtered.map((item, index) => `<li class="editable-option ${index === activeIndex ? "active" : ""}" data-value="${escapeHtml(item)}" role="option" aria-selected="${index === activeIndex}">${escapeHtml(item)}</li>`).join("")
                : '<li class="editable-empty">没有匹配项，可直接输入新值</li>';
        }

        function open(allItems = false) {
            if (activeEditableCombo && activeEditableCombo.root !== root) activeEditableCombo.close();
            if (showAll !== allItems) activeIndex = -1;
            showAll = allItems;
            render();
            root.classList.add("open");
            optionsElement.classList.remove("hidden");
            input.setAttribute("aria-expanded", "true");
            activeEditableCombo = { root, close };
        }

        function select(value) {
            input.value = value;
            close();
            onValueChange(value);
            input.focus();
        }

        function moveActive(direction) {
            if (!root.classList.contains("open")) open();
            if (!filtered.length) return;
            activeIndex = activeIndex < 0
                ? (direction > 0 ? 0 : filtered.length - 1)
                : (activeIndex + direction + filtered.length) % filtered.length;
            render();
            optionsElement.querySelector(".active")?.scrollIntoView({ block: "nearest" });
        }

        input.addEventListener("focus", () => open(true));
        input.addEventListener("click", () => open(true));
        input.addEventListener("input", () => {
            activeIndex = -1;
            open(false);
            onValueChange(input.value);
        });
        input.addEventListener("keydown", event => {
            if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                event.preventDefault();
                moveActive(event.key === "ArrowDown" ? 1 : -1);
            } else if (event.key === "Enter" && root.classList.contains("open")) {
                event.preventDefault();
                if (activeIndex >= 0 && filtered[activeIndex]) select(filtered[activeIndex]);
                else close();
            } else if (event.key === "Escape") {
                event.preventDefault();
                close();
            } else if (event.key === "Tab") {
                close();
            }
        });
        toggle.addEventListener("mousedown", event => {
            event.preventDefault();
            if (root.classList.contains("open")) close();
            else {
                input.focus();
                open(true);
            }
        });
        optionsElement.addEventListener("mousedown", event => {
            const option = event.target.closest(".editable-option");
            if (!option) return;
            event.preventDefault();
            select(option.dataset.value);
        });

        return {
            close,
            contains: target => root.contains(target),
            setItems(values) {
                items = Array.from(new Set(values.filter(Boolean)));
                if (root.classList.contains("open")) render();
            },
        };
    }

    function enhanceRoleEditors(root = document) {
        root.querySelectorAll?.("[data-role-combo]").forEach(combo => {
            let instance = roleCombos.get(combo);
            if (!instance) {
                instance = createEditableSelect(combo, markDirty);
                roleCombos.set(combo, instance);
            }
            instance.setItems(state.roles);
        });
    }

    function closeRoleEditors(eventTarget) {
        document.querySelectorAll("[data-role-combo].open").forEach(combo => {
            if (!combo.contains(eventTarget)) roleCombos.get(combo)?.close();
        });
    }

    function filteredScopes() {
        return state.scopes.filter(scope =>
            (!$("countrySelect").value || scope.country === $("countrySelect").value) &&
            (!$("typeSelect").value || scope.typeDir === $("typeSelect").value) &&
            (!$("commissionSelect").value || scope.commissionName === $("commissionSelect").value));
    }

    function refreshCascade(level) {
        if (level === "country") {
            const list = state.scopes.filter(scope => scope.country === $("countrySelect").value);
            setOptions($("typeSelect"), unique(list.map(scope => scope.typeDir)), $("typeSelect").value);
        }
        if (level === "country" || level === "type") {
            const list = state.scopes.filter(scope => scope.country === $("countrySelect").value && scope.typeDir === $("typeSelect").value);
            setOptions($("commissionSelect"), unique(list.map(scope => scope.commissionName)), $("commissionSelect").value);
        }
        setOptions($("locationSelect"), unique(filteredScopes().map(scope => scope.locationDir)), $("locationSelect").value);
    }

    function refreshNewLocationOptions() {
        const country = $("country").value.trim();
        locationCombo?.setItems(unique(state.scopes
            .filter(scope => !country || scope.country === country)
            .map(scope => String(scope.locationDir || "").replace(/-\d+$/, ""))));
    }

    function currentScope() {
        if (state.create && state.savedScope) return state.savedScope;
        return state.create ? {
            country: $("country").value,
            typeDir: $("type").value,
            commissionName: $("commission").value,
            locationDir: $("location").value,
        } : {
            country: $("countrySelect").value,
            typeDir: $("typeSelect").value,
            commissionName: $("commissionSelect").value,
            locationDir: $("locationSelect").value,
        };
    }

    function currentFileName() {
        return state.create ? $("fileName").value : "process.json";
    }

    async function refreshTarget() {
        const requestId = ++state.targetRequest;
        const scope = currentScope();
        const fileName = currentFileName();
        const values = [scope.country, scope.typeDir, scope.commissionName, scope.locationDir, fileName];
        $("save").disabled = true;
        $("save").textContent = state.create && !state.savedScope ? "新建" : "保存";
        if (values.some(value => !String(value || "").trim())) {
            if (state.create) $("path").textContent = "填写完整信息后可新建流程文件";
            return;
        }
        try {
            const result = await request("/target", {
                scope,
                fileName,
                create: state.create && !state.savedScope,
            });
            if (requestId !== state.targetRequest) return;
            if (result.status === "error") throw new Error(result.message);
            if (state.create || !state.loadedPath || state.loadedPath === result.path) {
                state.branches = result.branches || [];
            }
            $("save").textContent = result.exists ? "保存" : "新建";
            $("save").disabled = state.loading || state.saving || (!state.create && state.loadedPath !== result.path);
            if (state.create || state.loadedPath !== result.path) $("path").textContent = result.path;
        } catch (error) {
            if (requestId !== state.targetRequest) return;
            $("save").disabled = true;
            if (state.create) $("path").textContent = error.message;
        }
    }

    function setMode(create) {
        state.create = create;
        state.savedScope = null;
        state.loadedPath = null;
        $("existingFields").classList.toggle("hidden", create);
        $("newFields").classList.toggle("hidden", !create);
        $("existingFile").classList.toggle("hidden", create);
        $("fileName").classList.toggle("hidden", !create);
        $("load").classList.toggle("hidden", create);
        $("loadActions").classList.toggle("hidden", create);
        $("existingMode").classList.toggle("active", !create);
        $("newMode").classList.toggle("active", create);
        $("path").textContent = create ? "保存时创建新的委托目录和流程文件" : "";
        if (create) refreshNewLocationOptions();
        refreshTarget();
    }

    function processor(type) {
        return state.processors.find(item => item.type === type);
    }

    function defaultForType(type) {
        if (type === "number") return 0;
        if (type === "boolean") return false;
        if (type === "array") return [];
        if (type === "object") return {};
        return "";
    }

    function optionValue(option) {
        return typeof option === "object" ? option.value : option;
    }

    function fieldDefault(field) {
        if (field.default !== undefined) return field.default;
        if (field.required && field.options?.length) return optionValue(field.options[0]);
        return defaultForType(field.type);
    }

    function numberAttributes(spec = {}) {
        const parts = ['type="number"', `step="${spec.integer ? "1" : "any"}"`];
        if (spec.min !== undefined) parts.push(`min="${escapeHtml(spec.min)}"`);
        else if (spec.exclusiveMin !== undefined) {
            const minimum = spec.integer ? Number(spec.exclusiveMin) + 1 : spec.exclusiveMin;
            parts.push(`min="${escapeHtml(minimum)}"`);
        }
        return parts.join(" ");
    }

    function parseNumber(value, spec, label) {
        const number = Number(value);
        if (!Number.isFinite(number)) throw new Error(label + "必须是有限数字");
        if (spec.integer && !Number.isInteger(number)) throw new Error(label + "必须是整数");
        if (spec.min !== undefined && number < spec.min) throw new Error(label + "不能小于 " + spec.min);
        if (spec.exclusiveMin !== undefined && number <= spec.exclusiveMin) throw new Error(label + "必须大于 " + spec.exclusiveMin);
        return number;
    }

    function defaultData(type) {
        const spec = processor(type)?.dataSpec;
        if (!spec || spec.kind === "none") return undefined;
        if (spec.kind === "custom") {
            if (spec.editor === "roles" || spec.editor === "branches" || spec.editor === "waves") return {};
            if (spec.editor === "key") return "";
            return undefined;
        }
        if (spec.kind !== "object") return spec.kind === "number" ? 0 : "";
        if (spec.optional) return undefined;
        const data = {};
        for (const [name, field] of Object.entries(spec.fields || {})) {
            if (field.required || field.default !== undefined) data[name] = fieldDefault(field);
        }
        return data;
    }

    function validDataFields(step) {
        const spec = processor(step?.type)?.dataSpec;
        if (!spec || spec.kind !== "object") return [];
        const fields = Object.entries(spec.fields || {});
        const data = step?.data && typeof step.data === "object" && !Array.isArray(step.data) ? step.data : {};
        if (step.type === "自动任务") {
            const action = data.action || "enable";
            const taskType = data.taskType || "AutoSkip";
            return fields.filter(([name]) => name === "action" ||
                (name === "taskType" && action === "enable") ||
                (name === "config" && action === "enable" && taskType === "AutoPick"));
        }
        if (step.type === "摧毁哨塔") {
            const navigation = data.navigation || "图标寻路";
            return fields.filter(([name]) => name === "navigation" ||
                (name === "path" && navigation === "路径追踪"));
        }
        return fields;
    }

    function showOnlyDataField(step) {
        if (!state.dataVisible) return;
        const fields = validDataFields(step);
        if (fields.length === 1) state.shownData.add(fields[0][0]);
    }

    function resetShownFields(step) {
        state.shownCommon = new Set(COMMON_FIELDS.filter(name => step && step[name] !== undefined));
        const spec = processor(step?.type)?.dataSpec;
        const fields = spec?.fields || {};
        state.shownData = new Set(Object.keys(fields).filter(name => fields[name].required || fields[name].alwaysVisible || step?.data?.[name] !== undefined));
        state.dataVisible = Boolean(spec && spec.kind !== "none" && (!spec.optional || step?.data !== undefined));
        showOnlyDataField(step);
    }

    function renderRecentFiles() {
        const box = $("recentFiles");
        box.innerHTML = state.recentFiles.length ? state.recentFiles.map((item, index) => {
            const scope = item.scope || {};
            return `<button class="recent-file" type="button" data-recent-index="${index}" title="${escapeHtml(item.path || "")}"><strong>${escapeHtml(scope.commissionName || "未命名委托")} · ${escapeHtml(scope.locationDir || "")}</strong><small>${escapeHtml(scope.country || "")} / ${escapeHtml(scope.typeDir || "")} / ${escapeHtml(item.fileName || "process.json")}</small></button>`;
        }).join("") : '<div class="recent-empty">尚无最近打开的流程</div>';
    }

    function renderSteps() {
        $("steps").innerHTML = state.steps.length ? state.steps.map((step, index) => `
          <div class="step ${index === state.selected ? "active" : ""}" data-index="${index}">
            <button class="drag-handle" draggable="true" title="拖动排序" aria-label="拖动步骤"><i></i><i></i><i></i><i></i><i></i><i></i></button>
            <div><div class="step-type">${index + 1}. ${escapeHtml(step.type || "未设置")}</div><div class="note">${escapeHtml(step.note || "")}</div></div>
            <div class="actions"><button class="mini" data-action="copy">复制</button><button class="mini danger" data-action="delete">删除</button></div>
          </div>`).join("") : '<div class="empty">还没有步骤，请从上方添加</div>';
        renderEditor();
    }

    function arrayHint(name) {
        if (name === "priorityOptions") return "每行一个对话选项，保存后写入字符串数组。";
        if (name === "npcWhiteList") return "每行一个 NPC 名称，只填写名称本身。";
        if (name === "items") return "每行一个道具名称，按从上到下的顺序尝试。";
        return "每行一个数组元素，只填写值，不需要输入引号或逗号。";
    }

    function renderArrayField(name, field, value) {
        const values = Array.isArray(value) ? value : [];
        const rows = (values.length ? values : [""]).map((item, index) => renderArrayRow(item, index)).join("");
        return `<section class="data-field" data-field-name="${escapeHtml(name)}" data-field-type="array">
          <div class="field-head"><label class="label">${fieldLabel(field.label || name, name, field.required)}</label>${field.required ? "" : '<button class="mini danger" data-remove-data="' + escapeHtml(name) + '">移除</button>'}</div>
          <div class="array-list">${rows}</div><button class="btn" data-array-add>添加一行</button><div class="field-note">${arrayHint(name)}</div>
        </section>`;
    }

    function renderArrayRow(item, index) {
        return `
          <div class="array-row" data-array-row>
            <input class="input" data-array-value value="${escapeHtml(item)}">
            <button class="btn icon" data-array-action="up" data-index="${index}" title="上移">↑</button>
            <button class="btn icon" data-array-action="down" data-index="${index}" title="下移">↓</button>
            <button class="btn icon danger" data-array-action="delete" data-index="${index}" title="删除">×</button>
          </div>`;
    }

    function groupedOptions(selected, predicate = () => true) {
        const groups = [];
        for (const item of state.processors) {
            if (!predicate(item)) continue;
            let group = groups.find(entry => entry.category === item.category);
            if (!group) {
                group = { category: item.category, items: [] };
                groups.push(group);
            }
            group.items.push(item);
        }
        return groups.map(group => `<optgroup label="${escapeHtml(group.category)}">${group.items.map(item =>
            `<option value="${escapeHtml(item.type)}" ${item.type === selected ? "selected" : ""}>${escapeHtml(item.type)}</option>`).join("")}</optgroup>`).join("");
    }

    function renderKeyEditor(value) {
        const data = value && typeof value === "object" && !Array.isArray(value)
            ? value
            : { key: typeof value === "string" ? value : "", action: "press" };
        return `<div class="key-data-grid" data-key-editor>
          <label class="label required">操作</label><select class="input" data-key-action><option value="press" ${data.action === "press" ? "selected" : ""}>点击</option><option value="down" ${data.action === "down" ? "selected" : ""}>按下</option><option value="up" ${data.action === "up" ? "selected" : ""}>释放</option></select>
          <label class="label required">按键</label><input class="input" data-key-value value="${escapeHtml(data.key || "")}" placeholder="例如 F、Space、VK_ESCAPE">
        </div><div class="field-note">仅接受 BetterGI 支持的 VirtualKey 名称。</div>`;
    }

    function renderRolesEditor(value) {
        const data = value && typeof value === "object" && !Array.isArray(value) ? value : {};
        return `<div class="role-editor" data-role-editor>${[1, 2, 3, 4].map(slot => {
            return `<div class="form-line"><label class="form-label">槽位 ${slot}</label><div class="editable-select role-editable" data-role-combo><input class="input" data-role-slot="${slot}" value="${escapeHtml(data[slot] || "")}" autocomplete="off" role="combobox" aria-autocomplete="list" aria-expanded="false" placeholder="输入或选择角色"><button class="editable-toggle" type="button" tabindex="-1" aria-label="展开角色候选"></button><ul class="editable-options hidden" role="listbox"></ul></div></div>`;
        }).join("")}</div><div class="field-note">配置 1 至 4 个不重复角色；可选择或输入角色名，未知角色会在校验时拒绝。</div>`;
    }

    function renderWaveRoute(condition = "-1", path = "") {
        return `<div class="wave-route" data-wave-route><input class="input" data-wave-condition type="number" min="-1" step="1" value="${escapeHtml(condition)}" title="-1 表示进入波次时执行，否则填写累计击杀数"><input class="input" data-wave-path value="${escapeHtml(path)}" placeholder="路径文件.json"><button class="btn icon danger" data-wave-delete-route type="button">×</button></div>`;
    }

    function renderWave(waveNumber = 1, routes = []) {
        const rows = routes.length ? routes : [{ condition: "-1", path: "" }];
        return `<section class="wave-card" data-wave-card><div class="field-head"><label class="label required">波次</label><input class="input wave-number" data-wave-number type="number" min="1" step="1" value="${escapeHtml(waveNumber)}"><button class="mini danger" data-wave-delete type="button">删除波次</button></div><div data-wave-routes>${rows.map(item => renderWaveRoute(item.condition, item.path)).join("")}</div><button class="btn" data-wave-add-route type="button">添加路径条件</button></section>`;
    }

    function renderWavesEditor(value) {
        const data = value && typeof value === "object" && !Array.isArray(value) ? value : {};
        const waves = Object.keys(data).filter(key => /^wave[1-9]\d*$/.test(key)).sort((a, b) => Number(a.slice(4)) - Number(b.slice(4))).map(key => ({
            number: Number(key.slice(4)),
            routes: Object.entries(data[key] || {}).map(([condition, path]) => ({ condition, path })),
        }));
        return `<div class="form-line"><label class="form-label">总超时</label><input class="input" data-wave-timeout type="number" min="1" step="1" value="${escapeHtml(data.timeout ?? "")}" placeholder="默认 300 秒"></div><div data-waves>${(waves.length ? waves : [{ number: 1, routes: [] }]).map(item => renderWave(item.number, item.routes)).join("")}</div><button class="btn" data-wave-add type="button">添加波次</button><div class="field-note">条件 -1 表示进入该波次时执行；其他非负整数表示累计击杀阈值。</div>`;
    }

    function renderNestedData(type, value) {
        const spec = processor(type)?.dataSpec;
        if (!spec || spec.kind === "none") return '<div class="field-note" data-nested-none>此步骤不需要 data</div>';
        if (spec.kind === "string" || spec.kind === "number") {
            const typeAttributes = spec.kind === "number" ? numberAttributes(spec) : 'type="text"';
            return `<input class="input" data-nested-single ${typeAttributes} value="${escapeHtml(value ?? "")}" placeholder="${escapeHtml(spec.label || "data")}">`;
        }
        if (spec.kind === "custom") {
            if (spec.editor === "key") return renderKeyEditor(value);
            if (spec.editor === "roles") return renderRolesEditor(value);
            if (spec.editor === "waves") return renderWavesEditor(value);
            return '<div class="field-note">该步骤不能作为分支内嵌步骤</div>';
        }
        if (spec.kind !== "object") return '<div class="field-note">该步骤不能作为分支内嵌步骤</div>';
        const data = value && typeof value === "object" && !Array.isArray(value) ? value : {};
        let fields = Object.entries(spec.fields || {});
        if (type === "自动任务") {
            const action = data.action || "enable";
            const taskType = data.taskType || "AutoSkip";
            fields = fields.filter(([name]) => name === "action" ||
                (name === "taskType" && action === "enable") ||
                (name === "config" && action === "enable" && taskType === "AutoPick"));
        } else if (type === "摧毁哨塔") {
            const navigation = data.navigation || "图标寻路";
            fields = fields.filter(([name]) => name === "navigation" || (name === "path" && navigation === "路径追踪"));
        }
        return `<div data-nested-object>${fields.map(([name, field]) => renderNestedField(name, field, data[name])).join("")}</div>`;
    }

    function renderNestedField(name, field, value) {
        if (field.type === "array") {
            return `<div class="nested-field" data-nested-field="${escapeHtml(name)}" data-nested-type="array"><label class="label${field.required ? " required" : ""}">${escapeHtml(field.label || name)}</label><textarea class="json" data-nested-value placeholder="每行一项">${escapeHtml(Array.isArray(value) ? value.join("\n") : "")}</textarea></div>`;
        }
        if (value === undefined && field.default !== undefined) value = field.default;
        const control = field.type === "object"
            ? (() => {
                const config = value && typeof value === "object" && !Array.isArray(value) ? value : {};
                return `<div data-autopick-config><textarea class="json" data-autopick-text placeholder="每行一个交互文字">${escapeHtml(Array.isArray(config.TextList) ? config.TextList.join("\n") : "")}</textarea><select class="input" data-autopick-force><option value="false" ${config.ForceInteraction === true ? "" : "selected"}>不强制交互</option><option value="true" ${config.ForceInteraction === true ? "selected" : ""}>强制交互</option></select></div>`;
            })()
            : field.type === "boolean"
            ? `<select class="input" data-nested-value><option value="">未设置</option><option value="true" ${value === true ? "selected" : ""}>是</option><option value="false" ${value === false ? "selected" : ""}>否</option></select>`
            : field.options
                ? `<select class="input" data-nested-value>${field.options.map(option => `<option value="${escapeHtml(optionValue(option))}" ${value === optionValue(option) ? "selected" : ""}>${escapeHtml(typeof option === "object" ? option.label : option)}</option>`).join("")}</select>`
                : `<input class="input" data-nested-value ${field.type === "number" ? numberAttributes(field) : 'type="text"'} value="${escapeHtml(value ?? "")}">`;
        return `<div class="nested-field" data-nested-field="${escapeHtml(name)}" data-nested-type="${escapeHtml(field.type)}"><label class="label${field.required ? " required" : ""}">${escapeHtml(field.label || name)}</label>${control}</div>`;
    }

    function renderBranchesEditor(value) {
        const data = value && typeof value === "object" && !Array.isArray(value) ? value : {};
        if (!state.branches.length) return '<div class="status error branch-empty">当前委托没有分支配置，请先在分支配置中声明分支。</div>';
        return `<div data-branch-editor>${state.branches.map(branch => {
            const nested = data[branch.key] || {};
            const type = nested.type || state.processors[0]?.type || "";
            return `<section class="branch-card" data-branch-key="${escapeHtml(branch.key)}"><div class="branch-title">${escapeHtml(branch.label)} <span>${escapeHtml(branch.key)}</span></div><select class="input" data-branch-type>${groupedOptions(type, item => item.type !== "用户分支选择")}</select><div data-branch-data>${renderNestedData(type, nested.data)}</div><label class="label">步骤说明</label><input class="input" data-branch-note value="${escapeHtml(nested.note || "")}"></section>`;
        }).join("")}</div>`;
    }

    function renderDataField(name, field, value) {
        if (field.type === "array") return renderArrayField(name, field, value);
        if (value === undefined && field.default !== undefined) value = field.default;
        const required = field.required ? " required" : "";
        const remove = field.required || field.alwaysVisible ? "" : `<button class="mini danger" data-remove-data="${escapeHtml(name)}">移除</button>`;
        let control;
        if (field.type === "boolean") {
            control = `<select class="input" data-data-value><option value="">未设置（默认否）</option><option value="true" ${value === true ? "selected" : ""}>是</option><option value="false" ${value === false ? "selected" : ""}>否</option></select>`;
        } else if (field.type === "object") {
            const config = value && typeof value === "object" && !Array.isArray(value) ? value : {};
            control = `<div data-autopick-config><label class="label">交互文字（每行一个）</label><textarea class="json" data-autopick-text>${escapeHtml(Array.isArray(config.TextList) ? config.TextList.join("\n") : "")}</textarea><label class="label">强制交互</label><select class="input" data-autopick-force><option value="false" ${config.ForceInteraction === true ? "" : "selected"}>否</option><option value="true" ${config.ForceInteraction === true ? "selected" : ""}>是</option></select></div>`;
        } else if (field.options) {
            control = `<select class="input" data-data-value>${field.options.map(option => {
                const optionValue = typeof option === "object" ? option.value : option;
                const optionLabel = typeof option === "object" ? option.label : option;
                return `<option value="${escapeHtml(optionValue)}" ${value === optionValue ? "selected" : ""}>${escapeHtml(optionLabel)}</option>`;
            }).join("")}</select>`;
        } else {
            control = `<input class="input" data-data-value ${field.type === "number" ? numberAttributes(field) : 'type="text"'} value="${escapeHtml(value ?? "")}">`;
        }
        return `<section class="data-field" data-field-name="${escapeHtml(name)}" data-field-type="${escapeHtml(field.type || "string")}"><div class="field-head"><label class="label">${fieldLabel(field.label || name, name, Boolean(required))}</label>${remove}</div>${control}<div class="field-note">${escapeHtml(field.hint || (field.required ? "必填" : "可选"))}</div></section>`;
    }

    function renderLoc(step) {
        const loc = step.loc;
        const multiple = Array.isArray(loc) && Array.isArray(loc[0]);
        const points = multiple ? loc : [Array.isArray(loc) ? loc : ["", "", ""]];
        return `<section id="locField"><div class="field-head"><label class="label">${fieldLabel(FIELD_META.loc.label, FIELD_META.loc.key)}</label><button class="mini danger" data-remove-common="loc">移除</button></div>
          <div class="mode"><button class="btn ${multiple ? "" : "active"}" data-loc-mode="single">单点</button><button class="btn ${multiple ? "active" : ""}" data-loc-mode="multiple">多点</button></div>
          <div id="locRows" data-mode="${multiple ? "multiple" : "single"}">${points.map((point, index) => renderLocRow(point, index, multiple)).join("")}</div>
          ${multiple ? '<button class="btn" id="addLocPoint">添加坐标</button>' : ""}
          <div class="field-note">单点保存为 [x, y, tolerance]；多点保存为 [[x, y], ...]。容差留空时默认 15 且不会写入数组。</div></section>`;
    }

    function renderLocRow(point, index, multiple) {
        return `<div class="loc-row"><input class="input" data-loc="x" type="number" placeholder="x" value="${escapeHtml(point?.[0] ?? "")}"><input class="input" data-loc="y" type="number" placeholder="y" value="${escapeHtml(point?.[1] ?? "")}"><input class="input" data-loc="tolerance" type="number" placeholder="容差（可选）" value="${escapeHtml(point?.[2] ?? "")}">${multiple ? `<button class="btn icon danger" data-loc-delete="${index}">×</button>` : "<span></span>"}</div>`;
    }

    function renderCommonField(name, step) {
        if (name === "loc") return renderLoc(step);
        const control = name === "retryOn"
            ? `<select id="common-${name}" class="input"><option value="">默认</option><option ${step[name] === "throw" ? "selected" : ""}>throw</option><option ${step[name] === "return-false" ? "selected" : ""}>return-false</option><option ${step[name] === "all" ? "selected" : ""}>all</option></select>`
            : `<input id="common-${name}" class="input" type="${name === "retry" ? "number" : "text"}" min="0" value="${escapeHtml(step[name] ?? "")}">`;
        return `<section><div class="field-head"><label class="label">${fieldLabel(FIELD_META[name].label, FIELD_META[name].key)}</label><button class="mini danger" data-remove-common="${name}">移除</button></div>${control}</section>`;
    }

    function optionalChoices(step) {
        const spec = processor(step.type)?.dataSpec;
        return DISPLAY_FIELDS.flatMap(name => {
            if (name === "data") {
                return spec && spec.kind !== "none" && spec.optional && !state.dataVisible
                    ? [{ value: "data", label: FIELD_META.data.label, key: FIELD_META.data.key }]
                    : [];
            }
            return state.shownCommon.has(name)
                ? []
                : [{ value: "common:" + name, label: FIELD_META[name].label, key: FIELD_META[name].key }];
        });
    }

    function dataOptionalChoices(step) {
        const spec = processor(step.type)?.dataSpec;
        if (!spec || spec.kind !== "object") return [];
        return validDataFields(step).filter(([name, field]) =>
            !field.required && !field.alwaysVisible && !state.shownData.has(name) &&
            !(step.type === "自动任务" && (name === "taskType" || name === "config")) &&
            !(step.type === "摧毁哨塔" && name === "path"))
            .map(([name, field]) => ({ value: name, label: field.label || name, key: name }));
    }

    function choiceOptions(choices, emptyText) {
        return choices.length
            ? choices.map(item => `<option value="${escapeHtml(item.value)}" data-meta="${escapeHtml(item.key)}">${escapeHtml(item.label)}</option>`).join("")
            : `<option value="">${escapeHtml(emptyText)}</option>`;
    }

    function renderDataEditor(step) {
        const meta = processor(step.type)?.dataSpec;
        if (!meta) return '<div class="status error">此步骤缺少 dataSpec，无法编辑</div>';
        if (meta.kind === "object") {
            const data = step.data && typeof step.data === "object" && !Array.isArray(step.data) ? step.data : {};
            let visible = validDataFields(step).filter(([name, field]) => field.required || field.alwaysVisible || state.shownData.has(name));
            if (step.type === "自动任务") {
                const action = data.action || "enable";
                const taskType = data.taskType || "AutoSkip";
                visible = validDataFields(step);
                if (action === "enable") state.shownData.add("taskType");
                if (taskType === "AutoPick") state.shownData.add("config");
            } else if (step.type === "摧毁哨塔") {
                const navigation = data.navigation || "图标寻路";
                visible = validDataFields(step);
                if (navigation === "路径追踪") state.shownData.add("path");
            }
            const fields = visible
                .map(([name, field]) => renderDataField(name, field, data[name])).join("");
            return `<div id="dataFields">${fields}</div>`;
        }
        if (meta.kind === "none") return '<div class="field-note" style="margin-top:12px">此步骤不需要 data</div>';
        if (meta.kind === "custom") {
            if (meta.editor === "key") return renderKeyEditor(step.data);
            if (meta.editor === "roles") return renderRolesEditor(step.data);
            if (meta.editor === "waves") return renderWavesEditor(step.data);
            if (meta.editor === "branches") return renderBranchesEditor(step.data);
            return '<div class="status error">此专用 data 编辑器尚未实现</div>';
        }
        if (meta.kind === "string" || meta.kind === "number") {
            const input = meta.options
                ? `<select id="singleData" class="input">${meta.options.map(option => `<option value="${escapeHtml(optionValue(option))}" ${step.data === optionValue(option) ? "selected" : ""}>${escapeHtml(typeof option === "object" ? option.label : option)}</option>`).join("")}</select>`
                : `<input id="singleData" class="input" ${meta.kind === "number" ? numberAttributes(meta) : 'type="text"'} value="${escapeHtml(step.data ?? "")}">`;
            const control = step.type === "地图追踪"
                ? `<div class="data-record-row">${input}<button id="recordPath" class="btn primary" type="button">打开录制</button></div>`
                : input;
            return `${control}<div class="field-note">${escapeHtml(meta.label || "步骤数据")}</div>`;
        }
        return '<div class="field-note">此步骤不需要 data</div>';
    }

    function renderDataSection(step) {
        const spec = processor(step.type)?.dataSpec;
        if (!state.dataVisible || !spec || spec.kind === "none") return "";
        const choices = dataOptionalChoices(step);
        const remove = spec.optional ? '<button class="mini danger" data-remove-data-container>移除</button>' : "";
        const addFields = spec.kind === "object" && choices.length
            ? `<div class="optional-bar data-optional-bar"><select id="dataOptionalField" class="input">${choiceOptions(choices, "没有可添加的数据字段")}</select><button id="addDataOptional" class="btn">添加</button></div>`
            : "";
        return `<section id="dataSection"><div class="field-head"><label class="label">${fieldLabel(FIELD_META.data.label, FIELD_META.data.key, !spec.optional)}</label>${remove}</div><div id="dataEditor">${renderDataEditor(step)}</div>${addFields}</section>`;
    }

    function preserveEditorDraft(step, strict = false) {
        if (state.dataVisible) {
            try {
                const data = readData(step);
                if (data === undefined) delete step.data;
                else step.data = data;
            } catch (error) {
                if (strict) {
                    setStatus("字段格式错误：" + error.message, "error");
                    return false;
                }
            }
        }
        for (const name of COMMON_FIELDS) {
            if (!state.shownCommon.has(name)) continue;
            if (name === "loc") {
                try {
                    const points = readLocRows(strict);
                    step.loc = $("locRows")?.dataset.mode === "multiple" ? points : points[0];
                } catch (error) {
                    if (strict) {
                        setStatus("字段格式错误：" + error.message, "error");
                        return false;
                    }
                }
                continue;
            }
            const input = $("common-" + name);
            if (!input) continue;
            const value = input.value.trim();
            if (!value) delete step[name];
            else if (name !== "retry") step[name] = value;
            else if (Number.isInteger(Number(value)) && Number(value) >= 0) step[name] = Number(value);
            else if (strict) {
                setStatus("字段格式错误：retry 必须是非负整数", "error");
                return false;
            }
        }
        return true;
    }

    function renderEditor() {
        const box = $("editor");
        const step = state.steps[state.selected];
        if (!step) {
            box.className = "empty";
            box.textContent = "选择一个步骤进行编辑";
            return;
        }
        const choices = optionalChoices(step);
        const details = DISPLAY_FIELDS.map(name => name === "data"
            ? renderDataSection(step)
            : state.shownCommon.has(name) ? renderCommonField(name, step) : "").join("");
        box.className = "";
        box.innerHTML = `
          <label class="label required">步骤类型</label><select id="editType" class="input">${groupedOptions(step.type)}</select>
          <div id="detailFields">${details}</div>
          <div class="optional-bar"><select id="optionalField" class="input">${choiceOptions(choices, "没有可添加字段")}</select><button id="addOptional" class="btn" ${choices.length ? "" : "disabled"}>添加</button></div>
          <button id="apply" class="btn primary" style="width:100%;margin-top:12px">应用修改</button>`;
        bindEditorEvents(step);
    }

    function bindEditorEvents(step) {
        enhanceRoleEditors($("editor"));
        const recordButton = $("recordPath");
        if (recordButton) recordButton.onclick = async () => {
            if (state.recording || !applyEditor()) return;
            state.recording = true;
            recordButton.disabled = true;
            recordButton.textContent = "打开中";
            setStatus("正在打开路径录制器...");
            try {
                const result = await request("/recordPath", {
                    scope: currentScope(),
                    fileName: currentFileName(),
                    create: state.create && !state.savedScope,
                });
                if (result.status === "error") throw new Error(result.message);
                if (result.status === "saved") {
                    if (state.create && result.scope) state.savedScope = result.scope;
                    step.data = result.fileName;
                    const input = $("singleData");
                    if (input) input.value = result.fileName;
                    markDirty();
                    setStatus("路径已录制并回填：" + result.fileName, "ok");
                    refreshTarget();
                } else {
                    setStatus("已取消路径录制");
                }
            } catch (error) {
                setStatus(error.message, "error");
            } finally {
                state.recording = false;
                if ($("recordPath")) {
                    $("recordPath").disabled = false;
                    $("recordPath").textContent = "打开录制";
                }
            }
        };
        $("editType").onchange = () => {
            preserveEditorDraft(step);
            const oldData = step.data && typeof step.data === "object" && !Array.isArray(step.data) ? step.data : {};
            const nextType = $("editType").value;
            const next = defaultData(nextType);
            if (next && typeof next === "object" && !Array.isArray(next)) {
                const nextFields = processor(nextType)?.dataSpec?.fields || {};
                for (const name of Object.keys(nextFields)) {
                    if (oldData[name] !== undefined) next[name] = oldData[name];
                }
            }
            step.type = nextType;
            step.data = next;
            resetShownFields(step);
            markDirty();
            renderEditor();
        };
        $("addOptional").onclick = () => {
            const value = $("optionalField").value;
            if (!value) return;
            if (!preserveEditorDraft(step, true)) return;
            if (value === "data") {
                state.dataVisible = true;
                showOnlyDataField(step);
            }
            else if (value.startsWith("common:")) state.shownCommon.add(value.slice("common:".length));
            renderEditor();
        };
        const addDataOptional = $("addDataOptional");
        if (addDataOptional) addDataOptional.onclick = () => {
            const name = $("dataOptionalField").value;
            if (!name) return;
            if (!preserveEditorDraft(step, true)) return;
            state.shownData.add(name);
            renderEditor();
        };
        $("apply").onclick = applyEditor;
        $("editor").onclick = event => {
            const removeCommon = event.target.dataset.removeCommon;
            const removeData = event.target.dataset.removeData;
            if (removeCommon) {
                preserveEditorDraft(step);
                state.shownCommon.delete(removeCommon);
                delete step[removeCommon];
                markDirty();
                renderEditor();
            } else if (event.target.dataset.removeDataContainer !== undefined) {
                preserveEditorDraft(step);
                state.dataVisible = false;
                state.shownData.clear();
                delete step.data;
                markDirty();
                renderEditor();
            } else if (removeData) {
                preserveEditorDraft(step);
                state.shownData.delete(removeData);
                if (step.data && typeof step.data === "object") delete step.data[removeData];
                markDirty();
                renderEditor();
            } else if (event.target.dataset.arrayAdd !== undefined) {
                const list = event.target.previousElementSibling;
                list.insertAdjacentHTML("beforeend", renderArrayRow("", list.children.length));
                markDirty();
            } else if (event.target.dataset.arrayAction) {
                moveArrayRow(event.target);
                markDirty();
            } else if (event.target.dataset.locMode) {
                switchLocMode(event.target.dataset.locMode);
                markDirty();
            } else if (event.target.id === "addLocPoint") {
                $("locRows").insertAdjacentHTML("beforeend", renderLocRow(["", "", ""], $("locRows").children.length, true));
                markDirty();
            } else if (event.target.dataset.locDelete !== undefined) {
                event.target.closest(".loc-row").remove();
                markDirty();
            } else if (event.target.dataset.waveAdd !== undefined) {
                const waves = event.target.previousElementSibling;
                const numbers = Array.from(waves.querySelectorAll("[data-wave-number]")).map(input => Number(input.value) || 0);
                waves.insertAdjacentHTML("beforeend", renderWave(Math.max(0, ...numbers) + 1));
                window.MaskSelect?.enhance(waves.lastElementChild);
                markDirty();
            } else if (event.target.dataset.waveDelete !== undefined) {
                event.target.closest("[data-wave-card]").remove();
                markDirty();
            } else if (event.target.dataset.waveAddRoute !== undefined) {
                const routes = event.target.closest("[data-wave-card]").querySelector("[data-wave-routes]");
                routes.insertAdjacentHTML("beforeend", renderWaveRoute());
                markDirty();
            } else if (event.target.dataset.waveDeleteRoute !== undefined) {
                event.target.closest("[data-wave-route]").remove();
                markDirty();
            }
        };
        $("editor").oninput = markDirty;
        $("editor").onchange = event => {
            const branchType = event.target.closest("[data-branch-type]");
            if (branchType) {
                const card = branchType.closest("[data-branch-key]");
                card.querySelector("[data-branch-data]").innerHTML = renderNestedData(branchType.value, defaultData(branchType.value));
                window.MaskSelect?.enhance(card.querySelector("[data-branch-data]"));
                enhanceRoleEditors(card.querySelector("[data-branch-data]"));
            }
            const nestedField = event.target.closest("[data-nested-field]");
            const nestedCard = nestedField?.closest("[data-branch-key]");
            if (nestedCard && nestedCard.querySelector("[data-branch-type]").value === "自动任务" &&
                (nestedField.dataset.nestedField === "action" || nestedField.dataset.nestedField === "taskType")) {
                const nestedData = readNestedData(nestedCard, "自动任务") || { action: "enable", taskType: "AutoSkip" };
                if (nestedData.action === "enable" && !nestedData.taskType) nestedData.taskType = "AutoSkip";
                nestedCard.querySelector("[data-branch-data]").innerHTML = renderNestedData("自动任务", nestedData);
                window.MaskSelect?.enhance(nestedCard.querySelector("[data-branch-data]"));
                enhanceRoleEditors(nestedCard.querySelector("[data-branch-data]"));
            } else if (nestedCard && nestedCard.querySelector("[data-branch-type]").value === "摧毁哨塔" &&
                nestedField.dataset.nestedField === "navigation") {
                const nestedData = readNestedData(nestedCard, "摧毁哨塔") || {};
                if (nestedData.navigation !== "路径追踪") delete nestedData.path;
                nestedCard.querySelector("[data-branch-data]").innerHTML = renderNestedData("摧毁哨塔", nestedData);
                window.MaskSelect?.enhance(nestedCard.querySelector("[data-branch-data]"));
                enhanceRoleEditors(nestedCard.querySelector("[data-branch-data]"));
            }
            const field = event.target.closest("[data-field-name]");
            if (step.type === "自动任务" && field && (field.dataset.fieldName === "action" || field.dataset.fieldName === "taskType")) {
                try {
                    step.data = readData(step);
                    if (step.data.action === "disable") {
                        delete step.data.taskType;
                        delete step.data.config;
                    } else {
                        if (!step.data.taskType) step.data.taskType = "AutoSkip";
                        if (step.data.taskType !== "AutoPick") delete step.data.config;
                    }
                    resetShownFields(step);
                    renderEditor();
                } catch (error) {
                    setStatus(error.message, "error");
                }
            } else if (step.type === "摧毁哨塔" && field?.dataset.fieldName === "navigation") {
                step.data = readData(step) || {};
                if (step.data.navigation === "路径追踪") state.shownData.add("path");
                else {
                    state.shownData.delete("path");
                    delete step.data.path;
                }
                renderEditor();
            }
            markDirty();
        };
    }

    function moveArrayRow(button) {
        const row = button.closest(".array-row");
        const list = row.parentElement;
        if (button.dataset.arrayAction === "delete") row.remove();
        else if (button.dataset.arrayAction === "up" && row.previousElementSibling) list.insertBefore(row, row.previousElementSibling);
        else if (button.dataset.arrayAction === "down" && row.nextElementSibling) list.insertBefore(row.nextElementSibling, row);
    }

    function switchLocMode(mode) {
        const rows = readLocRows(false);
        const points = rows.length ? rows : [["", "", ""]];
        $("locRows").dataset.mode = mode;
        $("locRows").innerHTML = (mode === "single" ? [points[0]] : points).map((point, index) => renderLocRow(point, index, mode === "multiple")).join("");
        const add = $("addLocPoint");
        if (mode === "multiple" && !add) $("locRows").insertAdjacentHTML("afterend", '<button class="btn" id="addLocPoint">添加坐标</button>');
        if (mode === "single" && add) add.remove();
        $("editor").querySelectorAll("[data-loc-mode]").forEach(button => button.classList.toggle("active", button.dataset.locMode === mode));
    }

    function readLocRows(validate = true) {
        const rows = Array.from($("locRows")?.querySelectorAll(".loc-row") || []);
        if (validate && !rows.length) throw new Error("loc 至少需要一个坐标点");
        return rows.map(row => {
            const x = row.querySelector('[data-loc="x"]').value;
            const y = row.querySelector('[data-loc="y"]').value;
            const tolerance = row.querySelector('[data-loc="tolerance"]').value;
            if (validate && (x === "" || y === "")) throw new Error("loc 的 x 和 y 必填");
            const xValue = x === "" ? "" : Number(x);
            const yValue = y === "" ? "" : Number(y);
            const toleranceValue = tolerance === "" ? "" : Number(tolerance);
            if (validate && (!Number.isFinite(xValue) || !Number.isFinite(yValue))) throw new Error("loc 的 x 和 y 必须是有限数字");
            if (validate && toleranceValue !== "" && (!Number.isFinite(toleranceValue) || toleranceValue <= 0)) {
                throw new Error("loc 的容差必须是大于 0 的有限数字");
            }
            const point = [xValue, yValue];
            if (toleranceValue !== "") point.push(toleranceValue);
            return point;
        });
    }

    function readObjectData(meta, root = $("dataFields")) {
        const data = {};
        root?.querySelectorAll(":scope > .data-field").forEach(section => {
            const name = section.dataset.fieldName;
            const type = section.dataset.fieldType;
            const field = meta.fields[name];
            if (type === "array") {
                const values = Array.from(section.querySelectorAll("[data-array-value]")).map(input => input.value.trim()).filter(Boolean);
                if (!values.length && field?.required) throw new Error((field.label || name) + "至少需要一项");
                if (values.length) data[name] = values;
                return;
            }
            if (type === "object") {
                const textList = Array.from(section.querySelectorAll("[data-autopick-text]"))
                    .flatMap(input => input.value.split(/\r?\n/)).map(value => value.trim()).filter(Boolean);
                const config = { ForceInteraction: section.querySelector("[data-autopick-force]").value === "true" };
                if (textList.length) config.TextList = textList;
                data[name] = config;
                return;
            }
            const value = section.querySelector("[data-data-value]").value.trim();
            if (!value) {
                if (field?.required) throw new Error((field.label || name) + "必填");
                return;
            }
            data[name] = type === "number" ? parseNumber(value, field, field.label || name) : type === "boolean" ? value === "true" : value;
        });
        return Object.keys(data).length || !meta.optional ? data : undefined;
    }

    function readRolesData(root) {
        const roles = {};
        const names = new Set();
        root.querySelectorAll("[data-role-slot]").forEach(input => {
            const name = input.value.trim();
            if (!name) return;
            if (names.has(name)) throw new Error("角色不能重复：" + name);
            names.add(name);
            roles[input.dataset.roleSlot] = name;
        });
        if (!Object.keys(roles).length) throw new Error("至少需要配置一个角色");
        return roles;
    }

    function readNestedData(card, type) {
        const spec = processor(type)?.dataSpec;
        if (!spec || spec.kind === "none") return undefined;
        if (spec.kind === "string" || spec.kind === "number") {
            const value = card.querySelector("[data-nested-single]").value.trim();
            if (!value && !spec.optional) throw new Error((spec.label || type + " data") + "必填");
            if (!value) return undefined;
            return spec.kind === "number" ? parseNumber(value, spec, spec.label || type + " data") : value;
        }
        if (spec.kind === "custom") {
            if (spec.editor === "key") {
                const action = card.querySelector("[data-key-action]").value;
                const key = card.querySelector("[data-key-value]").value.trim();
                return action === "press" ? key : { key, action };
            }
            if (spec.editor === "roles") {
                return readRolesData(card);
            }
            if (spec.editor === "waves") return readWavesData(card);
            throw new Error(type + " 不能作为分支内嵌步骤");
        }
        if (spec.kind !== "object") throw new Error(type + " 不能作为分支内嵌步骤");
        const data = {};
        card.querySelectorAll("[data-nested-field]").forEach(section => {
            const name = section.dataset.nestedField;
            const field = spec.fields[name];
            const typeName = section.dataset.nestedType;
            if (typeName === "array") {
                const values = section.querySelector("[data-nested-value]").value.split(/\r?\n/).map(value => value.trim()).filter(Boolean);
                if (!values.length && field.required) throw new Error((field.label || name) + "至少需要一项");
                if (values.length) data[name] = values;
                return;
            }
            if (typeName === "object") {
                const textList = section.querySelector("[data-autopick-text]").value.split(/\r?\n/).map(value => value.trim()).filter(Boolean);
                const force = section.querySelector("[data-autopick-force]").value === "true";
                if (textList.length || force) data[name] = Object.assign({ ForceInteraction: force }, textList.length ? { TextList: textList } : {});
                return;
            }
            const value = section.querySelector("[data-nested-value]").value.trim();
            if (!value) {
                if (field.required) throw new Error((field.label || name) + "必填");
                return;
            }
            data[name] = typeName === "number" ? parseNumber(value, field, field.label || name) : typeName === "boolean" ? value === "true" : value;
        });
        if (type === "自动任务") {
            if (data.action === "disable") {
                delete data.taskType;
                delete data.config;
            } else if (data.taskType !== "AutoPick") {
                delete data.config;
            }
        }
        return Object.keys(data).length || !spec.optional ? data : undefined;
    }

    function readBranchesData() {
        if (!state.branches.length) throw new Error("当前委托没有分支配置，不能编辑用户分支选择");
        const data = {};
        $("editor").querySelectorAll("[data-branch-key]").forEach(card => {
            const type = card.querySelector("[data-branch-type]").value;
            const nested = { type };
            const nestedData = readNestedData(card, type);
            if (nestedData !== undefined) nested.data = nestedData;
            const note = card.querySelector("[data-branch-note]").value.trim();
            if (note) nested.note = note;
            data[card.dataset.branchKey] = nested;
        });
        return data;
    }

    function readWavesData(root = $("editor")) {
        const data = {};
        const timeout = root.querySelector("[data-wave-timeout]").value.trim();
        if (timeout) {
            const timeoutValue = Number(timeout);
            if (!Number.isInteger(timeoutValue) || timeoutValue <= 0) throw new Error("总超时必须是正整数秒");
            data.timeout = timeoutValue;
        }
        const seenWaves = new Set();
        root.querySelectorAll("[data-wave-card]").forEach(card => {
            const waveNumber = Number(card.querySelector("[data-wave-number]").value);
            if (!Number.isInteger(waveNumber) || waveNumber < 1) throw new Error("波次必须是正整数");
            if (seenWaves.has(waveNumber)) throw new Error("波次不能重复：" + waveNumber);
            seenWaves.add(waveNumber);
            const routes = {};
            card.querySelectorAll("[data-wave-route]").forEach(row => {
                const condition = row.querySelector("[data-wave-condition]").value.trim();
                const path = row.querySelector("[data-wave-path]").value.trim();
                if (!/^(?:-1|0|[1-9]\d*)$/.test(condition)) throw new Error("路径条件只能是 -1 或非负整数");
                if (Object.prototype.hasOwnProperty.call(routes, condition)) throw new Error("波次 " + waveNumber + " 的条件重复：" + condition);
                if (!path) throw new Error("波次 " + waveNumber + " 的路径文件不能为空");
                routes[condition] = path;
            });
            if (!Object.keys(routes).length) throw new Error("波次 " + waveNumber + " 至少需要一条路径条件");
            data["wave" + waveNumber] = routes;
        });
        if (!seenWaves.size) throw new Error("至少需要配置一个波次");
        return data;
    }

    function readData(step) {
        const meta = processor(step.type)?.dataSpec;
        if (!meta) throw new Error(step.type + " 缺少 dataSpec");
        if (meta.kind === "object") return readObjectData(meta);
        if (meta.kind === "none") return undefined;
        if (meta.kind === "custom") {
            if (meta.editor === "key") {
                const action = $("editor").querySelector("[data-key-action]").value;
                const key = $("editor").querySelector("[data-key-value]").value.trim();
                return action === "press" ? key : { key, action };
            }
            if (meta.editor === "roles") {
                return readRolesData($("editor"));
            }
            if (meta.editor === "waves") return readWavesData();
            if (meta.editor === "branches") return readBranchesData();
            throw new Error("未知专用 data 编辑器: " + meta.editor);
        }
        if (meta.kind === "number" || meta.kind === "string") {
            const value = $("singleData").value.trim();
            if (!value && !meta.optional) throw new Error((meta.label || "data") + "必填");
            if (!value) return undefined;
            return meta.kind === "number" ? parseNumber(value, meta, meta.label || "data") : value;
        }
        return undefined;
    }

    function applyEditor() {
        const step = state.steps[state.selected];
        if (!step) return true;
        try {
            if (state.dataVisible) {
                const data = readData(step);
                if (data === undefined) delete step.data;
                else step.data = data;
            } else {
                delete step.data;
            }
            for (const name of COMMON_FIELDS) {
                if (!state.shownCommon.has(name)) {
                    delete step[name];
                    continue;
                }
                if (name === "loc") {
                    const points = readLocRows();
                    step.loc = $("locRows").dataset.mode === "multiple" ? points : points[0];
                } else {
                    const value = $("common-" + name).value.trim();
                    if (!value) delete step[name];
                    else if (name === "retry") {
                        const retry = Number(value);
                        if (!Number.isInteger(retry) || retry < 0) throw new Error("retry 必须是非负整数");
                        step[name] = retry;
                    } else step[name] = value;
                }
            }
            renderSteps();
            markDirty();
            setStatus("修改已应用，尚未保存");
            return true;
        } catch (error) {
            setStatus("字段格式错误：" + error.message, "error");
            return false;
        }
    }

    function selectExistingScope(scope) {
        setMode(false);
        $("countrySelect").value = scope.country;
        refreshCascade("country");
        $("typeSelect").value = scope.typeDir;
        refreshCascade("type");
        $("commissionSelect").value = scope.commissionName;
        refreshCascade("commission");
        $("locationSelect").value = scope.locationDir;
    }

    async function loadFile(skipConfirm = false, requestedScope = null, requestedFileName = null) {
        if (state.loading) return;
        if (!skipConfirm && !(await confirmDiscard("打开其他流程"))) return;
        state.loading = true;
        $("load").disabled = true;
        $("save").disabled = true;
        $("load").textContent = "读取中";
        setStatus("正在读取...");
        try {
            const result = await request("/load", {
                scope: requestedScope || currentScope(),
                fileName: requestedFileName || currentFileName(),
            });
            if (result.status === "error") throw new Error(result.message);
            const loadedSteps = JSON.parse(result.content);
            if (!Array.isArray(loadedSteps)) throw new Error("流程文件根节点必须是步骤数组");
            state.steps = loadedSteps;
            state.branches = result.branches || [];
            state.selected = -1;
            state.dirty = false;
            state.loadedPath = result.path;
            state.recentFiles = result.recentFiles || state.recentFiles;
            $("path").textContent = result.path;
            renderRecentFiles();
            renderSteps();
            setStatus("已加载", "ok");
            refreshTarget();
        } catch (error) {
            setStatus(error.message, "error");
        } finally {
            state.loading = false;
            $("load").disabled = false;
            $("load").textContent = "打开";
            refreshTarget();
        }
    }

    function clearDragMarks() {
        document.querySelectorAll(".step").forEach(row => row.classList.remove("drag-before", "drag-after"));
    }

    $("countrySelect").onchange = () => { state.loadedPath = null; refreshCascade("country"); refreshTarget(); };
    $("typeSelect").onchange = () => { state.loadedPath = null; refreshCascade("type"); refreshTarget(); };
    $("commissionSelect").onchange = () => { state.loadedPath = null; refreshCascade("commission"); refreshTarget(); };
    $("locationSelect").onchange = () => { state.loadedPath = null; refreshTarget(); };
    async function switchMode(create) {
        if (state.create === create) return;
        if (!(await confirmDiscard("切换模式"))) return;
        state.steps = [];
        state.selected = -1;
        state.dirty = false;
        setMode(create);
        renderSteps();
        setStatus(create ? "填写信息即可新增委托" : "请选择委托并点击打开");
    }

    $("existingMode").onclick = () => switchMode(false);
    $("newMode").onclick = () => switchMode(true);
    $("type").onchange = () => { state.savedScope = null; refreshTarget(); };
    $("commission").oninput = () => { state.savedScope = null; refreshTarget(); };
    $("fileName").oninput = () => { state.savedScope = null; refreshTarget(); };
    $("load").onclick = () => loadFile();
    $("recentFiles").onclick = async event => {
        const button = event.target.closest("[data-recent-index]");
        if (!button || state.loading) return;
        const item = state.recentFiles[Number(button.dataset.recentIndex)];
        if (!item || !(await confirmDiscard("打开最近流程"))) return;
        selectExistingScope(item.scope);
        await loadFile(true, item.scope, item.fileName);
    };
    $("steps").onclick = event => {
        if (event.target.closest(".drag-handle")) return;
        const row = event.target.closest(".step");
        if (!row) return;
        const index = Number(row.dataset.index);
        const action = event.target.dataset.action;
        if (!action) {
            state.selected = index;
            resetShownFields(state.steps[index]);
        } else if (action === "delete") {
            state.steps.splice(index, 1);
            state.selected = -1;
            markDirty();
        } else if (action === "copy") {
            state.steps.splice(index + 1, 0, JSON.parse(JSON.stringify(state.steps[index])));
            state.selected = index + 1;
            resetShownFields(state.steps[state.selected]);
            markDirty();
        }
        renderSteps();
    };
    $("steps").addEventListener("dragstart", event => {
        const handle = event.target.closest(".drag-handle");
        if (!handle) return event.preventDefault();
        state.dragIndex = Number(handle.closest(".step").dataset.index);
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", String(state.dragIndex));
    });
    $("steps").addEventListener("dragover", event => {
        const row = event.target.closest(".step");
        if (!row || state.dragIndex < 0) return;
        event.preventDefault();
        clearDragMarks();
        const after = event.clientY > row.getBoundingClientRect().top + row.offsetHeight / 2;
        row.classList.add(after ? "drag-after" : "drag-before");
    });
    $("steps").addEventListener("drop", event => {
        const row = event.target.closest(".step");
        if (!row || state.dragIndex < 0) return;
        event.preventDefault();
        const target = Number(row.dataset.index);
        const after = event.clientY > row.getBoundingClientRect().top + row.offsetHeight / 2;
        const step = state.steps.splice(state.dragIndex, 1)[0];
        let insert = target + (after ? 1 : 0);
        if (state.dragIndex < insert) insert--;
        state.steps.splice(insert, 0, step);
        state.selected = insert;
        state.dragIndex = -1;
        clearDragMarks();
        resetShownFields(step);
        markDirty();
        renderSteps();
    });
    $("steps").addEventListener("dragend", () => {
        state.dragIndex = -1;
        clearDragMarks();
    });
    $("add").onclick = () => {
        const type = $("newType").value;
        const step = { type };
        const data = defaultData(type);
        if (data !== undefined) step.data = data;
        state.steps.push(step);
        state.selected = state.steps.length - 1;
        resetShownFields(state.steps[state.selected]);
        markDirty();
        renderSteps();
    };
    $("clearSteps").onclick = async () => {
        if (!state.steps.length) return;
        if (!(await confirmDiscard("清除全部步骤"))) return;
        state.steps = [];
        state.selected = -1;
        renderSteps();
        markDirty();
        setStatus("已清除，尚未保存");
    };
    const content = () => JSON.stringify(state.steps, null, 4);
    $("validate").onclick = async () => {
        if (!applyEditor()) return;
        try {
            const result = await request("/validate", {
                scope: currentScope(),
                fileName: currentFileName(),
                content: content(),
                create: state.create && !state.savedScope,
            });
            if (result.status === "error" && result.message) throw new Error(result.message);
            setStatus(diagnosticText(result), result.status === "error" ? "error" : result.status === "warning" ? "warning" : "ok");
        } catch (error) {
            setStatus(error.message, "error");
        }
    };
    $("save").onclick = async () => {
        if (state.saving || $("save").disabled) return;
        if (!applyEditor()) return;
        state.saving = true;
        $("save").disabled = true;
        $("save").textContent = "处理中";
        try {
            const result = await request("/save", {
                scope: currentScope(),
                fileName: currentFileName(),
                content: content(),
                create: state.create && !state.savedScope,
            });
            if (result.status === "error") throw new Error(result.message);
            if (state.create && result.scope) state.savedScope = result.scope;
            state.steps = JSON.parse(result.content);
            state.selected = -1;
            state.dirty = false;
            state.loadedPath = result.path;
            $("path").textContent = result.path;
            renderSteps();
            const warnings = result.warnings || [];
            setStatus(warnings.length ? "已保存：" + result.path + "\n警告：\n" + warnings.join("\n") : "已保存：" + result.path,
                warnings.length ? "warning" : "ok");
        } catch (error) {
            setStatus(error.message, "error");
        } finally {
            state.saving = false;
            refreshTarget();
        }
    };
    $("close").onclick = async () => {
        if (!(await confirmDiscard("关闭编辑器"))) return;
        request("/close").catch(() => {});
    };
    $("confirmCancel").onclick = () => closeConfirmation(false);
    $("confirmAccept").onclick = () => closeConfirmation(true);
    document.addEventListener("keydown", event => {
        if (!state.confirmResolve) return;
        if (event.key === "Escape") {
            event.preventDefault();
            closeConfirmation(false);
        } else if (event.key === "Enter") {
            event.preventDefault();
            closeConfirmation(true);
        }
    });
    document.addEventListener("mousedown", event => {
        if (countryCombo && !countryCombo.contains(event.target)) countryCombo.close();
        if (locationCombo && !locationCombo.contains(event.target)) locationCombo.close();
        closeRoleEditors(event.target);
    });

    window.htmlMask.onMessage = message => {
        if (message?.url !== "/toggleVisibility") return;
        document.querySelector(".app").style.visibility = message.data?.visible === false ? "hidden" : "visible";
    };

    request("/init").then(result => {
        state.scopes = result.scopes || [];
        state.processors = result.processors || [];
        state.roles = result.roles || [];
        state.recentFiles = result.recentFiles || [];
        renderRecentFiles();
        countryCombo = createEditableSelect($("countryCombo"), () => {
            state.savedScope = null;
            refreshNewLocationOptions();
            refreshTarget();
        });
        locationCombo = createEditableSelect($("locationCombo"), () => {
            state.savedScope = null;
            refreshTarget();
        });
        setGroupedStepOptions($("newType"), state.processors[0]?.type);
        const countries = orderedCountries(state.scopes.map(scope => scope.country));
        setOptions($("countrySelect"), countries);
        countryCombo.setItems(countries);
        refreshNewLocationOptions();
        refreshCascade("country");
        setMode(false);
        state.steps = [];
        state.selected = -1;
        renderSteps();
        if (state.scopes.length) {
            setStatus("请选择委托并点击打开");
        } else {
            setMode(true);
            setStatus("填写信息即可新增委托");
        }
    }).catch(error => setStatus(error.message, "error"));
})();
