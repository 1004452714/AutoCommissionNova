/**
 * 纯函数离线单元测试
 *
 * 由 test-runner 的 mode: "unit" 触发；不依赖游戏运行环境
 * 仅测试不调用 BGI 全局（genshin/dispatcher/file 等）的纯函数
 *
 * 框架：极简 assert，结果通过 log.info / log.error 输出
 */
import { levenshteinDistance, calculateSimilarity, getClosestMatch } from "../../src/recognition/text-similarity.js";
import { cleanText, extractName } from "../../src/utils/text-utils.js";
import { calculateDistance } from "../../src/navigation/position-utils.js";
import { validateSchema } from "../../src/processors/define-step.js";
import { StepProcessorRegistry } from "../../src/processors/registry.js";

const tests = [];

function test(name, fn) {
    tests.push({ name, fn });
}

function assertEq(actual, expected, msg) {
    if (typeof actual === "object" && actual !== null && typeof expected === "object" && expected !== null) {
        const a = JSON.stringify(actual);
        const b = JSON.stringify(expected);
        if (a !== b) throw new Error((msg || "断言失败") + ": expected " + b + ", got " + a);
        return;
    }
    if (actual !== expected) {
        throw new Error((msg || "断言失败") + ": expected " + expected + ", got " + actual);
    }
}

function assertClose(actual, expected, eps, msg) {
    if (Math.abs(actual - expected) > eps) {
        throw new Error((msg || "断言失败") + ": expected ~" + expected + ", got " + actual);
    }
}

// ============ text-similarity ============
test("levenshteinDistance 双空串=0", () => {
    assertEq(levenshteinDistance("", ""), 0);
});

test("levenshteinDistance 相同串=0", () => {
    assertEq(levenshteinDistance("abc", "abc"), 0);
});

test("levenshteinDistance kitten→sitting=3", () => {
    assertEq(levenshteinDistance("kitten", "sitting"), 3);
});

test("levenshteinDistance 空对非空=长度", () => {
    assertEq(levenshteinDistance("", "abc"), 3);
});

test("calculateSimilarity 双空=1", () => {
    assertEq(calculateSimilarity("", ""), 1);
});

test("calculateSimilarity 完全相同=1", () => {
    assertEq(calculateSimilarity("abc", "abc"), 1);
});

test("calculateSimilarity 完全不同=0", () => {
    assertEq(calculateSimilarity("abc", "xyz"), 0);
});

test("getClosestMatch 命中阈值", () => {
    assertEq(getClosestMatch("蒙德", ["蒙德城", "璃月港"], 0.4), "蒙德城");
});

test("getClosestMatch 未达阈值返回 null", () => {
    assertEq(getClosestMatch("不存在的名字", ["aaa"], 0.9), null);
});

test("getClosestMatch 空候选返回 null", () => {
    assertEq(getClosestMatch("abc", [], 0.5), null);
});

// ============ text-utils ============
test("cleanText 去除标点", () => {
    assertEq(cleanText("hello, world!"), "helloworld");
});

test("cleanText 保留中英文数字", () => {
    assertEq(cleanText("你好，World 123！"), "你好World123");
});

test("cleanText 空串/null", () => {
    assertEq(cleanText(""), "");
    assertEq(cleanText(null), "");
});

test("extractName 与X对话", () => {
    assertEq(extractName("与凯瑟琳对话"), "凯瑟琳");
});

test("extractName 向X打听", () => {
    assertEq(extractName("向琴打听情报"), "琴");
});

test("extractName 不匹配返回 null", () => {
    assertEq(extractName("打倒丘丘人"), null);
});

// ============ position-utils ============
test("calculateDistance 3-4-5", () => {
    assertClose(calculateDistance({ x: 0, y: 0 }, { x: 3, y: 4 }), 5, 1e-9);
});

test("calculateDistance 大小写键混用", () => {
    assertClose(calculateDistance({ X: 0, Y: 0 }, { x: 3, y: 4 }), 5, 1e-9);
});

test("calculateDistance 缺数据返回 Infinity", () => {
    assertEq(calculateDistance(null, { x: 1, y: 1 }), Infinity);
});

// ============ define-step.validateSchema ============
test("validateSchema 必填命中", () => {
    const r = validateSchema({ x: 1, y: 2 }, { x: "number", y: "number" }, "test");
    assertEq(r.ok, true);
    assertEq(r.value.x, 1);
});

test("validateSchema 类型不符", () => {
    const r = validateSchema({ x: "abc" }, { x: "number" }, "test");
    assertEq(r.ok, false);
});

test("validateSchema 可选字段缺省=允许", () => {
    const r = validateSchema({}, { x: "number?" }, "test");
    assertEq(r.ok, true);
});

test("validateSchema 必填缺失=报错", () => {
    const r = validateSchema({}, { x: "number" }, "test");
    assertEq(r.ok, false);
});

test("validateSchema 带 default=自动填值", () => {
    const r = validateSchema({}, { x: { type: "number", default: 42 } }, "test");
    assertEq(r.ok, true);
    assertEq(r.value.x, 42);
});

test("validateSchema 非对象 data=报错", () => {
    const r = validateSchema("not-object", { x: "number" }, "test");
    assertEq(r.ok, false);
});

// ============ registry.normalizeStep ============
const registry = new StepProcessorRegistry();

test("normalizeStep .json 字符串→地图追踪", () => {
    assertEq(registry.normalizeStep("foo.json"), { type: "地图追踪", data: "foo.json" });
});

test("normalizeStep F→对话", () => {
    assertEq(registry.normalizeStep("F"), { type: "对话", data: {} });
});

test("normalizeStep 其他字符串→type 即字符串", () => {
    assertEq(registry.normalizeStep("等待"), { type: "等待", data: {} });
});

test("normalizeStep 对象保持原状", () => {
    const step = { type: "传送", data: { x: 1, y: 2 } };
    assertEq(registry.normalizeStep(step), step);
});

/**
 * 运行所有单元测试
 * @returns {Promise<boolean>} 全部通过返回 true
 */
export async function runUnitTests() {
    log.info("=== 单元测试开始 ({total} 项) ===", tests.length);
    let passed = 0;
    let failed = 0;
    const failedNames = [];

    for (const t of tests) {
        try {
            await t.fn();
            log.info("✓ {name}", t.name);
            passed++;
        } catch (error) {
            log.error("✗ {name}: {error}", t.name, error.message);
            failed++;
            failedNames.push(t.name);
        }
    }

    log.info("=== 单元测试结束: {pass}/{total} 通过 ===", passed, tests.length);
    if (failed > 0) {
        log.error("失败用例: {names}", failedNames.join(", "));
    }
    return failed === 0;
}
