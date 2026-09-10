# 当前实例的公开插件

核对与安装日期：2026-09-10。目标是本仓库独立的 `.storages/dsh-home/profiles/web`，未修改 `C:\Users\LansNi\.dsh` 或旧源码目录。8 个包均已安装，其中 7 个启用并通过启动检查，Agent Teams 因与当前 Harness 接口不兼容而停用。

## 版本与来源

按用户要求选择本次能核实的最新公开版本，包括版本号更高的预发布版。npm 包使用明确版本号；只有 GitHub 源码的插件固定到本次查询的主分支提交。版本选择与安装后的 `package.json` 已逐项核对。

| 用户所指插件 | 实际安装包与版本 | 来源 | 加载状态 |
|---|---|---|---|
| 插件市场 | `dshmarket@1.45.1` | npm；[作者仓库](https://github.com/dsh-market/dsh-market) | 启用 |
| Better Sidebar | `dsh-better-sidebar@0.19.0` | npm；[作者仓库](https://github.com/omdsh-dev/DSH-better-sidebar) | 启用 |
| Outline | `dsh-outline@0.1.6` | npm；其 package 元数据所指的 GitHub 仓库本次查询返回 404 | 启用 |
| Agent Teams | `@nanmicoder/dsh-agent-teams@0.1.16-rc.3` | npm `next`；[作者仓库](https://github.com/NanmiCoder/dsh-agent-teams) | 已安装，停用 |
| GenUI | `@changfenhuang/dsh-genui@0.9.10-preview.1` | npm `preview`；[作者仓库](https://github.com/omdsh-dev/dsh-genui) | 启用 |
| Visualize | `@dsh-external/dsh-visualize@0.1.2` | [作者仓库](https://github.com/Nagi-ovo/dsh-visualize)，提交 `9667c0e9cf0ea463b9b45b2845de62da34fd918a` | 启用 |
| UI Hub | `dsh-ui-hub@0.1.0` | [作者仓库](https://github.com/Han-1413141/dsh-ui-hub)，提交 `d1ecaffed06a03696ebd77f40c4c61d1cb558f8f` | 启用 |
| Skill Viewer 后续版本 | `dsh-skill-mcp-panel@2.0.3` | [作者发布包](https://github.com/Fishquito7/dsh-skill-mcp-panel/releases/tag/v2.0.3) | 启用 |

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

## 验证范围

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
