# 当前实例的插件与浏览器控制

本实例使用官方发布 `dsh-v0.1.6-alpha.1`，保留 `lans` 分支的本地启动脚本和插件。运行配置位于 `.storages/dsh-home/profiles/web`；个人目录下的 DSH 和旧源码目录不受影响。继续使用 [start.bat](start.bat) 或 [start.ps1](start.ps1)，默认地址为 `127.0.0.1:3080`。

## 从克隆还原插件

插件依赖、bundle 列表、启停覆盖和锁文件都是运行配置，原先只存在于被 `.gitignore` 忽略的 `.storages/dsh-home/profiles/web`，所以重新克隆得不到任何第三方插件。现在这份配置以 [local-plugins/profile](local-plugins/profile) 的种子随 Git 分发，两个本地 tar 包源在 `local-plugins/vendor`。

克隆后运行：

```powershell
.\bootstrap-profile.ps1
```

脚本把种子五份文件复制到 `.storages/dsh-home/profiles/web`，再执行 `corepack pnpm install --frozen-lockfile`。种子中的依赖路径全部相对于该目标位置（向仓库根回溯四级），因此只能铺到 `start.ps1` 固定的 DSH home；其他位置会在安装前被拒绝。目标已有 profile 时脚本报错退出，需要先停止 DSH 再加 `-Force`。

本地 tar 包源的 SHA-256：`dsh-skill-mcp-panel-2.0.4.tgz` 为 `899032938e14052fe235de1067f94c1def075d6718cea629b558b98b0f630116`，`dsh-ui-hub-d1ecaffe.tgz` 为 `cfc069933d157d0f498314c66d55a9006994846dd230acda91c031472197e3db`。

种子不含凭据、`settings.yaml`、会话、皮肤和运行数据；这些仍留在本机 `.storages` 中，克隆后需要另行配置。

## 官方操作能力

Profile 显式挂载 `@deepseek-ai/dsh-browser-use`、`@deepseek-ai/dsh-experimental-browser-use-playwright-mcp`、`@deepseek-ai/dsh-computer-use` 和 `@deepseek-ai/dsh-experimental-computer-use-cua-driver-native`，均来自同一份官方源码。

浏览器使用本机 Edge、`mode: launch`、`headless: true`。每个活动会话拥有独立浏览器，不附加到用户的日常浏览器，不复用已有登录状态。新建或恢复会话时初始化工具；只刷新前端不会为已经活动的会话补装浏览器连接。关闭活动会话会释放它拥有的浏览器。

Computer Use 使用官方固定的 Cua Driver `0.28.0`，注册 56 个 `cua_driver_native__` 工具。它在普通 DSH Node 进程内运行，不调用旧 Sky 适配器，也不需要伪造 Codex 身份。该提供者没有旧 Sky 插件的独立应用白名单和模式设置卡；现有 DSH 权限设置保持原样，不表示 Windows 桌面被隔离。多个会话共享桌面，避免并发运行桌面操作任务。

旧 `dsh-sky-computer-use@0.1.0` 保留安装，整条插件记录停用，原有配置不删除。其原生授权限制没有被绕过。官方浏览器和桌面提供者仍为实验功能，操作取消不能撤销已经交付的输入。详细规则见[浏览器操作](docs/subsystems/browser-use.zh.md)和[原生 Computer Use](packages/experimental/computer-use-cua-driver-native/README.zh.md)。

## 第三方插件

版本依据 npm 实时 dist-tags、作者 GitHub Release 和源仓库默认分支核对。GenUI 沿用预览通道；没有以较低稳定版覆盖较新预览版。

| 插件 | 安装版本 | 状态 |
|---|---|---|
| GenUI | `@changfenhuang/dsh-genui@0.11.1-preview.2` | 启用 |
| Web UI 全家桶 | `@linxin666/dsh-web-all@0.3.23` | 启用；重复侧栏和已关闭的装饰组件停用 |
| Agent Teams | `@nanmicoder/dsh-agent-teams@0.1.18` | 本地兼容补丁，启用 |
| Better Sidebar | `dsh-better-sidebar@0.19.1` | 唯一启用的 Better Sidebar |
| 费用统计 | `dsh-cost-meter@1.7.28` | 启用 |
| Skill / MCP 面板 | `dsh-skill-mcp-panel@2.0.4` | 作者 Release 压缩包，启用 |
| Outline | `dsh-outline@0.1.6` | 本地兼容补丁，启用 |
| 插件市场 | `dshmarket@1.47.0` | 启用，无新版本 |
| Visualize | `@dsh-external/dsh-visualize@0.1.2` | 启用，作者默认分支未变化 |
| UI Hub | `dsh-ui-hub@0.1.0` | 启用，作者默认分支未变化 |

安装来源和完整性由 profile 的 `package.json`、`pnpm-lock.yaml`、`pnpm-workspace.yaml` 持有。Skill / MCP 面板的本地压缩包在 `.storages/plugin-downloads/dsh-skill-mcp-panel-2.0.4.tgz`，SHA-256 已与 GitHub Release 的资产摘要核对。Visualize 和 UI Hub 保留原来的固定源码来源。

## 兼容补丁

[local-plugins/patches](local-plugins/patches/README.md) 保存两个精确版本的 pnpm 补丁。Profile 的 `patchedDependencies` 引用这些受 Git 管理的文件，重新安装依赖会重放补丁，不依赖手工修改 `node_modules`。

Agent Teams 的两处成员初始化监听从已移除的 `agent/session-start` 改为串行 `agent/created`。保留原有队列、退出成员保护、失败阻断和授权逻辑。真实 Agent 创建测试证明初始化在创建返回前完成，成员工具受到限制，插件卸载只清理一次。

Outline 订阅 `uiConversation.binding(binding).target('chat')`，从 Chat 的 `legacy` 投影提取历史消息和流式标题，不再将 `SessionSnapshot` 当成聊天记录；点击定位使用新版 `conversation.session` 容器。发布的浏览器代码、源文件和受影响声明同步修改。加载已有会话和展开大纲已经验证。

`web-ui-better-sidebar` 继续停用，避免重复注册 `/sidebar/api`。原设置中的 `pet.enabled: false` 和 `decorationEnabled: false` 保持不变；对应 `web-ui-pet` 行也停用，避免客户端继续轮询已关闭的接口。Git Graph 仍报告自动隔离不可用，使用官方的新会话行为；本次不修复它的自动隔离功能。

## 验证范围

- 官方锁文件安装、完整构建通过。
- 浏览器和原生提供者的 53 项定向单元测试通过。
- Playwright MCP 实际启动独立 Edge，访问本机测试页并释放会话；本次未测试附加用户浏览器。
- 原生 SDK 的工具发现、无提示权限读取和卸载测试通过。
- 普通 Node 中通过 DSH 工具执行管线操作专用 WinForms 测试窗口，后台输入中文；UIA 和应用属性均回读成功，窗口截图已视觉核对，最后卸载驱动并关闭测试窗口。
- 三项第三方补丁回归测试、旧 Sky 插件的 64 项隔离测试和 3 项装配测试通过。
- 原启动入口提供新版页面，已有会话可读取；刷新后无控制台错误，保留 Git Graph 警告。
- `settings.yaml`、`.credentials.yaml` 和 `skin-center-active.json` 与升级前备份的文件哈希一致。

这些结果不代替真实模型驱动的完整网页或桌面任务验收。本次没有发送收费模型请求，没有关闭 Codex 再复测，也没有运行 Agent Teams 的完整多成员模型任务。原生截图检查使用直接工具调用；当前模型路由能否最终接收截图仍需实际模型会话验证。

`doc-sync` 总检查未全通过：原有未跟踪目录 `ds_test2/blackhole/README.md` 缺少双语配对，另有文档站测试因 Windows 创建文件符号链接返回 `EPERM` 而失败。没有为这些检查修改无关目录、系统权限或放宽规则。本次文档配对和代码检查单独验收。

## 备份与回滚

升级前 Git 基线由 `codex/backup-before-0.1.6-alpha.1-20260917` 分支保留。运行数据与 profile 元数据备份在 `.storages/upgrade-backups/20260917-before-0.1.6-alpha.1/dsh-home`，不包含可重新安装的 `node_modules`；该目录包含凭据和会话，不要提交或分享。

构建和服务日志保存在同一备份父目录，测试材料在 `tmp/upgrade-20260917`。服务日志可能包含本地访问令牌，不要分享原始日志。

回滚前停止当前服务。仅关闭新增控制能力时，在 profile 覆盖中停用 `browser-use-playwright-mcp` 与 `computer-use-cua-driver-native` 两行，不必恢复旧会话或模型设置。移除第三方补丁时同时调整 `patchedDependencies`、安装锁文件和插件启用状态；没有补丁的 Agent Teams 与 Outline 必须恢复停用。

需要整版回滚时，先另存升级后新增的会话和设置，再使用备份 Git 基线及升级前数据副本重建环境。不能只降级源码后继续写升级后的会话，也不要用旧备份覆盖后续用户编辑。未推送远端，原 `ds_test2/` 保持不变。
