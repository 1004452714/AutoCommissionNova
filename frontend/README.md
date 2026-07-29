# 遮罩页面前端

本目录包含 BetterGI 四个 HTML 遮罩页面的 Vue 3 + TypeScript 源码。运行时只依赖仓库根目录的 `web/` 编译产物。

```powershell
npm install
npm run dev:commission-config
npm run typecheck
npm run test
npm run build
```

开发服务器默认启用本地 `htmlMask` 模拟器；生产构建固定使用 BetterGI 注入的 `window.htmlMask`，不包含调试入口或远程资源。
