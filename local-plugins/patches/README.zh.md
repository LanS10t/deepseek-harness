# 本地插件兼容补丁

[English](README.md) | 中文

这些 pnpm 补丁将仓库独立 Web profile 适配到 DSH `0.1.6-alpha.1`，不属于作者发布版。Profile 的 `pnpm-workspace.yaml` 在 `patchedDependencies` 中记录两个精确包版本，相对路径指向本目录。

- Agent Teams `0.1.18`：通过可等待的 `agent/created` 事件安装成员初始化和能力限制，保留插件原有的投递、退出成员保护、失败阻断和授权行为。
- Outline `0.1.6`：订阅当前 Conversation 的 Chat 目标并读取 `legacy` 投影，同步修改发布的浏览器产物、源文件和受影响的类型声明。

在仓库根目录运行 `node node_modules/vitest/vitest.mjs run --config local-plugins/patches/vitest.config.ts` 可检查已安装 profile。测试依赖本地 profile 的已打补丁依赖，不属于干净检出的 CI，不调用模型。

没有重新审阅前，不要将补丁用于其他包版本。在 profile 内重新安装时由 pnpm 应用补丁。移除任一补丁时，必须停用对应插件，直到作者版本的兼容性通过验证。[本地安装记录](../../LOCAL_PLUGIN_INSTALL.md)统一记录版本、启用状态、备份和实机检查。
