# 架构优化待办

> 背景：BGI JS 脚本插件（详见 [CLAUDE.md](CLAUDE.md)）。本文件按优先级整理架构与代码质量改进项，供新对话直接引用。
>
> **已完成**：第一组运行时 bug 修复（completion-detector.js / commission-recognizer.js 的 `./status-detector.js` 路径错误、commission-recognizer.js 缺失的 `COMMISSION_POSITIONING_BUTTONS` import、npc-executor.js 中 `step` 的 TDZ ReferenceError、CLAUDE.md 过时条目）于 2026-05-15 完成。

---

## 二、架构层（高优先级）

### #1 stepRegistry 注入不对称 → 升级 context 为一等公民

- [ ] 抽出 `createCommissionContext({type, commission, processSteps, processDir, stepRegistry})` 工厂

**现状**：
- [src/core/npc-executor.js:79-84](src/core/npc-executor.js#L79-L84) 把 `stepRegistry` 注入 context
- [src/core/basic-executor.js:60-65](src/core/basic-executor.js#L60-L65) 不注入

**后果**：
- `用户分支选择` 在 Basic 委托中直接 NPE（`context.stepRegistry.process(...)` 找不到）
- `commission-desc-detect` / `location-detection` 调 `context.processSteps.splice(...)`，Basic 委托没有 `processSteps`

**建议**：放在 [src/core/](src/core/) 下统一构造 context，让 NPC/Basic 走同一路径；把"动态插步骤""递归调度"做成显式 capability 字段，而不是靠字段缺失隐式 disable。

---

### #2 处理器反向依赖 core → 模块分层倒置

- [ ] 把 `loadNpcProcessFile` 等流程加载逻辑下沉到 `src/loaders/` 或 [src/data/](src/data/)

**现状**：
- [src/processors/location-detection.js:10](src/processors/location-detection.js#L10) `import { loadNpcProcessFile } from "../core/npc-executor.js"`
- [src/processors/commission-desc-detect.js:6](src/processors/commission-desc-detect.js#L6) 同上

**后果**：`core → processors`（registerAllProcessors）与 `processors → core`（loadNpcProcessFile）双向依赖。

**建议**：抽到独立 loader 模块，core 与 processors 都单向依赖它。

---

### #3 路径解析散落 → 抽 ResourceResolver

- [ ] 在 context 注入 `resolveResource(filename)` 函数，由 NPC/Basic 工厂分别决定解析策略

**现状**：NPC 路径前缀拼接至少出现在 5 处：
- [src/core/npc-executor.js:20](src/core/npc-executor.js#L20)
- [src/processors/map-tracking.js:17](src/processors/map-tracking.js#L17)
- [src/processors/key-mouse-script.js:9](src/processors/key-mouse-script.js#L9)
- [src/processors/commission-desc-detect.js:51](src/processors/commission-desc-detect.js#L51)
- [src/processors/location-detection.js](src/processors/location-detection.js)（间接通过 `loadNpcProcessFile`）

**后果**：目录约定调整要改 5 个文件。

**建议**：处理器只调 `context.resolveResource(step.data)`，不再关心目录结构。NPC 工厂解析 `process/NPC/{name}/{location}/{file}`，Basic 工厂解析 `{processDir}/{file}`。

---

### #4 步骤注册"三步走"是机械重复

- [ ] 改成清单 + 集中注册：每个处理器文件 `export default { type, handler }`，[src/processors/index.js](src/processors/index.js) 单点 import 拼数组

**现状**：CLAUDE.md 自己写了新增 step 需要 (1) 实现 register；(2) 在 index.js 追加；(3) 改文档。第 (2) 步是机械重复，易漏。

**约束**：BGI 静态 import 限制，不能 fs.readdir 自动发现。

**建议**：用约定式的 `default export` 替代 N 个 `register*` 函数，减少一处易漏的同步点。

---

### #5 step 处理器样板代码过多 → defineStep wrapper

- [ ] 抽 `defineStep({ type, schema?, run })`，wrapper 统一负责 normalize / 校验 / catch / log

**现状**：每个处理器结构相似——try / 校验 step.data / 调外部 / log / catch。差异只在中间一两行。校验代码（`if (typeof x !== 'number')`）在 [传送](src/processors/teleport.js)、[地址检测](src/processors/location-detection.js) 等多处重复。

**示例**：
```js
defineStep({
    type: "传送",
    schema: { x: "number", y: "number", force: "boolean?" },
    run: async ({x, y, force = false}, ctx) => { await genshin.tp(x, y, force); }
});
```

**建议**：把 [src/processors/registry.js:48-59](src/processors/registry.js#L48-L59) 的 `normalizeStep` 字符串映射也搬进 wrapper。

---

### #6 重试机制只到委托级，步骤级没有

- [ ] 在 step 元数据加 `{retry: 2, retryOn: "all|throw|return-false"}`，wrapper 实现 step 级重试

**现状**：[src/core/commission-executor.js:107](src/core/commission-executor.js#L107) `MAX_COMMISSION_RETRY_COUNT = 1`。步骤一抛就整个委托重跑——白跑前面所有步骤、所有 OCR、所有传送。

**建议**：process.json 允许 `{ type: "对话", data: {...}, retry: 3 }`，配合 #5 wrapper 一并做。

---

### #7 JSON 流程文件无 schema

- [ ] 在 #5 的 `defineStep` 同时注册 schema，启动期遍历 `process/NPC/**/process.json` 做静态校验

**现状**：[委托流程制作教程.md](委托流程制作教程.md) 是手写文档。新人写错字段名，BGI 跑到那一步才发现。

**建议**：未知 step 类型 / 缺字段在启动 `registerAllProcessors` 之后早失败。校验只跑一次，不影响热路径。

---

## 三、代码质量（中优先级）

### #8 settings 读取仍混乱

- [ ] 处理器层统一从 context 读取设置，不再触全局 `settings`

**现状**：
- [src/utils/settings-utils.js](src/utils/settings-utils.js) 提供了 `getSetting()`
- 但 [src/processors/switch-team.js:17-18](src/processors/switch-team.js#L17-L18) 仍直接读 `settings.team` / `settings.elementTeam`

**建议**：main-process 把 settings 一次性注入 context，处理器不再触全局对象。

---

### #9 identification 错误语义模糊

- [ ] 删 dead-code 返回值，或把"识别结果在内存中流转"做实

**现状**：
- [src/core/main-process.js:48](src/core/main-process.js#L48) 失败时 `return []`，成功返回 `commissions`
- [src/core/main-process.js:82](src/core/main-process.js#L82) 调用方根本没接返回值
- [src/core/commission-executor.js:84](src/core/commission-executor.js#L84) 直接读 `Data/commissions_data.json`

**建议**：返回值是 dead code。要么删掉，要么不走文件 IPC（除非 `skipRecognition` 需要持久化）。

---

### #10 测试模式的副作用

- [ ] `runTestCommission()` 返回 `{ skipMain: boolean }`，或 settings 加显式 `mode: "test"|"production"`

**现状**：[main.js:14-16](main.js#L14-L16) 跑完 `runTestCommission()` 后继续跑 `executeMainProcess`。CLAUDE.md 说"调试时通常让游戏不在主界面或抛错来终止"——这是 hack。

**建议**：魔法字符串 `114514` 可保留作快捷开关。

---

### #11 logging 模板混用

- [ ] 约定日志关键字段命名（`{commission}` / `{step}` / `{type}`）

**现状**：混用 `log.info("xxx {x}", x)` 与多占位符版本，无统一字段约定。

**建议**：便于 grep 与未来上结构化日志。

---

## 四、可选 / 长期

### #12 process.json 类型化

- [ ] 维护 `types/processors.d.ts`（纯文档，BGI 宿主不需要）

**收益**：编辑器智能提示。

---

### #13 commission-config.html 与运行时配置共用 schema

- [ ] 把字段定义提到单点 JSON schema，HTML 与 [src/processors/user-branch-select.js](src/processors/user-branch-select.js) 都引用

**现状**：[commission-config.html](commission-config.html) 是离线 GUI 编辑 [process/config/commission-branches.json](process/config/commission-branches.json)，schema 变化时两边易分裂。

---

### #14 步骤可中断 / 断点恢复

- [ ] 在 `Data/` 下记录 `{commissionName, lastSuccessIndex}`，重试时跳过已完成步骤
- [ ] 只对幂等 step 安全，需在 `defineStep` 上声明 `idempotent: true`

**现状**：长 NPC 流程跑到第 8 步失败，下次还是从头再来。

---

## 推荐落地顺序

1. **#1 + #2 + #3**（context 工厂 + 反向依赖 + ResourceResolver）—— 同一波清掉"NPC/Basic 不对称"与"路径硬编码"
2. **#5 + #6 + #7**（defineStep wrapper + step 级重试 + schema 校验）—— 一次性升级处理器层模板，新增 step 受益最大
3. **#4**（步骤注册改清单）—— 配合 #5 顺手做
4. **#8 ~ #11**（中优先级）—— 日常 cleanup 跟进
5. **#12 ~ #14**（长期）—— 视需求安排
