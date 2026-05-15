/**
 * 步骤处理器声明式包装
 *
 * 提供：
 *   - 统一 try/catch + log.error 兜底（措辞统一为"执行 X 步骤时出错: ..."）
 *   - 可选 schema 校验（声明式校验 step.data 字段，省去重复手写 typeof/range 检查）
 *   - step 级重试（retry/retryOn）：失败先重试 N 次再走 swallow/throw 路径，
 *     避免瞬时 OCR / 网络 / 模板匹配抖动直接拖累整个委托
 *   - swallow 选项：默认抛出错误让上层 executor 计数重试；某些处理器（auto-fight、user-branch-select）
 *     现行就是吞错继续，传 swallow: true 即可保留行为
 *   - 多 type 别名：types: ["tp", "传送"] 一次返回数组，避免手写两次 defineStep
 *
 * Schema 格式：
 *   schema: {
 *       x: "number",                              // 必填 number
 *       force: "boolean?",                        // 可选 boolean（undefined 允许）
 *       tolerance: { type: "number", default: 15 }, // 可选 number，缺省 15
 *   }
 *
 * 支持类型：string / number / boolean / object / array / any
 *
 * Retry 语义：
 *   - retry: number — 重试次数（不含首次）。step.retry 优先于 defineStep 默认值。
 *   - retryOn:
 *       "throw"        — 仅 run 抛错时重试（默认）
 *       "return-false" — 仅 run 返回 false 时重试；抛错立即向上
 *       "all"          — throw 或 return false 都重试
 *   - schema 校验失败不重试（属配置错误）；swallow 在重试全部用尽后才生效
 *   - **注意**：重试假设 step 幂等。`按键` / 业务有副作用的 step 启用 retry 需谨慎
 */

const TYPE_CHECKS = {
    string: v => typeof v === "string",
    number: v => typeof v === "number",
    boolean: v => typeof v === "boolean",
    object: v => typeof v === "object" && v !== null && !Array.isArray(v),
    array: v => Array.isArray(v),
    any: () => true,
};

function validateSchema(data, schema, stepType) {
    if (data === null || data === undefined) {
        return { ok: false, error: stepType + " 步骤需要对象格式的 data" };
    }
    if (typeof data !== "object" || Array.isArray(data)) {
        return { ok: false, error: stepType + " 步骤需要对象格式的 data" };
    }

    const result = Object.assign({}, data);
    for (const field of Object.keys(schema)) {
        const spec = schema[field];
        const isObjSpec = typeof spec === "object" && spec !== null;
        const expectedType = isObjSpec ? spec.type : String(spec).replace(/\?$/, "");
        const hasDefault = isObjSpec && Object.prototype.hasOwnProperty.call(spec, "default");
        const optional = isObjSpec ? hasDefault : String(spec).endsWith("?");
        const checker = TYPE_CHECKS[expectedType];

        if (!checker) {
            return { ok: false, error: "字段 " + field + " 的 schema 类型 " + expectedType + " 未知" };
        }

        if (result[field] === undefined || result[field] === null) {
            if (hasDefault) {
                result[field] = spec.default;
            } else if (!optional) {
                return { ok: false, error: "字段 " + field + " 必填（" + expectedType + "）" };
            }
        } else if (!checker(result[field])) {
            return { ok: false, error: "字段 " + field + " 应为 " + expectedType };
        }
    }
    return { ok: true, value: result };
}

/**
 * 执行 run 函数，按 retry 配置自动重试
 * @returns {{ok: true, value: any} | {ok: false, error: Error}}
 */
async function callWithRetry({ type, run, step, context, maxRetry, retryMode }) {
    for (let attempt = 0; attempt <= maxRetry; attempt++) {
        if (attempt > 0) {
            log.warn("{type} 步骤第 {n}/{max} 次重试", type, attempt, maxRetry);
        }
        try {
            const result = await run(step, context);
            // run 显式返回 false 视作软失败，按 retryMode 决定是否重试
            if (result === false && (retryMode === "return-false" || retryMode === "all") && attempt < maxRetry) {
                continue;
            }
            return { ok: true, value: result };
        } catch (error) {
            // return-false 模式：仅返回 false 重试，抛错立即向上
            if (retryMode === "return-false") return { ok: false, error };
            // throw / all 模式：用尽后向上
            if (attempt >= maxRetry) return { ok: false, error };
        }
    }
    // 走到这表示 retryMode 包含 return-false 且重试用尽
    return { ok: true, value: false };
}

function buildHandler({ type, schema, run, swallow, retry, retryOn }) {
    return async function(step, context) {
        // 1. schema 校验
        let processedStep = step;
        if (schema) {
            const validated = validateSchema(step.data, schema, type);
            if (!validated.ok) {
                log.error("{type} 步骤数据校验失败: {error}", type, validated.error);
                return;
            }
            processedStep = Object.assign({}, step, { data: validated.value });
        }

        // 2. 解析重试配置：step 级覆盖 defineStep 默认
        const maxRetry = typeof step.retry === "number" && step.retry >= 0 ? step.retry : (retry || 0);
        const retryMode = step.retryOn || retryOn || "throw";

        // 3. 执行（含重试）
        const outcome = await callWithRetry({ type, run, step: processedStep, context, maxRetry, retryMode });
        if (outcome.ok) return outcome.value;

        // 4. 最终失败兜底
        log.error("执行 {type} 步骤时出错: {error}", type, outcome.error.message);
        if (!swallow) throw outcome.error;
    };
}

/**
 * 定义步骤处理器
 * @param {Object} options
 * @param {string} [options.type] - 单个 step 类型名（与 types 二选一）
 * @param {string[]} [options.types] - 多个共享 handler 的类型名
 * @param {Object} [options.schema] - data 字段 schema（可选）
 * @param {Function} options.run - 业务逻辑 (step, context) => any
 * @param {boolean} [options.swallow=false] - 是否吞掉异常（默认 throw 由上层 executor 处理）
 * @param {number} [options.retry=0] - 失败时的默认重试次数（step.retry 可覆盖）
 * @param {"throw"|"return-false"|"all"} [options.retryOn="throw"] - 触发重试的条件（step.retryOn 可覆盖）
 * @returns {{type, handler}|Array<{type, handler}>} 注册条目
 */
export function defineStep({ type, types, schema, run, swallow = false, retry = 0, retryOn = "throw" }) {
    if (Array.isArray(types)) {
        const handler = buildHandler({ type: types[0], schema, run, swallow, retry, retryOn });
        return types.map(t => ({ type: t, handler }));
    }
    return { type, handler: buildHandler({ type, schema, run, swallow, retry, retryOn }) };
}

