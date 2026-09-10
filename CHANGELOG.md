# 修订记录

本文件记录本 fork 相对上游 [bilbillm/deepseek-harness-angelina-themes](https://github.com/bilbillm/deepseek-harness-angelina-themes) 的差异。上游自 2026-08 起未再提交。

## fork 保留的改动

### 适配 DSH 核心的模块重命名

客户端 store 的模块标识符由 `@deepseek-ai/dsh-client-runtime` 改为 `@deepseek-ai/dsh-client-store`（6 个文件共 8 处）。DSH 核心自 0.1.2 起不再发布 `dsh-client-runtime`，改由 `dsh-client-store` 提供同一套 store 契约（`defineStore` 等实现逐字节相同）；沿用旧标识符会让插件在浏览器端加载失败并报 `Failed to load plugins`。

涉及文件：`src/client/store.ts`、`src/client/index.ts`、`src/platform.d.ts`、`tsdown.config.ts`、`vitest.config.ts`、`package.json`。

### 主题持久化修复

DSH 宿主只把内建偏好 `light`/`dark`/`system` 写入 `settings.yaml`，第三方主题 id 永远不落盘；同时宿主在设置异步到达后会覆盖内存中的偏好，插件随即把本地记录反向写成 `system`，导致刷新/重启后主题被重置。

本 fork 改为让皮肤搭在宿主自己的明暗轴上：两份调色板合并成单层 `{light, dark}` token 覆盖表（`ctx.theme.overrideTokens`），不再注册第三方主题 id。亮暗由宿主偏好唯一决定，`localStorage` 只记录"皮肤是否开启"；设置页提供「恢复默认外观」以退回内置外观。

### 槽位选择器适配当前 Harness DOM

当前 Harness 把会话列渲染为 `[data-slot='main.conversation']`，且不提供 `data-ds-app-frame` / `data-ds-conversation-column`。原选择器只匹配旧槽位名，会导致画图规则全部落空、宿主自带的不透明底色盖住视差图层。现已扩为 `:is([data-slot='conversation'], [data-slot='main.conversation'])` 兼容新旧命名。

### 视差人物层

- 两套配色共用同一张人物图、同一个锚点，暗色仅施加 `brightness(0.62) saturate(0.92)` 调色。此前亮暗各用独立人物图，切换配色时人物位置与宽度都会变化。
- 人物层不再沿用背景的 `cover`，改为按视口高度定尺寸并锚在右下角（`auto 88vh` + `right 40px bottom 0`），占屏比例在任意窗口宽高比下保持一致。
- 修复同一配色重复 `sync()` 被误判为被动模式、导致位移停写的问题（根上挂 owner 回指识别自有图层）。
