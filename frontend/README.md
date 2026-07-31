# 遮罩页面前端

本目录包含 BetterGI 四个 HTML 遮罩页面的 Vue 3 + TypeScript 源码。运行时只依赖仓库根目录的 `web/` 编译产物。

## 首次安装

在 `frontend` 目录打开 PowerShell：

```powershell
npm install
```

## 日常编译

修改 `frontend/src/` 后必须执行完整构建，BetterGI 才能读取到最新页面：

```powershell
cd AutoCommission-Pro\frontend
npm run build
```

构建会先运行 Vue TypeScript 检查，再生成以下单文件产物：

- `../web/commission-config/index.html`
- `../web/process-editor/index.html`
- `../web/path-recorder/index.html`
- `../web/developer-test/index.html`

BetterGI 使用的是 `web/` 中的产物，不会直接加载 `frontend/src/`。源码修改后如果没有执行 `npm run build`，遮罩界面不会变化。

## 开发与检查

流程编辑器本地预览：

```powershell
npm run dev:process-editor
```

其他页面可使用 `dev:commission-config`、`dev:path-recorder` 或 `dev:developer-test`。提交前建议执行：

```powershell
npm run lint
npm run typecheck
npm test
npm run build
```

开发服务器默认启用本地 `htmlMask` 模拟器；生产构建固定使用 BetterGI 注入的 `window.htmlMask`，不包含调试入口或远程资源。
