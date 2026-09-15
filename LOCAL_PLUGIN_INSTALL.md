# 当前实例的公开插件

当前核对日期：2026-09-15。目标是本仓库独立的 `.storages/dsh-home/profiles/web`，未修改 `C:\Users\LansNi\.dsh` 或旧源码目录。10 个直接依赖插件包已安装；Agent Teams 和 Outline 因接口不兼容而停用，UI 全家桶中的重复侧栏条目也停用，独立 Better Sidebar 保持启用。

## 版本与来源

首次安装日期为 2026-09-10，当时按用户要求核实最新公开版本，包括预发布版。下表反映 2026-09-15 的本地安装文件，不表示再次查询过最新版本；本次诊断未升级或降级插件。

| 用户所指插件 | 实际安装包与版本 | 来源 | 加载状态 |
|---|---|---|---|
| 插件市场 | `dshmarket@1.47.0` | npm；[作者仓库](https://github.com/dsh-market/dsh-market) | 启用 |
| Better Sidebar | `dsh-better-sidebar@0.19.0` | npm；[作者仓库](https://github.com/omdsh-dev/DSH-better-sidebar) | 启用 |
| Outline | `dsh-outline@0.1.6` | npm | 已安装，停用 |
| Agent Teams | `@nanmicoder/dsh-agent-teams@0.1.16-rc.3` | npm `next`；[作者仓库](https://github.com/NanmiCoder/dsh-agent-teams) | 已安装，停用 |
| GenUI | `@changfenhuang/dsh-genui@0.9.10-preview.1` | npm `preview`；[作者仓库](https://github.com/omdsh-dev/dsh-genui) | 启用 |
| Visualize | `@dsh-external/dsh-visualize@0.1.2` | [作者仓库](https://github.com/Nagi-ovo/dsh-visualize)，提交 `9667c0e9cf0ea463b9b45b2845de62da34fd918a` | 启用 |
| UI Hub | `dsh-ui-hub@0.1.0` | [作者仓库](https://github.com/Han-1413141/dsh-ui-hub)，提交 `d1ecaffed06a03696ebd77f40c4c61d1cb558f8f` | 启用 |
| Skill Viewer 后续版本 | `dsh-skill-mcp-panel@2.0.3` | [作者发布包](https://github.com/Fishquito7/dsh-skill-mcp-panel/releases/tag/v2.0.3) | 启用 |
| 费用统计 | `dsh-cost-meter@1.7.23` | npm | 启用 |
| Web UI 全家桶 | `@linxin666/dsh-web-all@0.3.22` | npm | 启用；重复侧栏条目停用，其他条目保持原配置 |

`dsh-skill-viewer` 的作者仓库已重定向到 `dsh-skill-mcp-panel`，新版保留技能管理并增加 MCP 管理。GenUI 的当前 npm 包名是 `@changfenhuang/dsh-genui`，不是旧的 `@omdsh-dev/dsh-genui`。

UI Hub 和技能面板通过上游原始压缩包的本地缓存安装，文件位于 `.storages/plugin-downloads`，未修改插件代码。插件市场因此将它们标为“本地开发”，这表示安装来源是 `file:`，不是另行开发的版本。该缓存也是以后重新安装所需的输入，不要随意删除。技能面板发布包的 SHA-256 与 GitHub Release 公布的摘要一致：

```text
8a373de68c5036894194e739ac70f08bda3ffb2da7f5944e6cd76e6395191cd2
```

## Agent Teams 的停用原因

当前 Harness 为 `0.1.5-rc.1`。加载最新 Agent Teams `0.1.16-rc.3` 时，插件主动拒绝启动：

```text
agent-teams: unsupported Harness subagent contract
(cannot install complete retired-member guard)
```

该插件的 `lib/harness-compat.js` 要求 `followup`，或者 `Symbol.for('dsh.subagent.queuePrompt')` 与 `sendMessage` 的组合；当前 Harness 不具备它要求的完整组合。插件声明的测试版本仍是 `0.1.2` 系列。没有删除兼容性检查、修改插件源码、降级 Harness 或换装旧插件。

本实例的 `cordis.patch.yml` 保留如下覆盖，使其他插件和 Web UI 能正常启动：

```yaml
- id: agent-teams
  disabled: true
```

在插件市场手动打开 Agent Teams 会再次触发该失败。应在作者发布适配当前 Harness 的版本后，再升级并移除停用覆盖。

## 侧栏冲突与大纲兼容性

独立 Better Sidebar 的 bundle 插入 `better-sidebar`，Web UI 全家桶又插入 `web-ui-better-sidebar`，两者均加载 `dsh-better-sidebar`。当前 bundle 顺序使独立侧栏的去重表达式看不到后面的全家桶条目，启动报 `failed to apply loader entry web-ui-better-sidebar` 和 `webserver: duplicate prefix route "/sidebar/api"`。本地用户覆盖停用全家桶的重复条目，保留独立侧栏；无需修改插件源码、依赖版本或加载顺序。

Outline 0.1.6 将 `binding.session.getSnapshot()` 当作包含 `nodes` 的会话展示快照，但当前 Harness 的 `SessionSnapshot` 只持有会话生命周期与控制状态。绑定会话后，大纲面板报 `TypeError: snapshot.nodes is not iterable`，`shell.overlay` 中的大纲条目崩溃。这不是服务启动失败的原因；本地停用该插件以隔离前端故障，未对第三方代码做接口适配。

除 Agent Teams 的原有覆盖外，profile 的 `cordis.patch.yml` 包含：

```yaml
- id: web-ui-better-sidebar
  disabled: true
- id: outline
  disabled: true
```

不要同时启用两个侧栏条目。Outline 和 Agent Teams 应在兼容版本经过验证后再启用。Git Graph 仍报告 `auto-isolation disabled`，因工作区服务接口不兼容而采用官方新会话行为；这个警告不阻止启动，自动隔离功能未修复。

## 当前验证范围

2026-09-15 使用原启动入口复现重复路由失败。修复后验证认证首页和侧栏只读接口均返回 HTTP 200，侧栏依赖检查返回 `ok: true`；UI 全家桶健康接口返回 `degraded: []`。浏览器主界面、设置和全局插件列表正常显示，独立侧栏为运行中，重复侧栏、Outline 与 Agent Teams 为已停用。停用 Outline 后刷新页面没有控制台错误，保留上述 Git Graph 警告。

本次只修改本地用户覆盖；未改动模型、凭据、会话文件或皮肤配置，未发送模型请求，也未验证终端操作、Git 操作、多 Agent 任务或自动隔离功能。启动时插件自身仍会执行正常的账本、统计等初始化。

修复前的 profile 元数据备份在 `.storages/plugin-install-backups/20260915-before-sidebar-dedup`，诊断日志和浏览器证据在 `tmp/startup-diagnosis-20260915`。备份只用于回溯；恢复旧覆盖会重新启用冲突条目。需要撤销某一项时，停止服务后仅删除对应的 `disabled` 覆盖，不要整体覆盖其他配置。

## 首次安装验证

以下为 2026-09-10 的检查记录，不代替上面的当前验证：

- 8 个依赖的实际版本、主入口文件、bundle 声明与 profile 登记均通过检查。
- 停用 Agent Teams 后，官方 `dsh web` 入口启动成功；浏览器页面正常显示。
- 插件市场能显示安装清单、具体版本和启停状态。
- 技能面板能读取技能，MCP 面板能读取空配置；未新增 MCP 服务或修改现有技能。
- 大纲面板和 UI Hub 控制面板能展开。
- GenUI 浏览器日志出现 `[genui] client active; fence-channel=dom`。
- 检查时未见浏览器控制台警告或错误；Better Sidebar、Visualize 已由 profile 加载，并在市场显示启用。
- TokenRouter 的 29 个模型仍能由运行时枚举，凭据解析正常，验证未调用模型。

这些是安装和初始化检查，不是插件全部功能的端到端验收。未运行多 Agent 任务、终端命令、Git 修改、MCP 连接、AI 生成图表或 HTML 的任务；本次未发起收费模型请求。未安装列表外的可选插件，也未对插件源码做兼容性补丁。

## 启动与回溯

继续使用根目录的 [start.bat](start.bat) 或 [start.ps1](start.ps1)。页面里的插件市场可查看已安装插件；技能与 MCP 入口位于设置菜单。手动打开页面需使用终端打印的带认证令牌地址。

实际安装清单、锁文件、原生依赖构建许可和停用覆盖分别由 profile 下的 `package.json`、`pnpm-lock.yaml`、`pnpm-workspace.yaml`、`cordis.patch.yml` 持有；这些运行配置均被 Git 忽略，本说明不含密钥。

安装前的 profile 元数据备份在 `.storages/plugin-install-backups/20260910-before-public-plugins`。其中另存的 `failed-remote-tarball-lock.yaml` 是下载失败时生成的诊断文件，不是恢复基线。恢复时应先停止 Web 服务，并根据备份恢复原有元数据和对应依赖，不能只删除插件目录。
