/**
 * 步骤处理器声明式包装
 *
 * 提供：
 *   - 统一 try/catch + log.error 兜底（措辞统一为"执行 X 步骤时出错: ..."）
 *   - 可选 schema 校验（声明式校验 step.data 字段，省去重复手写 typeof/range 检查）
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

function buildHandler({ type, schema, run, swallow }) {
    return async function(step, context) {
        try {
            if (schema) {
                const validated = validateSchema(step.data, schema, type);
                if (!validated.ok) {
                    log.error("{type} 步骤数据校验失败: {error}", type, validated.error);
                    return;
                }
                step = Object.assign({}, step, { data: validated.value });
            }
            return await run(step, context);
        } catch (error) {
            log.error("执行 {type} 步骤时出错: {error}", type, error.message);
            if (!swallow) throw error;
        }
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
 * @returns {{type, handler}|Array<{type, handler}>} 注册条目
 */
export function defineStep({ type, types, schema, run, swallow = false }) {
    if (Array.isArray(types)) {
        const handler = buildHandler({ type: types[0], schema, run, swallow });
        return types.map(t => ({ type: t, handler }));
    }
    return { type, handler: buildHandler({ type, schema, run, swallow }) };
}
