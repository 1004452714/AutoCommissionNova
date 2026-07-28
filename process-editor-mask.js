(function () {
    "use strict";

    const COMMON_FIELDS = ["note", "desc", "loc", "retry", "retryOn"];
    const COUNTRY_ORDER = ["蒙德", "璃月", "稻妻", "须弥", "枫丹", "纳塔", "挪德卡莱"];
    const state = {
        scopes: [],
        processors: [],
        steps: [],
        selected: -1,
        create: false,
        savedScope: null,
        shownCommon: new Set(),
        shownData: new Set(),
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
    const request = (url, data = {}) => Promise.resolve(window.htmlMask.request(url, data)).then(result => result.data || result);
    const escapeHtml = value => String(value ?? "").replace(/[&<>"]/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[char]);

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

    function createEditableSelect(root, onValueChange) {
        const input = root.querySelector("input");
        const toggle = root.querySelector(".editable-toggle");
        const optionsElement = root.querySelector(".editable-options");
        let items = [];
        let filtered = [];
        let activeIndex = -1;

        function close() {
            root.classList.remove("open");
            optionsElement.classList.add("hidden");
            input.setAttribute("aria-expanded", "false");
            activeIndex = -1;
        }

        function render() {
            const query = input.value.trim().toLowerCase();
            filtered = items.filter(item => !query || item.toLowerCase().includes(query));
            if (activeIndex >= filtered.length) activeIndex = filtered.length - 1;
            optionsElement.innerHTML = filtered.length
                ? filtered.map((item, index) => `<li class="editable-option ${index === activeIndex ? "active" : ""}" data-value="${escapeHtml(item)}" role="option" aria-selected="${index === activeIndex}">${escapeHtml(item)}</li>`).join("")
                : '<li class="editable-empty">没有匹配项，可直接输入新值</li>';
        }

        function open() {
            render();
            root.classList.add("open");
            optionsElement.classList.remove("hidden");
            input.setAttribute("aria-expanded", "true");
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

        input.addEventListener("focus", open);
        input.addEventListener("click", open);
        input.addEventListener("input", () => {
            activeIndex = -1;
            open();
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
            }
        });
        toggle.addEventListener("mousedown", event => {
            event.preventDefault();
            if (root.classList.contains("open")) close();
            else {
                input.focus();
                open();
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

    function filteredScopes() {
        return state.scopes.filter(scope =>
            (!$( "countrySelect").value || scope.country === $("countrySelect").value) &&
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

    function defaultData(type) {
        const meta = processor(type)?.editor || { kind: "structured" };
        if (meta.kind !== "object") {
            if (meta.kind === "none") return undefined;
            if (meta.kind === "structured") return {};
            return meta.kind === "number" ? 0 : "";
        }
        const data = {};
        for (const [name, field] of Object.entries(meta.fields || {})) {
            if (field.required) data[name] = defaultForType(field.type);
        }
        return data;
    }

    function resetShownFields(step) {
        state.shownCommon = new Set(COMMON_FIELDS.filter(name => step && step[name] !== undefined));
        const fields = processor(step?.type)?.editor?.fields || {};
        state.shownData = new Set(Object.keys(fields).filter(name => fields[name].required || fields[name].alwaysVisible || step?.data?.[name] !== undefined));
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
          <div class="field-head"><label class="label${field.required ? " required" : ""}">${escapeHtml(field.label || name)}</label>${field.required ? "" : '<button class="mini danger" data-remove-data="' + escapeHtml(name) + '">移除</button>'}</div>
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

    function structuredType(value) {
        if (value === null) return "null";
        if (Array.isArray(value)) return "array";
        if (typeof value === "object") return "object";
        if (typeof value === "number") return "number";
        if (typeof value === "boolean") return "boolean";
        return "string";
    }

    function defaultStructuredValue(type) {
        if (type === "object") return {};
        if (type === "array") return [];
        if (type === "number") return 0;
        if (type === "boolean") return false;
        if (type === "null") return null;
        return "";
    }

    function renderStructuredNode(value) {
        const type = structuredType(value);
        const options = ["string", "number", "boolean", "object", "array", "null"]
            .map(option => `<option value="${option}" ${option === type ? "selected" : ""}>${option}</option>`).join("");
        let body;
        if (type === "object") {
            body = `<div class="structured-body" data-structured-body>${Object.entries(value).map(([key, item]) => renderStructuredEntry(key, item, false)).join("")}</div><button class="btn structured-add" data-structured-add="object" type="button">添加属性</button>`;
        } else if (type === "array") {
            body = `<div class="structured-body" data-structured-body>${value.map(item => renderStructuredEntry("", item, true)).join("")}</div><button class="btn structured-add" data-structured-add="array" type="button">添加元素</button>`;
        } else if (type === "boolean") {
            body = `<select class="input" data-structured-value><option value="true" ${value ? "selected" : ""}>true</option><option value="false" ${value ? "" : "selected"}>false</option></select>`;
        } else if (type === "number") {
            body = `<input class="input" data-structured-value type="number" value="${escapeHtml(value)}">`;
        } else if (type === "null") {
            body = '<div class="field-note">值为 null</div>';
        } else {
            body = `<input class="input" data-structured-value value="${escapeHtml(value)}">`;
        }
        return `<div class="structured-node" data-structured-node><div class="structured-head"><select class="input" data-structured-type>${options}</select></div>${body}</div>`;
    }

    function renderStructuredEntry(key, value, arrayEntry) {
        const ordering = arrayEntry ? '<button class="btn icon" data-structured-action="up" type="button" title="上移">↑</button><button class="btn icon" data-structured-action="down" type="button" title="下移">↓</button>' : "";
        return `<div class="structured-entry ${arrayEntry ? "array-entry" : ""}" data-structured-entry>${arrayEntry ? "" : `<input class="input" data-structured-key placeholder="字段名" value="${escapeHtml(key)}">`}${renderStructuredNode(value)}${ordering}<button class="btn icon danger" data-structured-delete type="button" title="删除">×</button></div>`;
    }

    function structuredBody(node) {
        return Array.from(node.children).find(child => child.dataset.structuredBody !== undefined);
    }

    function readStructuredNode(node) {
        const type = node.querySelector(":scope > .structured-head [data-structured-type]").value;
        if (type === "null") return null;
        if (type === "boolean") return node.querySelector(":scope > [data-structured-value]").value === "true";
        if (type === "number") {
            const raw = node.querySelector(":scope > [data-structured-value]").value.trim();
            if (!raw) throw new Error("数字值不能为空");
            return Number(raw);
        }
        if (type === "string") return node.querySelector(":scope > [data-structured-value]").value;
        const entries = Array.from(structuredBody(node)?.children || []);
        if (type === "array") return entries.map(entry => readStructuredNode(entry.querySelector(":scope > [data-structured-node]")));
        const result = {};
        for (const entry of entries) {
            const key = entry.querySelector(":scope > [data-structured-key]").value.trim();
            if (!key) throw new Error("对象字段名不能为空");
            if (Object.prototype.hasOwnProperty.call(result, key)) throw new Error("对象字段名重复：" + key);
            result[key] = readStructuredNode(entry.querySelector(":scope > [data-structured-node]"));
        }
        return result;
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
            control = `<div data-data-structured>${renderStructuredNode(value && typeof value === "object" && !Array.isArray(value) ? value : {})}</div>`;
        } else if (field.options) {
            control = `<select class="input" data-data-value>${field.options.map(option => {
                const optionValue = typeof option === "object" ? option.value : option;
                const optionLabel = typeof option === "object" ? option.label : option;
                return `<option value="${escapeHtml(optionValue)}" ${value === optionValue ? "selected" : ""}>${escapeHtml(optionLabel)}</option>`;
            }).join("")}</select>`;
        } else {
            control = `<input class="input" data-data-value type="${field.type === "number" ? "number" : "text"}" value="${escapeHtml(value ?? "")}">`;
        }
        return `<section class="data-field" data-field-name="${escapeHtml(name)}" data-field-type="${escapeHtml(field.type || "string")}"><div class="field-head"><label class="label${required}">${escapeHtml(field.label || name)}</label>${remove}</div>${control}<div class="field-note">${escapeHtml(field.hint || (field.required ? "必填" : "可选"))}</div></section>`;
    }

    function renderLoc(step) {
        const loc = step.loc;
        const multiple = Array.isArray(loc) && Array.isArray(loc[0]);
        const points = multiple ? loc : [Array.isArray(loc) ? loc : ["", "", ""]];
        return `<section id="locField"><div class="field-head"><label class="label">位置 loc</label><button class="mini danger" data-remove-common="loc">移除</button></div>
          <div class="mode"><button class="btn ${multiple ? "" : "active"}" data-loc-mode="single">单点</button><button class="btn ${multiple ? "active" : ""}" data-loc-mode="multiple">多点</button></div>
          <div id="locRows" data-mode="${multiple ? "multiple" : "single"}">${points.map((point, index) => renderLocRow(point, index, multiple)).join("")}</div>
          ${multiple ? '<button class="btn" id="addLocPoint">添加坐标</button>' : ""}
          <div class="field-note">单点保存为 [x, y, tolerance]；多点保存为 [[x, y], ...]。容差留空时默认 15 且不会写入数组。</div></section>`;
    }

    function renderLocRow(point, index, multiple) {
        return `<div class="loc-row"><input class="input" data-loc="x" type="number" placeholder="x" value="${escapeHtml(point?.[0] ?? "")}"><input class="input" data-loc="y" type="number" placeholder="y" value="${escapeHtml(point?.[1] ?? "")}"><input class="input" data-loc="tolerance" type="number" placeholder="容差（可选）" value="${escapeHtml(point?.[2] ?? "")}">${multiple ? `<button class="btn icon danger" data-loc-delete="${index}">×</button>` : "<span></span>"}</div>`;
    }

    function renderCommonField(name, step) {
        const labels = { note: "说明 note", desc: "条件 desc", retry: "重试次数 retry", retryOn: "重试条件 retryOn" };
        if (name === "loc") return renderLoc(step);
        const control = name === "retryOn"
            ? `<select id="common-${name}" class="input"><option value="">默认</option><option ${step[name] === "throw" ? "selected" : ""}>throw</option><option ${step[name] === "return-false" ? "selected" : ""}>return-false</option><option ${step[name] === "all" ? "selected" : ""}>all</option></select>`
            : `<input id="common-${name}" class="input" type="${name === "retry" ? "number" : "text"}" min="0" value="${escapeHtml(step[name] ?? "")}">`;
        return `<section><div class="field-head"><label class="label">${labels[name]}</label><button class="mini danger" data-remove-common="${name}">移除</button></div>${control}</section>`;
    }

    function optionalChoices(step) {
        const meta = processor(step.type)?.editor || {};
        const common = COMMON_FIELDS.filter(name => !state.shownCommon.has(name)).map(name => ({ value: "common:" + name, label: name }));
        const data = Object.entries(meta.fields || {}).filter(([name, field]) => !field.required && !state.shownData.has(name)).map(([name]) => ({ value: "data:" + name, label: "data." + name }));
        return common.concat(data);
    }

    function renderDataEditor(step) {
        const meta = processor(step.type)?.editor || { kind: "structured", label: "data" };
        if (meta.kind === "object") {
            const data = step.data && typeof step.data === "object" && !Array.isArray(step.data) ? step.data : {};
            const fields = Object.entries(meta.fields || {}).filter(([name, field]) => field.required || field.alwaysVisible || state.shownData.has(name))
                .map(([name, field]) => renderDataField(name, field, data[name])).join("");
            const extras = Object.fromEntries(Object.entries(data).filter(([name]) => !(name in (meta.fields || {}))));
            const extraEditor = meta.allowExtras === false
                ? ""
                : `<label class="label">附加 data 字段</label><div id="extraData">${renderStructuredNode(extras)}</div>`;
            return `<div id="dataFields">${fields}</div>${extraEditor}`;
        }
        if (meta.kind === "none") return '<div class="field-note" style="margin-top:12px">此步骤不需要 data</div>';
        if (meta.kind === "structured") return `<label class="label">${escapeHtml(meta.label || "data")}</label><div id="structuredData">${renderStructuredNode(step.data === undefined ? {} : step.data)}</div>`;
        if (meta.kind === "select") return `<label class="label${meta.required ? " required" : ""}">${escapeHtml(meta.label || "data")}</label><select id="singleData" class="input">${(meta.options || []).map(option => `<option ${option === step.data ? "selected" : ""}>${escapeHtml(option)}</option>`).join("")}</select>`;
        if (meta.kind === "string" || meta.kind === "number") {
            const input = meta.multiline ? `<textarea id="singleData" class="json">${escapeHtml(step.data ?? "")}</textarea>` : `<input id="singleData" class="input" type="${meta.kind === "number" ? "number" : "text"}" value="${escapeHtml(step.data ?? "")}">`;
            const control = step.type === "地图追踪"
                ? `<div class="data-record-row">${input}<button id="recordPath" class="btn primary" type="button">打开录制</button></div>`
                : input;
            return `<label class="label${meta.required ? " required" : ""}">${escapeHtml(meta.label || "data")}</label>${control}`;
        }
        return '<div class="field-note">此步骤不需要 data</div>';
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
        box.className = "";
        box.innerHTML = `
          <label class="label required">步骤类型</label><select id="editType" class="input">${state.processors.map(item => `<option ${item.type === step.type ? "selected" : ""}>${escapeHtml(item.type)}</option>`).join("")}</select>
          <div id="dataEditor">${renderDataEditor(step)}</div>
          <div id="commonFields">${COMMON_FIELDS.filter(name => state.shownCommon.has(name)).map(name => renderCommonField(name, step)).join("")}</div>
          <div class="optional-bar"><select id="optionalField" class="input">${choices.length ? choices.map(item => `<option value="${item.value}">${item.label}</option>`).join("") : '<option value="">没有可添加字段</option>'}</select><button id="addOptional" class="btn" ${choices.length ? "" : "disabled"}>添加</button></div>
          <button id="apply" class="btn primary" style="width:100%;margin-top:12px">应用修改</button>`;
        bindEditorEvents(step);
    }

    function bindEditorEvents(step) {
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
            const oldData = step.data && typeof step.data === "object" && !Array.isArray(step.data) ? step.data : {};
            const nextType = $("editType").value;
            const next = defaultData(nextType);
            if (next && typeof next === "object" && !Array.isArray(next)) {
                const nextFields = processor(nextType)?.editor?.fields || {};
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
            const [area, name] = $("optionalField").value.split(":");
            if (!name) return;
            (area === "common" ? state.shownCommon : state.shownData).add(name);
            renderEditor();
        };
        $("apply").onclick = applyEditor;
        $("editor").onclick = event => {
            const structuredAdd = event.target.closest("[data-structured-add]");
            const structuredDelete = event.target.closest("[data-structured-delete]");
            const structuredAction = event.target.closest("[data-structured-action]");
            const removeCommon = event.target.dataset.removeCommon;
            const removeData = event.target.dataset.removeData;
            if (structuredAdd) {
                const node = structuredAdd.closest("[data-structured-node]");
                const body = structuredBody(node);
                body.insertAdjacentHTML("beforeend", renderStructuredEntry("", "", structuredAdd.dataset.structuredAdd === "array"));
                markDirty();
            } else if (structuredDelete) {
                structuredDelete.closest("[data-structured-entry]").remove();
                markDirty();
            } else if (structuredAction) {
                const entry = structuredAction.closest("[data-structured-entry]");
                if (structuredAction.dataset.structuredAction === "up" && entry.previousElementSibling) {
                    entry.parentElement.insertBefore(entry, entry.previousElementSibling);
                } else if (structuredAction.dataset.structuredAction === "down" && entry.nextElementSibling) {
                    entry.parentElement.insertBefore(entry.nextElementSibling, entry);
                }
                markDirty();
            } else if (removeCommon) {
                state.shownCommon.delete(removeCommon);
                delete step[removeCommon];
                markDirty();
                renderEditor();
            } else if (removeData) {
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
            }
        };
        $("editor").oninput = markDirty;
        $("editor").onchange = event => {
            const typeSelect = event.target.closest("[data-structured-type]");
            if (typeSelect) {
                const node = typeSelect.closest("[data-structured-node]");
                node.outerHTML = renderStructuredNode(defaultStructuredValue(typeSelect.value));
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
        return Array.from($("locRows")?.querySelectorAll(".loc-row") || []).map(row => {
            const x = row.querySelector('[data-loc="x"]').value;
            const y = row.querySelector('[data-loc="y"]').value;
            const tolerance = row.querySelector('[data-loc="tolerance"]').value;
            if (validate && (x === "" || y === "")) throw new Error("loc 的 x 和 y 必填");
            const point = [x === "" ? "" : Number(x), y === "" ? "" : Number(y)];
            if (tolerance !== "") point.push(Number(tolerance));
            return point;
        });
    }

    function readData(step) {
        const meta = processor(step.type)?.editor || { kind: "structured" };
        if (meta.kind === "object") {
            const extraData = $("extraData");
            const data = extraData ? readStructuredNode(extraData.querySelector("[data-structured-node]")) : {};
            if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("附加 data 必须是对象");
            $("dataFields").querySelectorAll(".data-field").forEach(section => {
                const name = section.dataset.fieldName;
                const type = section.dataset.fieldType;
                if (type === "array") {
                    const values = Array.from(section.querySelectorAll("[data-array-value]")).map(input => input.value.trim()).filter(Boolean);
                    const field = meta.fields[name];
                    if (values.length || field?.required) data[name] = values;
                } else {
                    const field = meta.fields[name];
                    if (type === "object") {
                        data[name] = readStructuredNode(section.querySelector("[data-data-structured] [data-structured-node]"));
                        return;
                    }
                    const value = section.querySelector("[data-data-value]").value.trim();
                    if (!value && !field?.required) return;
                    data[name] = type === "number" ? Number(value) : type === "boolean" ? value === "true" : value;
                }
            });
            if (step.type === "追踪委托" && data.autoTalk === true && !data.npc?.trim()) {
                throw new Error("追踪委托启用自动点击交互项时必须填写交互名称");
            }
            return data;
        }
        if (meta.kind === "none") return undefined;
        if (meta.kind === "structured") return readStructuredNode($("structuredData").querySelector("[data-structured-node]"));
        if (meta.kind === "number") return Number($("singleData").value);
        if (meta.kind === "string" || meta.kind === "select") return $("singleData").value;
        return undefined;
    }

    function applyEditor() {
        const step = state.steps[state.selected];
        if (!step) return true;
        try {
            step.data = readData(step);
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
                    else step[name] = name === "retry" ? Number(value) : value;
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

    async function loadFile() {
        if (state.loading) return;
        if (!(await confirmDiscard("打开其他流程"))) return;
        state.loading = true;
        $("load").disabled = true;
        $("save").disabled = true;
        $("load").textContent = "读取中";
        setStatus("正在读取...");
        try {
            const result = await request("/load", { scope: currentScope(), fileName: currentFileName() });
            if (result.status === "error") throw new Error(result.message);
            const loadedSteps = JSON.parse(result.content);
            if (!Array.isArray(loadedSteps)) throw new Error("流程文件根节点必须是步骤数组");
            state.steps = loadedSteps;
            state.selected = -1;
            state.dirty = false;
            state.loadedPath = result.path;
            $("path").textContent = result.path;
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
    $("load").onclick = loadFile;
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
    });

    window.htmlMask.onMessage = message => {
        if (message?.url !== "/toggleVisibility") return;
        document.querySelector(".app").style.visibility = message.data?.visible === false ? "hidden" : "visible";
    };

    request("/init").then(result => {
        state.scopes = result.scopes || [];
        state.processors = result.processors || [];
        countryCombo = createEditableSelect($("countryCombo"), () => {
            state.savedScope = null;
            refreshNewLocationOptions();
            refreshTarget();
        });
        locationCombo = createEditableSelect($("locationCombo"), () => {
            state.savedScope = null;
            refreshTarget();
        });
        setOptions($("newType"), state.processors.map(item => item.type));
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
