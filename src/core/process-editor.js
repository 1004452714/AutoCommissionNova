/** 委托流程快捷编辑器（HTML 遮罩）。 */
import { isCancellationError } from "../utils/error-utils.js";
import { scanCommissionScopes } from "../loaders/process-scope.js";
import { parseStepLoc } from "../processors/commission-loc-utils.js";
import { collectImpregnableDefensePaths } from "../processors/impregnable-defense-config.js";
import { parseLocationDir } from "../utils/location-dir.js";
import { openPathRecorder } from "./path-recorder.js";

const HTML_PATH = "process-editor-mask.html";
const WINDOW_TAG = "process-editor";
const DATA_EDITORS = {
    "地图追踪": { kind: "string", label: "路径文件", required: true },
    "等待": { kind: "number", label: "等待时间（毫秒）", required: true },
    "按键": { kind: "string", label: "按键", required: true },
    "键鼠脚本": { kind: "string", label: "脚本内容", required: true, multiline: true },
    "切换委托队伍": { kind: "select", label: "队伍用途", required: true, options: ["战斗", "元素采集"] },
    "对话": {
        kind: "object",
        fields: {
            priorityOptions: { type: "array", label: "优先对话选项", required: false },
            npcWhiteList: { type: "array", label: "NPC 白名单", required: false },
        },
    },
    "执行子流程": { kind: "object" },
    "地址检测": { kind: "object" },
    "传送": { kind: "object" },
    "使用道具": { kind: "object" },
    "在附近交互": { kind: "object" },
    "自动任务": {
        kind: "object",
        fields: {
            action: { type: "string", label: "操作", required: true, options: ["enable", "disable"] },
            taskType: { type: "string", label: "任务类型", required: false },
            config: { type: "object", label: "任务配置", required: false },
        },
    },
    "摧毁哨塔": {
        kind: "object",
        fields: {
            navigation: { type: "string", label: "寻路方式", required: false, default: "图标寻路", options: ["图标寻路", "路径追踪"] },
            path: { type: "string", label: "路径文件", required: false },
        },
    },
    "追踪委托": {
        kind: "object",
        allowExtras: false,
        fields: {
            npc: {
                type: "string",
                label: "交互名称",
                required: false,
                alwaysVisible: true,
                hint: "填写要匹配的 NPC 名称或交互项文字，例如“采摘”。",
            },
            iconType: {
                type: "string",
                label: "追踪图标",
                required: false,
                alwaysVisible: true,
                hint: "仅支持基础委托、问号任务和任务三种图标。",
                options: [
                    { value: "", label: "默认（基础委托）" },
                    { value: "Base", label: "基础委托（Base）" },
                    { value: "Question", label: "问号任务（Question）" },
                    { value: "Task", label: "任务（Task）" },
                ],
            },
            autoTalk: {
                type: "boolean",
                label: "自动点击交互项",
                required: false,
                alwaysVisible: true,
                hint: "选择“是”后，将自动点击包含交互名称的选项。",
            },
        },
    },
    "切换角色": { kind: "structured", label: "角色槽位" },
    "用户分支选择": { kind: "structured", label: "分支步骤" },
    "固若金汤": { kind: "structured", label: "波次配置" },
    "成就检测": { kind: "structured", label: "成就参数" },
    "等待返回主界面": { kind: "none" },
    "自动战斗": { kind: "none" },
    "摧毁史莱姆气球": { kind: "none" },
    "开启挑战": { kind: "none" },
    "乐流奔引": { kind: "none" },
};

function respond(windowId, requestId, data) {
    const payload = JSON.stringify(data);
    if (typeof htmlMask.respond === "function") htmlMask.respond(windowId, requestId, payload);
    else if (typeof htmlMask.Respond === "function") htmlMask.Respond(windowId, requestId, payload);
    else htmlMask.send(windowId, "/response", JSON.stringify({ requestId, data }));
}

function safePart(value, label) {
    const text = String(value || "").trim();
    if (!text || text === "." || text === ".." || /[\\/:*?"<>|]/.test(text)) {
        throw new Error(label + "包含非法字符或为空");
    }
    return text;
}

function buildPath(scope, fileName) {
    const country = safePart(scope?.country, "国家");
    const typeDir = scope?.typeDir === "Basic" ? "Basic" : scope?.typeDir === "NPC" ? "NPC" : "";
    if (!typeDir) throw new Error("委托类型只能是 Basic 或 NPC");
    const commission = safePart(scope?.commissionName, "委托名");
    const location = safePart(scope?.locationDir, "地点");
    const name = safePart(fileName, "文件名");
    if (!name.toLowerCase().endsWith(".json")) throw new Error("流程文件必须以 .json 结尾");
    return ["process", country, typeDir, commission, location, name].join("/");
}

function baseName(path) {
    return String(path || "").replace(/\\/g, "/").split("/").pop();
}

function resolveNewScope(scope) {
    const country = safePart(scope?.country, "国家");
    const typeDir = scope?.typeDir === "Basic" ? "Basic" : scope?.typeDir === "NPC" ? "NPC" : "";
    if (!typeDir) throw new Error("委托类型只能是 Basic 或 NPC");
    const commissionName = safePart(scope?.commissionName, "委托名");
    const requestedLocation = safePart(scope?.locationDir, "地点");
    const location = parseLocationDir(requestedLocation).location;
    const parent = ["process", country, typeDir, commissionName].join("/");
    const existing = file.isFolder(parent)
        ? Array.from(file.readPathSync(parent) || [])
            .filter(entry => file.isFolder(entry) && file.isFile(String(entry).replace(/\\/g, "/") + "/process.json"))
            .map(baseName)
        : [];
    const duplicates = existing.filter(name => parseLocationDir(name).location === location);
    let locationDir = location;
    if (duplicates.length > 0) {
        const ordinals = duplicates.map(name => parseLocationDir(name).ordinal).filter(value => value !== null);
        locationDir = location + "-" + (ordinals.length ? Math.max(...ordinals) + 1 : 1);
        while (existing.includes(locationDir)) {
            const current = parseLocationDir(locationDir).ordinal || 0;
            locationDir = location + "-" + (current + 1);
        }
    }
    return { country, typeDir, commissionName, locationDir };
}

function listFiles(scope) {
    const sample = buildPath(scope, "process.json");
    const dir = sample.slice(0, sample.lastIndexOf("/"));
    if (!file.isFolder(dir)) return [];
    return Array.from(file.readPathSync(dir) || [])
        .filter((entry) => file.isFile(entry) && /\.json$/i.test(entry))
        .map((entry) => String(entry).replace(/\\/g, "/").split("/").pop())
        .sort((a, b) => a.localeCompare(b, "zh-CN"));
}

function metadata(registry) {
    return registry.getRegisteredTypes().sort((a, b) => a.localeCompare(b, "zh-CN"))
        .map((type) => {
            const schema = registry.getSchema(type) || null;
            const editor = Object.assign({}, DATA_EDITORS[type] || {});
            if (schema) {
                editor.kind = "object";
                editor.fields = Object.assign({}, editor.fields || {});
                for (const field of Object.keys(schema)) {
                    const spec = schema[field];
                    const objectSpec = spec && typeof spec === "object";
                    const existingField = editor.fields[field] || {};
                    editor.fields[field] = Object.assign({}, editor.fields[field] || {}, {
                        type: objectSpec ? spec.type : String(spec).replace(/\?$/, ""),
                        required: objectSpec ? !Object.prototype.hasOwnProperty.call(spec, "default") : !String(spec).endsWith("?"),
                        default: objectSpec && Object.prototype.hasOwnProperty.call(spec, "default") && !existingField.alwaysVisible
                            ? spec.default
                            : undefined,
                    });
                }
            }
            return { type, schema, editor: Object.keys(editor).length ? editor : { kind: "structured", label: "data" } };
        });
}

function editorScopes() {
    return scanCommissionScopes().list.filter((scope) => file.isFile(buildPath(scope, "process.json")));
}

function orderedStep(step) {
    const result = {};
    const knownKeys = ["type", "data", "note", "desc", "loc", "retry", "retryOn"];
    for (const key of knownKeys) {
        if (step[key] !== undefined) result[key] = step[key];
    }
    for (const key of Object.keys(step)) {
        if (!knownKeys.includes(key)) result[key] = step[key];
    }
    return result;
}

const BAG_TABS = new Set(["武器", "圣遗物", "养成道具", "食物", "材料", "小道具", "任务", "贵重道具", "摆设"]);
const RETRY_MODES = new Set(["throw", "return-false", "all"]);

function processDir(processPath) {
    return processPath.slice(0, processPath.lastIndexOf("/"));
}

function resolveReference(resourceDir, reference, prefix, errors) {
    if (typeof reference !== "string" || !reference.trim()) {
        errors.push(prefix + "必须是非空路径字符串");
        return null;
    }
    let normalized = reference.trim().replace(/\\/g, "/").replace(/^\.\/+/, "").replace(/\/+/g, "/");
    const parts = normalized.split("/");
    if (!normalized || normalized.startsWith("/") || /^[A-Za-z]:\//.test(normalized) || /[:*?"<>|]/.test(normalized) || parts.includes("..")) {
        errors.push(prefix + "必须是当前流程目录内的相对路径：" + reference);
        return null;
    }
    if (!normalized.toLowerCase().endsWith(".json")) {
        errors.push(prefix + "必须指向 .json 文件：" + reference);
        return null;
    }
    return resourceDir + "/" + normalized;
}

function readJsonFile(path, prefix, errors) {
    if (!file.isFile(path)) {
        errors.push(prefix + "文件不存在：" + path);
        return { ok: false };
    }
    try {
        return { ok: true, value: JSON.parse(file.readTextSync(path)) };
    } catch (error) {
        errors.push(prefix + "JSON 解析失败：" + path + " - " + error.message);
        return { ok: false };
    }
}

function validatePathFile(path, prefix, errors) {
    const loaded = readJsonFile(path, prefix, errors);
    if (!loaded.ok) return;
    const data = loaded.value;
    if (!data || typeof data !== "object" || Array.isArray(data)) {
        errors.push(prefix + "路径文件根节点必须是对象：" + path);
        return;
    }
    if (!Array.isArray(data.positions)) {
        errors.push(prefix + "路径文件缺少 positions 数组：" + path);
        return;
    }
    const validPoint = data.positions.some(position => position && position.type !== "orientation" &&
        Number.isFinite(position.id) && Number.isFinite(position.x) && Number.isFinite(position.y));
    if (!validPoint) errors.push(prefix + "路径文件没有有效坐标点：" + path);
}

function validateRoleData(data, prefix, errors) {
    if (!data || typeof data !== "object" || Array.isArray(data)) {
        errors.push(prefix + "data 必须是角色槽位对象");
        return;
    }
    const entries = Object.entries(data);
    if (entries.length === 0 || entries.length > 4) {
        errors.push(prefix + "必须配置 1 至 4 个角色");
        return;
    }
    for (const [key, name] of entries) {
        if (!/^[1-4]$/.test(key)) errors.push(prefix + "角色槽位只能是 1 至 4：" + key);
        if (typeof name !== "string" || !name.trim()) errors.push(prefix + "角色 " + key + " 的名称不能为空");
    }
}

function validateProcess(steps, registry, processPath, resourceDir, diagnostics, stack, label) {
    const { errors, warnings } = diagnostics;
    if (!Array.isArray(steps)) {
        errors.push(label + "根节点必须是步骤数组");
        return;
    }
    if (steps.length === 0) warnings.push(label + "流程为空，没有可执行步骤");

    function validateSubProcess(reference, prefix) {
        const path = resolveReference(resourceDir, reference, prefix, errors);
        if (!path) return;
        if (stack.has(path)) {
            errors.push(prefix + "检测到循环引用：" + path);
            return;
        }
        const loaded = readJsonFile(path, prefix, errors);
        if (!loaded.ok) return;
        stack.add(path);
        validateProcess(loaded.value, registry, path, resourceDir, diagnostics, stack, prefix + " → ");
        stack.delete(path);
    }

    function validateStep(step, prefix) {
        if (!step || typeof step !== "object" || Array.isArray(step)) {
            errors.push(prefix + "必须是对象");
            return;
        }
        if (typeof step.type !== "string" || !step.type.trim()) {
            errors.push(prefix + "type 必填");
            return;
        }
        if (!registry.has(step.type)) {
            errors.push(prefix + "未知类型：" + step.type);
            return;
        }
        for (const name of ["note", "desc"]) {
            if (step[name] !== undefined && typeof step[name] !== "string") errors.push(prefix + name + " 必须是字符串");
        }
        if (step.retry !== undefined && (!Number.isInteger(step.retry) || step.retry < 0)) {
            errors.push(prefix + "retry 必须是非负整数");
        }
        if (step.retryOn !== undefined && !RETRY_MODES.has(step.retryOn)) {
            errors.push(prefix + "retryOn 只能是 throw、return-false 或 all");
        }
        const locResult = parseStepLoc(step.loc);
        if (!locResult.ok) errors.push(prefix + "loc 格式错误：" + locResult.error);
        else if (locResult.present && locResult.value.targets.some(target => target.tolerance <= 0)) {
            errors.push(prefix + "loc tolerance 必须大于 0");
        }

        const editor = DATA_EDITORS[step.type];
        if (editor?.required) {
            const missing = step.data === undefined || step.data === null ||
                (typeof step.data === "string" && !step.data.trim());
            if (missing) errors.push(prefix + (editor.label || "data") + "必填");
            if (editor.kind === "string" && typeof step.data !== "string") errors.push(prefix + (editor.label || "data") + "必须是字符串");
            if (editor.kind === "number" && !Number.isFinite(step.data)) errors.push(prefix + (editor.label || "data") + "必须是有限数字");
            if (editor.kind === "select" && !editor.options.includes(step.data)) errors.push(prefix + (editor.label || "data") + "选项无效");
        }
        const schema = registry.getSchema(step.type);
        if (schema) {
            const result = registry.validateData(step.type, step.data);
            if (!result.ok) errors.push(prefix + result.error);
            else {
                for (const [fieldName, spec] of Object.entries(schema)) {
                    const objectSpec = spec && typeof spec === "object";
                    const expected = objectSpec ? spec.type : String(spec).replace(/\?$/, "");
                    const optional = objectSpec ? Object.prototype.hasOwnProperty.call(spec, "default") : String(spec).endsWith("?");
                    const value = step.data?.[fieldName];
                    if (!optional && expected === "string" && typeof value === "string" && !value.trim()) {
                        errors.push(prefix + "data." + fieldName + " 不能为空");
                    }
                    if (expected === "number" && value !== undefined && !Number.isFinite(value)) {
                        errors.push(prefix + "data." + fieldName + " 必须是有限数字");
                    }
                }
            }
        }

        if (step.type === "地图追踪" && typeof step.data === "string" && step.data.trim()) {
            const path = resolveReference(resourceDir, step.data, prefix + "地图追踪文件", errors);
            if (path) validatePathFile(path, prefix + "地图追踪文件：", errors);
        } else if (step.type === "等待" && Number.isFinite(step.data) && step.data < 0) {
            errors.push(prefix + "等待时间不能为负数");
        } else if ((step.type === "按键" || step.type === "键鼠脚本") &&
            (typeof step.data !== "string" || !step.data.trim())) {
            errors.push(prefix + "data 不能为空");
        } else if (step.type === "执行子流程" && step.data && typeof step.data === "object") {
            validateSubProcess(step.data.path, prefix + "data.path：");
        } else if (step.type === "地址检测") {
            if (step.run !== undefined) validateSubProcess(step.run, prefix + "run：");
            if (step.data && typeof step.data === "object" && step.data.tolerance !== undefined && step.data.tolerance <= 0) {
                errors.push(prefix + "data.tolerance 必须大于 0");
            }
        } else if (step.type === "使用道具" && step.data && typeof step.data === "object") {
            if (!BAG_TABS.has(step.data.tab)) errors.push(prefix + "data.tab 是未知背包分类：" + (step.data.tab || "(空)"));
            if (!Array.isArray(step.data.items) || step.data.items.length === 0 ||
                !step.data.items.every(item => typeof item === "string" && item.trim())) {
                errors.push(prefix + "data.items 必须是非空字符串数组");
            }
        } else if (step.type === "对话" && step.data && typeof step.data === "object") {
            for (const fieldName of ["priorityOptions", "npcWhiteList"]) {
                const values = step.data[fieldName];
                if (values !== undefined && (!Array.isArray(values) ||
                    !values.every(value => typeof value === "string" && value.trim()))) {
                    errors.push(prefix + "data." + fieldName + " 必须是字符串数组");
                }
            }
        } else if (step.type === "在附近交互" && step.data && typeof step.data === "object") {
            if (typeof step.data.text !== "string" || !step.data.text.trim()) errors.push(prefix + "data.text 不能为空");
            if (step.data.turns !== undefined && (!Number.isInteger(step.data.turns) || step.data.turns <= 0)) {
                errors.push(prefix + "data.turns 必须是正整数");
            }
        } else if (step.type === "摧毁哨塔") {
            const data = step.data === undefined || step.data === null ? {} : step.data;
            if (!data || typeof data !== "object" || Array.isArray(data)) errors.push(prefix + "data 必须是对象");
            else {
                const navigation = data.navigation || "图标寻路";
                if (navigation !== "图标寻路" && navigation !== "路径追踪") errors.push(prefix + "data.navigation 只能是图标寻路或路径追踪");
                if (navigation === "路径追踪") {
                    const path = resolveReference(resourceDir, data.path, prefix + "data.path：", errors);
                    if (path) validatePathFile(path, prefix + "路径追踪文件：", errors);
                }
            }
        } else if (step.type === "固若金汤") {
            const result = collectImpregnableDefensePaths(step.data);
            if (!result.ok) errors.push(prefix + result.error);
            for (const warning of result.warnings || []) warnings.push(prefix + warning);
            if (result.ok) {
                for (const reference of result.paths) {
                    const path = resolveReference(resourceDir, reference, prefix + "波次路径：", errors);
                    if (path) validatePathFile(path, prefix + "波次路径文件：", errors);
                }
            }
        } else if (step.type === "切换角色") {
            validateRoleData(step.data, prefix, errors);
        } else if (step.type === "自动任务") {
            if (!step.data || typeof step.data !== "object" || Array.isArray(step.data)) errors.push(prefix + "data 必须是对象");
            else {
                if (step.data.action !== "enable" && step.data.action !== "disable") errors.push(prefix + "data.action 只能是 enable 或 disable");
                if (step.data.taskType !== undefined && (typeof step.data.taskType !== "string" || !step.data.taskType.trim())) errors.push(prefix + "data.taskType 必须是非空字符串");
                if (step.data.config !== undefined && (!step.data.config || typeof step.data.config !== "object" || Array.isArray(step.data.config))) errors.push(prefix + "data.config 必须是对象");
            }
        } else if (step.type === "用户分支选择") {
            if (!step.data || typeof step.data !== "object" || Array.isArray(step.data)) errors.push(prefix + "data 必须是分支对象");
            else {
                const branches = Object.entries(step.data);
                if (branches.length === 0) warnings.push(prefix + "没有配置任何分支步骤");
                for (const [branchKey, branchStep] of branches) validateStep(branchStep, prefix + "分支 " + branchKey + " → ");
            }
        }
    }

    for (let index = 0; index < steps.length; index++) validateStep(steps[index], label + "步骤 #" + (index + 1) + "：");
}

function validateSteps(steps, registry, scope, fileName) {
    const diagnostics = { errors: [], warnings: [] };
    const path = buildPath(scope, fileName);
    const stack = new Set([path]);
    validateProcess(steps, registry, path, processDir(path), diagnostics, stack, "");
    if (scope.typeDir === "Basic") {
        const mapPath = processDir(path) + "/_path.json";
        validatePathFile(mapPath, "Basic 必需路径文件：", diagnostics.errors);
    }
    return diagnostics;
}

export async function openProcessEditor(registry) {
    if (typeof htmlMask === "undefined") return log.warn("当前环境不支持 htmlMask，无法打开流程编辑器");
    if (htmlMask.exists(WINDOW_TAG)) return;
    const windowId = htmlMask.show(HTML_PATH, WINDOW_TAG);
    htmlMask.setClickThrough(windowId, false);
    const hook = new KeyMouseHook();
    let isVisible = true;
    let recorderActive = false;
    hook.onKeyDown(function (keyCode) {
        if (recorderActive || keyCode !== "Oem3" || !htmlMask.exists(windowId)) return;
        isVisible = !isVisible;
        htmlMask.setClickThrough(windowId, !isVisible);
        htmlMask.send(windowId, "/toggleVisibility", JSON.stringify({ visible: isVisible }));
    });
    const cancelToken = dispatcher.getLinkedCancellationToken();
    try {
        while (htmlMask.exists(windowId) && !cancelToken.isCancellationRequested) {
            let raw;
            try {
                raw = await htmlMask.receive(windowId, 1000);
            } catch (error) {
                if (isCancellationError(error)) break;
                continue;
            }
            if (!raw) continue;
            let message;
            try { message = JSON.parse(raw); } catch (error) { continue; }
            try {
                if (message.url === "/init") {
                    respond(windowId, message.requestId, { scopes: editorScopes(), processors: metadata(registry) });
                } else if (message.url === "/files") {
                    respond(windowId, message.requestId, { files: listFiles(message.data?.scope) });
                } else if (message.url === "/target") {
                    const scope = message.data?.create ? resolveNewScope(message.data?.scope) : message.data?.scope;
                    const path = buildPath(scope, message.data?.fileName);
                    respond(windowId, message.requestId, { status: "ok", scope, path, exists: file.isFile(path) });
                } else if (message.url === "/load") {
                    const path = buildPath(message.data?.scope, message.data?.fileName);
                    if (!file.isFile(path)) throw new Error("文件不存在：" + path);
                    respond(windowId, message.requestId, { status: "ok", path, content: file.readTextSync(path) });
                } else if (message.url === "/recordPath") {
                    const scope = message.data?.create ? resolveNewScope(message.data?.scope) : message.data?.scope;
                    const path = buildPath(scope, message.data?.fileName);
                    recorderActive = true;
                    isVisible = false;
                    htmlMask.setClickThrough(windowId, true);
                    htmlMask.send(windowId, "/toggleVisibility", JSON.stringify({ visible: false }));
                    let result;
                    try {
                        result = await openPathRecorder({
                            targetDir: processDir(path),
                            commissionName: scope.commissionName,
                        });
                    } finally {
                        recorderActive = false;
                        isVisible = true;
                        if (htmlMask.exists(windowId)) {
                            htmlMask.setClickThrough(windowId, false);
                            htmlMask.send(windowId, "/toggleVisibility", JSON.stringify({ visible: true }));
                        }
                    }
                    respond(windowId, message.requestId, Object.assign({}, result, { scope }));
                } else if (message.url === "/validate" || message.url === "/save") {
                    let parsed;
                    try { parsed = JSON.parse(String(message.data?.content || "")); }
                    catch (error) { throw new Error("JSON 格式错误：" + error.message); }
                    const scope = message.data?.create ? resolveNewScope(message.data?.scope) : message.data?.scope;
                    const diagnostics = validateSteps(parsed, registry, scope, message.data?.fileName);
                    if (message.url === "/validate") {
                        respond(windowId, message.requestId, {
                            status: diagnostics.errors.length ? "error" : diagnostics.warnings.length ? "warning" : "ok",
                            errors: diagnostics.errors,
                            warnings: diagnostics.warnings,
                        });
                    } else {
                        if (diagnostics.errors.length) throw new Error(diagnostics.errors.join("\n"));
                        const path = buildPath(scope, message.data?.fileName);
                        const content = JSON.stringify(parsed.map(orderedStep), null, 4) + "\r\n";
                        if (!file.writeTextSync(path, content, false)) throw new Error("写入失败：" + path);
                        respond(windowId, message.requestId, { status: "ok", path, content, scope, warnings: diagnostics.warnings });
                    }
                } else if (message.url === "/close") {
                    respond(windowId, message.requestId, { status: "ok" });
                    break;
                }
            } catch (error) {
                respond(windowId, message.requestId, { status: "error", message: error.message });
            }
        }
    } finally {
        try { hook.dispose(); } catch (error) {}
        if (htmlMask.exists(windowId)) htmlMask.close(windowId);
    }
}
