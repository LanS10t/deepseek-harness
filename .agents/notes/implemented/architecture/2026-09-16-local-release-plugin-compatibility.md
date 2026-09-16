# Agent Note: Local release plugin compatibility

Status: implemented

English | [中文](2026-09-16-local-release-plugin-compatibility.zh.md)

## Problem

Third-party release tags do not prove compatibility with pre-stable Harness lifecycle events or browser projections. A plugin can start successfully while omitting member restrictions or failing only after a saved conversation opens. Reinstalling dependencies also discards unrecorded edits to installed files.

## Decision

The local Web profile uses official DSH `0.1.6-alpha.1` with exact-version [pnpm patches](../../../../local-plugins/patches/README.md). Agent Teams uses the awaited `agent/created` event for member setup and capability restrictions. Outline subscribes to the Chat target's legacy projection instead of reading conversation nodes from lifecycle state.

Official Playwright MCP owns isolated launched browsers. Official native Cua Driver supplies desktop tools. The [Sky authorization note](2026-09-16-local-sky-desktop-authorization.md) remains active: its adapter and authorization constraints still exist, but that profile row is disabled. Neither driver activation nor direct tool tests prove a complete model workflow.

Profile metadata and data are backed up before upgrade. Credentials, model defaults, skin selection, launch paths, and unrelated files are preserved. Installed-package patch tests remain owner-local because they require this ignored local profile; they do not pretend to run in clean-checkout CI.

## Alternatives considered

**Enable every updated package without inspection.** Removed event subscriptions can fail silently and leave member policy uninstalled; startup alone is insufficient evidence.

**Edit node_modules without a patch.** Reinstallation loses the adaptation and makes the effective code untraceable.

**Re-enable the old Sky backend.** The independent native authorization limitation remains. The official provider supplies a separate implementation without fabricating approval or modifying proprietary runtime files.

## Consequences

Patches are small, version-pinned, and independently removable. Future package upgrades must re-evaluate them. Focused tests exercise awaited member initialization, tool restriction, teardown, and outline projection; browser checks cover saved-session loading. A dedicated Windows fixture confirms background Chinese input, application and UIA readback, screenshot capture, and native disposal. Full model-driven desktop tasks, Codex-closed execution, and multi-member model tasks remain unverified.
