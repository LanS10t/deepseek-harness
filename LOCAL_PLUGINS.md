# 旧 DSH 实例的非官方扩展

盘点日期：2026-09-10。源码目录为 `D:\DS_HARNESS\deepseek-harness-omgwowh-my-dsh`，该目录的 `start-web.bat` 没有覆盖 `DSH_HOME`；本盘点按其通常使用的 `C:\Users\LansNi\.dsh` 检查配置。如果调用者预先设置了其他 `DSH_HOME`，则另一个实例不在本次范围内。本文描述旧实例，不代表新实例的安装状态；新实例见[当前插件安装记录](LOCAL_PLUGIN_INSTALL.md)。

## Web profile 中已配置的插件

依据 `C:\Users\LansNi\.dsh\profiles\web\package.json` 的依赖、bundle 列表和本地安装文件。这里的“已配置”不代表本次启动验证过旧实例的插件兼容性。

| 插件 | 本地版本 | 用途 | 限制 |
|---|---|---|---|
| `dsh-skill-viewer` | `0.7.0` | 在 Web 界面查看技能内容、搜索、分组、启停、添加、删除，以及跨工作区复制或移动技能；附带技能管理 CLI。 | 增删、停用和移动会操作真实技能文件。旧 Desktop profile 也配置了它。 |
| `dsh-tokenrouter-cost` | `0.1.0` | 按输入、缓存读取、缓存写入、输出 token 估算费用，展示当日与会话用量，维护本地账本。 | 价格来自随插件保存的 `prices.json`，不是实时官方账单；不能当作准确余额。源码在旧目录的 `deploy/omgwow-dsh/plugins/dsh-tokenrouter-cost`。 |

## 已安装的自定义 Agent 预设

以下预设存在于 `C:\Users\LansNi\.dsh\.agent-presets`，不是 Web profile 的全局 bundle。需要在会话中选择相应预设；目录存在不代表当前会话正在使用。

| 预设 | 用途 |
|---|---|
| `router-standard` | 按任务调整推理与执行提示，加入阶段化工具开放和路由引导。其本地配置还为 Windows 装配单独的 Git Bash 执行器。 |
| `router-spec` | 偏向先深入思考、明确规格再执行的路由预设；本地显示名称含 `experimental`。 |

这两者会改变 Agent 的提示词和工具装配，不只是改变界面。源码副本位于旧目录的 `.dsh-plugin-clone/preset`；其中还有 `router-react`，但未在上述用户预设目录中找到安装项。作者 README 中的成功率、缓存命中率等数字未在本机复测，不应直接用作效果保证。

## 有源码副本但未列入当前 Web bundles

旧目录的 `.dsh-plugin-clone` 是 `dsh-routing-suite` 源码副本。

| 组件 | 用途 | 注意 |
|---|---|---|
| `dsh-super-injector` | 提供 `dev_*` 工具，用于运行时注入、热重载、卸载插件，管理暂存工具和恢复路由。 | 涉及动态执行代码和修改运行时装配，权限影响较大；本次未验证它在新版 DSH 上的行为。 |
| `dsh-graded-mode` | 把任务组织成需求澄清、目标确定、两级计划、审核、逐项验收、红队裁决与最终检查。 | 会增加流程和交互成本；本地 package 版本为 `0.0.1-rc1`，部分文档标题另有版本标记，不能只按 README 判断版本。 |

## 部署文档中提到的社区插件

下列条目出现在旧目录 `deploy/omgwow-dsh/docs/README.md`，但不在本次核对的用户 Web profile 的依赖或 bundle 列表中。以下是该本地文档对功能的描述，不是本次安装、运行或兼容性验证的结论。

| 插件 | 文档描述的用途 |
|---|---|
| `dshmarket` | 可视化社区插件市场，浏览、搜索、安装、更新和停用插件。 |
| `dsh-better-sidebar` | 右侧工作台，文件浏览与编辑、终端、Git 和内置浏览器。 |
| `dsh-outline` | 会话问题和 Markdown 标题大纲，搜索、收藏与定位。 |
| `@nanmicoder/dsh-agent-teams` | 组建多 Agent 团队，组织依赖任务、成员消息和监控面板。 |
| `@omdsh-dev/dsh-genui` | 将回复中的 `dsh-ui` 围栏渲染为交互界面，并回传交互动作。 |
| `@dsh-external/dsh-visualize` | 对话内交互式 HTML 可视化。 |
| `dsh-ui-hub` | 管理界面分区的开关、折叠、位置、大小与排列。 |

## 其他非官方内容

旧目录 `deploy/omgwow-dsh/skills` 下还有 5 个技能目录。技能是给 Agent 的流程说明及辅助脚本，不等同于常驻插件；本次未执行、安装或配置其外部账号。

| 技能 | 用途 |
|---|---|
| `feishu` | 飞书文档、知识库及群机器人通知。 |
| `github-cluster-access` | GitHub SSH、Kubernetes 和远程机器访问。 |
| `local-service-hub` | 登记与展示本地 Web 服务。 |
| `session-cloud-sync` | 通过 SSH/rsync 把会话和工作目录备份到远端，并发送通知。涉及数据外传，需要单独审查目标和授权。 |
| `record-browser-gif` | 录制浏览器交互并生成 GIF。 |

旧实例还修改了官方 `llm-pi-ai` 源码，加入 `mergeUserMessages` 来合并连续用户消息。这是对核心适配器的本地修改，不是独立插件；旧部署模板启用它，但当前用户 TokenRouter 配置未设置它。本次未将该源码修改或未启用的部署模板迁入新仓库。
