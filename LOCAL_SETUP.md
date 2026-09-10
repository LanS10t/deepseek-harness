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
