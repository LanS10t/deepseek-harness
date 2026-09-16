# DSH 本机 Sky 电脑操作插件

[English](README.md) | 中文

插件通过公开包入口调用明确配置的本机 `@oai/sky`，不包含 OpenAI 驱动源码，不修改 DSH 核心，不伪造 Codex 身份，也不代答原生应用审批。

## 可用状态

安装时保持电脑操作**禁用**，设置卡仍可使用。本机 Sky 0.6.32 的独立进程能枚举窗口，但启动应用报错 `Computer Use requires app approval but elicitations are unavailable`；DSH 的批准不能消除这个拒绝。必须通过独立观察、输入和停止验收，并由用户正常关闭 Codex 后复测，才可正式启用。

这是本地适配代码，不是官方可分发驱动或受支持的第三方 Sky SDK。专有包保留在原安装位置，其适用使用条款需另行核对。

## 权限

| 模式 | 行为 |
| --- | --- |
| 禁用 | 仅允许状态检查，不枚举、观察、启动或输入 |
| 只读 | 仅枚举和观察允许范围内的应用 |
| 逐次询问 | 每次输入和状态改变均请求 DSH 一次性审批 |
| 完全授权 | 普通操作免除插件审批，敏感操作仍请求确认 |

配置 schema 默认 `ask`，安装组合包在原生验收前覆盖为 `disabled`。空白名单不允许任何应用。白名单填写原生返回的精确应用 ID，不是显示名称、从路径猜测的文件名、通配符或窗口标题。“允许所有应用”只去掉白名单过滤，禁止目标、原生授权和 DSH 工具策略仍然生效。

模型必须给出操作目的和敏感性分类；插件还会对常见敏感词补充确认。这**不是语义安全分类器**，坐标点击无法证明实际 UI 操作的含义。完全授权会信任模型对普通操作的分类；面对不可信桌面内容应使用逐次询问模式。认证、终端命令、密码管理器、安全设置和绕过安全提示均禁止；应用 ID 与快捷键检查是补充防护，不能完整识别 UI 内容。

权限只通过用户设置修改，Computer Use 工具没有授权或设置修改入口。与其他本地 DSH 设置相同，拥有 profile 任意文件/终端写入能力或受信插件仍能修改配置；本插件不是隔离这些能力的操作系统沙箱。不要向不可信调用方暴露设置 API。

## 安装

在仓库根目录安装本地插件依赖，再通过 DSH 加入组合包。将 `DSH_HOME` 限定到目标实例：

```powershell
npm install --ignore-scripts --legacy-peer-deps --package-lock=false --prefix local-plugins/dsh-sky-computer-use
$env:DSH_HOME = Join-Path $PWD '.storages/dsh-home'
corepack pnpm dsh plugin --profile web add ./local-plugins/dsh-sky-computer-use
```

安装或更新前，将目标 profile 的 `package.json`、`pnpm-lock.yaml`、`pnpm-workspace.yaml` 和 `cordis.patch.yml` 复制到带日期的备份目录。安装不重启已有实例；新增组合包后需手动重启该实例。

在“设置 → 插件 → 电脑操作”中，把 `packagePath` 设置为**包含 package.json 的包目录绝对路径**，不是内部模块或 helper 可执行文件；`expectedVersion` 填写已验收的准确版本。Codex 更新可能移动或替换目录，worker 会拒绝版本变化，不会自行选择其他安装。

配置期间保持禁用。设置卡支持草稿、版本冲突检查，并在保存完全授权或全部应用范围前明确确认。测试前仅填写专用验收应用的精确原生 ID。

## 工具与生命周期

`computer_status`、`computer_list_apps`、`computer_list_windows`、`computer_launch_app`、`computer_observe`、`computer_activate_window`、`computer_click`、`computer_press_key`、`computer_type_text`、`computer_set_value`、`computer_scroll`、`computer_drag` 和 `computer_perform_secondary_action` 均经过 DSH 正常工具管线。

枚举生成当前会话专用的不透明 `windowId`；观察返回 UIA、已保存截图和 `observationId`。一次操作消耗一次观察并立即刷新。重新枚举、取消、权限变化、输入失败和其他观察都会使旧观察失效。窗口消失或观察过期后必须重新选择，输入不会自动重试。

桌面执行器拒绝重叠调用，不替其他会话排队。取消与卸载通过 Sky 公开 `close()` 关闭自有 worker。停止未获确认时，插件拒绝继续操作，直到 DSH 进程重启；杀掉 worker 不等于证明原生输入已停止。

截图先经过 DSH attachments 落盘，规范工具结果保存附件引用而非 base64。当前模型明确支持图片时，同一工具结果会包含图片块；不能确认图片能力时只提供 UIA 和明确提示，不会启动第二个模型调用。

设置卡紧急停止写入 `disabled` 并递增 `stopEpoch`；`/computer-stop` 立即停止当前执行器，`/computer-status` 报告 worker 状态及最近错误。设置保存成功只证明配置已持久化，不代表原生进程已停止；有操作正在执行时需检查实时状态。

## 验证

```powershell
node --test local-plugins/dsh-sky-computer-use/tests/*.test.js local-plugins/dsh-sky-computer-use/tests/*.test.mjs
node node_modules/vitest/vitest.mjs run --config local-plugins/dsh-sky-computer-use/vitest.config.ts
node local-plugins/dsh-sky-computer-use/scripts/native-probe.mjs '<package-directory>' 0.6.32 calc.exe
```

前两项使用 fake adapter，不调用模型、不操作真实桌面。最后一项是明确的真机启动探测：枚举窗口、可选启动指定验收应用、关闭 worker；省略应用参数则仅枚举。它不证明 UIA、截图、输入、Codex 关闭后的独立性或模型请求中实际包含截图。

## 排障与卸载

- 原生审批不可用：保留拒绝结果。不支持伪造 `nodeRepl`、伪造审批回调、直接启动 helper 或连接私有管道。
- 结果不明或观察过期：重新观察目标，不要自动重复输入。
- 强制停止后 worker 不可用：停止任务、手动检查目标，重启 DSH 后才能继续。
- 会话 `approval: never` 拒绝：该策略拒绝审批请求，不是自动批准。
- 枚举为空：检查精确应用 ID 和允许范围；禁用状态不允许桌面发现。
- 设置卡不出现：新增组合包后重启 profile，并检查插件加载错误。

先停止电脑操作，再卸载：

```powershell
$env:DSH_HOME = Join-Path $PWD '.storages/dsh-home'
corepack pnpm dsh plugin --profile web remove dsh-sky-computer-use
```

只移除 profile patch 中本插件的 `sky-computer-use` 条目，再重启实例。其他插件、停用项、凭据、会话和截图均保留。备份可用于恢复元数据，但不能用旧的整份备份覆盖之后新增的用户修改。
