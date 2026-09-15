# 本地启动

本目录使用官方 DeepSeek Harness 源码，`origin` 保留官方上游，`master` 保留拉取基线，`lans` 用于本地修改。没有创建远程仓库或推送代码。

## 启动教程

在 PowerShell 中执行：

```powershell
cd D:\CodeProj\dsh_lans
.\start.ps1
```

也可以双击仓库根目录的 `start.bat`，或在 CMD 中运行 `start.bat -Port 3081 -NoOpen`。BAT 调用同一份 PowerShell 启动脚本，使用相同的数据目录和参数；执行策略放宽仅作用于这一次 PowerShell 子进程，不修改系统策略。

默认只监听 `127.0.0.1:3080`，并打开浏览器。手动打开时，请使用终端打印的完整地址，其中包含登录令牌；未认证时直接访问裸地址会返回 HTTP 401。不要分享带令牌的地址。在终端按 `Ctrl+C` 停止。

首次进入页面后，在“设置 → 模型”查看或调整提供方，再添加并选择工作区。此本机实例已经迁入旧实例的 TokenRouter 配置与对应凭据；这些内容不在 Git 中，重新克隆不会获得它们。真实模型调用未验证。详见[官方中文使用指南](docs/user/guide/index.zh.md)和[模型配置指南](docs/user/guide/providers.zh.md)。

本实例安装了 10 个直接依赖插件包；Agent Teams 和 Outline 因接口不兼容而保留安装但停用，UI 全家桶中的重复侧栏条目也停用，独立 Better Sidebar 保持启用。不要同时打开两个侧栏条目。具体版本、兼容性限制、验证范围和备份位置见[当前插件安装记录](LOCAL_PLUGIN_INSTALL.md)。

## Claude Fable 5.1

2026-09-15 核对 TokenRouter 实时 `GET /v1/models`，请求 ID 为 `claude-fable-5-1`，路由后端为 `bedrock`。本地 `.storages/dsh-home/settings.yaml` 的 `llm-pi-ai.providers.tokenrouter.models` 已包含该模型，保留旧 Fable 5 和其他模型，默认模型仍为 `deepseek-v4-flash`、推理等级仍为 `high`。

| 配置 | 值 |
|---|---|
| 显示名称 | `Claude Fable 5.1` |
| 请求 ID | `claude-fable-5-1` |
| 上下文窗口 | `1000000` tokens |
| 最大输出 | `128000` tokens，包含思考与回答 |
| 输入 | `text`、`image` |
| 推理等级 | `low`、`medium`、`high`、`xhigh`、`max`，同名发送 |
| 请求协议 | 保留 TokenRouter 的 `openai-completions` |
| 兼容参数 | `thinkingFormat: deepseek`、`supportsReasoningEffort: true` |

容量、模态和始终开启的自适应思考依据 [Anthropic 模型总览](https://platform.claude.com/docs/en/about-claude/models/overview)、[Fable 5.1 说明](https://platform.claude.com/docs/en/models/fable-5-1/overview)及[推理等级说明](https://platform.claude.com/docs/en/build-with-claude/effort)。不提供 `off` 或 `minimal`。官方推荐以 `high` 起步；没有为此改动整个提供方的默认推理等级。`thinkingFormat: deepseek` 是现有 OpenAI 兼容网关的请求编码方式，不表示模型采用 DeepSeek 的思考机制。

本地验证通过 DSH 的实际配置解析器及 pi-ai 适配器：容量和五档等级正确；每档均发送同名 `reasoning_effort`、`thinking: {type: enabled}` 与 `max_tokens`，不发送 `developer` 消息；不支持的 `off`、`minimal` 在网络请求前被拒绝。设置文件与备份的结构化比较确认只增加这一模型。

真实请求使用现有凭据，经 DSH 适配器以 `high` 和临时 `maxTokens: 1024` 发往 TokenRouter；返回 HTTP 502，内部为 Bedrock HTTP 403，报告其 AWS 身份无权执行 `bedrock:InvokeModel`。因此当前状态是「已配置，上游权限阻塞」，不是生成验证通过；五档真实推理、图片与工具调用均未完成端到端验收。需要 TokenRouter 管理端检查该模型的 Bedrock 调用权限及 inference profile 授权，不能靠更改本地上下文窗口解决。

没有重启正在运行的 DSH；配置按下一次读取生效，页面如未显示新增项可刷新。设置备份在 `.storages/model-config-backups/20260915-before-fable-5-1/settings.yaml`，实时目录、官方资料与验证脚本位于 `tmp/fable-5-1-20260915`。回滚时仅删除该模型条目，保留其他设置；不要用旧备份覆盖后续编辑。模型配置与凭据均不进入 Git。

## 本地参数

不自动打开浏览器：

```powershell
.\start.ps1 -NoOpen
```

端口被占用时指定其他端口，或传入 `0` 自动选择空闲端口：

```powershell
.\start.ps1 -Port 3081
```

启动脚本将 `DSH_HOME` 固定为本仓库的 `.storages/dsh-home`，不复用个人目录下其他 DSH 安装的配置。该目录已被上游 `.gitignore` 忽略，用于存放配置、凭据及运行数据；不要提交、共享或随意删除。脚本退出时恢复调用终端原先的 `DSH_HOME`。

## 重装与构建

本机使用 Node.js 24；Corepack 根据 `package.json` 选择上游锁定的 pnpm 版本，不修改全局 pnpm。

```powershell
corepack pnpm install --frozen-lockfile
corepack pnpm run build
```

修改源码后重新构建，再启动。上游依赖或构建要求以[开发指南](docs/development.zh.md)为准。

DSH 属于实验性开发预览，可以执行命令并读写文件。仅监听本机不等于安全沙箱，运行不可信任务前请阅读[安全说明](SAFETY.zh.md)。
