/**
 * 步骤处理器声明式包装
 *
 * 提供：
 *   - 统一 try/catch 兜底：swallow=true 时调 logCaughtError（message→error / stack→debug）；
 *     swallow=false 时静默 throw 让上层最终处理点统一打日志，避免冒泡链双重日志
 *   - 取消异常透传（rethrowIfCancellation）：取消信号始终一路向上到顶层，不会被任何 step 吞掉
 *   - 可选 schema 校验（声明式校验 step.data 字段，省去重复手写 typeof/range 检查）
 *   - step 级重试（retry/retryOn）：失败先重试 N 次再走 swallow/throw 路径，
 *     避免瞬时 OCR / 网络 / 模板匹配抖动直接拖累整个委托
 *   - swallow 选项：默认抛出错误让上层 executor 计数重试；某些处理器（auto-fight、user-branch-select）
 *     现行就是吞错继续，传 swallow: true 即可保留行为
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
import { logCaughtError, rethrowIfCancellation } from "../utils/error-utils.js";

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
        } else if (isObjSpec && Array.isArray(spec.options) && !spec.options.includes(result[field])) {
            return { ok: false, error: "字段 " + field + " 只能是 " + spec.options.join("、") };
        }
    }
    return { ok: true, value: result };
}

export { validateSchema };

/**
 * 执行 run 函数，按 retry 配置自动重试
 *
 * 取消异常（isCancellationError）任何时候都立即透传，不计入重试 —— 用户已经主动停止，
 * 没必要再 retry。
 *
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
            rethrowIfCancellation(error);
            // return-false 模式：仅返回 false 重试，抛错立即向上
            if (retryMode === "return-false") return { ok: false, error };
            // throw / all 模式：用尽后向上
            if (attempt >= maxRetry) return { ok: false, error };
        }
    }
    // 走到这表示 retryMode 包含 return-false 且重试用尽
    return { ok: true, value: false };
}

function buildHandler({ type, validateData, run, swallow, retry, retryOn }) {
    return async function(step, context) {
        // 1. schema 校验
        const validated = validateData(step.data);
        if (!validated.ok) {
            // 配置错误，非运行时异常 —— 无 stack 可言，直接 log.error 即可
            log.error("[processor:{type}] step.data 校验失败: {error}", type, validated.error);
            return;
        }
        const processedStep = Object.assign({}, step, { data: validated.value });

        // 2. 解析重试配置：step 级覆盖 defineStep 默认
        const maxRetry = typeof step.retry === "number" && step.retry >= 0 ? step.retry : (retry || 0);
        const retryMode = step.retryOn || retryOn || "throw";

        // 3. 执行（含重试）
        const outcome = await callWithRetry({ type, run, step: processedStep, context, maxRetry, retryMode });
        if (outcome.ok) return outcome.value;

        // 4. 最终失败处理
        //   swallow=true  → 本层就是最终处理点，message+stack 都打全（stack 走 debug 不污染遮罩）
        //   swallow=false → 中间层静默 throw，由 commission-context.runStepsWithContext 等最终
        //                   处理点统一记录，避免冒泡链双重日志
        if (swallow) {
            logCaughtError("processor:" + type, "执行 " + type + " 步骤", outcome.error);
            return;
        }
        throw outcome.error;
    };
}

/**
 * 定义步骤处理器
 * @param {Object} options
 * @param {string} options.type - 唯一步骤类型名
 * @param {Object} [options.schema] - data 字段 schema（可选）
 * @param {(data: Object) => string|void} [options.validate] - schema 通过后的附加校验（可选）
 * @param {Function} options.run - 业务逻辑 (step, context) => any
 * @param {boolean} [options.swallow=false] - 是否吞掉异常（默认 throw 由上层 executor 处理）
 * @param {number} [options.retry=0] - 失败时的默认重试次数（step.retry 可覆盖）
 * @param {"throw"|"return-false"|"all"} [options.retryOn="throw"] - 触发重试的条件（step.retryOn 可覆盖）
 * @returns {{type, handler, schema, validateData}} 注册条目
 */
export function defineStep({ type, schema, validate, run, swallow = false, retry = 0, retryOn = "throw" }) {
    const validateData = data => {
        const schemaResult = schema ? validateSchema(data, schema, type) : { ok: true, value: data };
        if (!schemaResult.ok || !validate) return schemaResult;
        const error = validate(schemaResult.value);
        return error ? { ok: false, error: String(error) } : schemaResult;
    };
    return {
        type,
        handler: buildHandler({ type, validateData, run, swallow, retry, retryOn }),
        schema,
        validateData,
    };
}
