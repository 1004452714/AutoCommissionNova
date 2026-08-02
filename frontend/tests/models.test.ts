import { buildBattleGroups, filterBattleScopes, normalizeGlobalConfig, normalizePayload, normalizeStrategyValue } from "@/apps/commission-config/model";
import { convertStepType, defaultStep, diagnosticText, parseOptionalJson } from "@/apps/process-editor/model";
import { DEFAULT_SETTINGS, changePointAction, clonePoints, combatCompletions, createPoint, duplicatePoint, reconcileRouteAuthors, renumberPoints, timeControlValue } from "@/apps/path-recorder/model";

describe("commission config model", () => {
    it("normalizes uid and legacy branch payloads", () => {
        expect(normalizeGlobalConfig({ uids: [" 123-45 ", "test", "12345"] })).toEqual({ uids: ["12345", "test"], skipSafeTeleport: false });
        // 旧组合格式整体作为分支映射处理。
        const payload = normalizePayload({ 示例: { descriptions: { a: "分支" }, conditions: {}, completed: [] } });
        expect(payload.branches.示例.descriptions.a).toBe("分支");
        expect(normalizeStrategyValue("folder/demo.txt")).toBe("folder/demo");
    });

    it("groups battle commissions by country and type", () => {
        // 组合视图覆盖同委托多地点数量和国家内 NPC/Basic 分组。
        const payload = normalizePayload({ party: { scopesByCommission: {
            多地点: [{ country: "璃月", typeDir: "NPC", locationDir: "甲" }, { country: "璃月", typeDir: "NPC", locationDir: "乙" }],
            基础: [{ country: "璃月", typeDir: "Basic", locationDir: "城外" }],
        } } });
        // 分组结果按中文国家排序，国家内 NPC 固定在 Basic 之前。
        const groups = buildBattleGroups(payload.party.scopesByCommission);
        expect(groups.map((group) => group.title)).toEqual(["璃月"]);
        expect(groups[0].groups.map((group) => group.title)).toEqual(["NPC", "Basic"]);
        expect(groups[0].groups[0].items[0]).toEqual({ name: "多地点", progress: "2" });
        expect(buildBattleGroups(payload.party.scopesByCommission, "基础")[0].groups[0].items).toHaveLength(1);
    });

    it("filters same-name basic scopes by country", () => {
        const payload = normalizePayload({ party: { scopesByCommission: {
            同名基础: [
                { country: "蒙德", typeDir: "Basic", locationDir: "风起地" },
                { country: "璃月", typeDir: "Basic", locationDir: "归离原" },
                { country: "蒙德", typeDir: "NPC", locationDir: "蒙德城" },
            ],
        } } });
        const scopes = payload.party.scopesByCommission.同名基础;
        expect(filterBattleScopes(scopes, "蒙德", "Basic").map((scope) => scope.locationDir)).toEqual(["风起地"]);
        expect(filterBattleScopes(scopes, "璃月", "Basic").map((scope) => scope.locationDir)).toEqual(["归离原"]);
    });
});

describe("process editor model", () => {
    it("creates declared defaults and parses drafts", () => {
        // 必填对象字段使用声明默认值创建。
        const step = defaultStep({ type: "示例", category: "流程控制", dataSpec: { kind: "object", fields: { enabled: { type: "boolean", required: true } } } });
        expect(step).toEqual({ type: "示例", data: { enabled: false } });
        expect(parseOptionalJson("{\"x\":1}", "data")).toEqual({ x: 1 });
        expect(diagnosticText({ status: "warning", warnings: ["提示"] })).toContain("提示");
    });

    it("converts step types using only shared declared data fields", () => {
        // 原步骤包含共同字段、旧类型私有字段和未知步骤扩展。
        const step = { type: "旧", data: { shared: 2, removed: "x" }, note: "保留", extension: { value: 1 } };
        // 新旧处理器只共同声明 shared。
        const previous = { type: "旧", category: "测试", dataSpec: { kind: "object" as const, fields: { shared: { type: "number" as const }, removed: { type: "string" as const } } } };
        // 新处理器提供额外默认字段。
        const next = { type: "新", category: "测试", dataSpec: { kind: "object" as const, fields: { shared: { type: "number" as const }, added: { type: "boolean" as const, required: true } } } };
        expect(convertStepType(step, previous, next)).toEqual({ type: "新", data: { added: false, shared: 2 }, note: "保留", extension: { value: 1 } });
    });
});

describe("path recorder model", () => {
    it("creates and renumbers points", () => {
        // 调换点位后必须重新生成连续 id。
        const points = renumberPoints([createPoint(1, 2, 1), createPoint(3, 4, 0)]);
        expect(points.map((point) => point.id)).toEqual([1, 2]);
    });

    it("duplicates points and resets action parameters", () => {
        // 默认策略用于首次切换到简易策略动作。
        const settings = { ...structuredClone(DEFAULT_SETTINGS), combatScripts: [{ name: "默认", value: "attack", def: true }] };
        // 原点位带有与新动作不兼容的参数。
        const point = { ...createPoint(1, 2), action: "log_output", action_params: "旧参数" };
        expect(changePointAction(point, "combat_script", settings).action_params).toBe("attack");
        expect(duplicatePoint([point], 0).map((item) => item.id)).toEqual([1, 2]);
    });

    it("preserves BetterGI point extension fields while cloning", () => {
        // 编辑已有路线时未知的点位扩展结构必须原样往返。
        const point = { ...createPoint(1, 2), point_ext_params: { description: "保留" }, items: [{ name: "材料" }] };
        expect(clonePoints([point])[0]).toMatchObject({ point_ext_params: { description: "保留" }, items: [{ name: "材料" }] });
    });

    it("normalizes compatible set-time values for the native control", () => {
        // 一至两位小时和分钟均补零为原生 time 输入要求的格式。
        expect(["0:0", "6:2", "6:09", "06:2", "06:02", "23:59"].map(timeControlValue)).toEqual(["00:00", "06:02", "06:09", "06:02", "06:02", "23:59"]);
        expect(["6：2", "24:0", "6:60", ":20", "6:", "6:2:1"].map(timeControlValue)).toEqual(["", "", "", "", "", ""]);
    });

    it("reconciles route authors and completes combat syntax", () => {
        // 已删除或改名作者不应继续写入路线文件。
        const settings = { ...structuredClone(DEFAULT_SETTINGS), authors: [{ name: "保留", links: "url" }] };
        expect(reconcileRouteAuthors([{ name: "保留", links: "url" }, { name: "失效", links: "old" }], settings)).toEqual([{ name: "保留", links: "url" }]);
        // 方法与参数元数据都参与补全筛选。
        const syntax = [{ code: "keydown", aliases: [], params: ["W", "A"], template: "keydown()", hint: "按下按键" }];
        expect(combatCompletions("key", 3, syntax)[0].value).toBe("keydown()");
        expect(combatCompletions("keydown(W", 9, syntax)[0].value).toBe("W");
    });
});
