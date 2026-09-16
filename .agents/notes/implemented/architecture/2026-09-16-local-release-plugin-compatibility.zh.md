# Agent Note: 本地发行版插件兼容性

Status: implemented

[English](2026-09-16-local-release-plugin-compatibility.md) | 中文

## Problem

第三方发布标签不能证明插件兼容尚未稳定的 Harness 生命周期事件或浏览器投影。插件可能启动成功，却未安装成员限制，或者只在打开历史会话后报错。直接修改安装文件也会在重新安装依赖时丢失。

## Decision

本地 Web profile 使用官方 DSH `0.1.6-alpha.1` 和精确版本的 [pnpm 补丁](../../../../local-plugins/patches/README.zh.md)。Agent Teams 通过可等待的 `agent/created` 事件安装成员初始化和能力限制。Outline 订阅 Chat 目标的 legacy 投影，不从生命周期状态读取会话节点。

官方 Playwright MCP 拥有独立启动的浏览器，官方原生 Cua Driver 提供桌面工具。[Sky 授权记录](2026-09-16-local-sky-desktop-authorization.zh.md)继续有效：其适配器和授权限制仍然存在，但本 profile 停用该条目。驱动激活和直接工具测试都不等于完整模型工作流通过。

升级前备份 profile 元数据和运行数据，保留凭据、模型默认项、皮肤选择、启动入口及无关文件。依赖已安装包的补丁测试留在本地所有者目录，因为它们需要被忽略的本地 profile，不能声称在干净检出的 CI 中执行。

## Alternatives considered

**不检查便启用全部新版插件。** 对已移除事件的订阅可能静默失效，导致成员策略没有安装；单凭启动成功不足以验收。

**直接修改 node_modules 而不记录补丁。** 重新安装会丢失适配，实际运行代码也不可追溯。

**重新启用旧 Sky 后端。** 独立原生授权限制仍然存在，官方提供者通过另一实现提供能力，无须伪造授权或修改专有运行时文件。

## Consequences

补丁规模小、固定版本且可以分别移除；以后升级插件必须重新检查。定向测试覆盖可等待的成员初始化、工具限制、卸载和大纲投影，浏览器检查覆盖历史会话加载。独立 Windows 测试窗口验证后台中文输入、应用与 UIA 回读、截图和原生卸载。完整模型驱动的桌面任务、关闭 Codex 后运行和多成员模型任务仍未验证。
