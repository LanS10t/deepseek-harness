# Local Plugin Compatibility Patches

English | [中文](README.zh.md)

These pnpm patches adapt the repository-local Web profile to DSH `0.1.6-alpha.1`. They are not upstream releases. The profile's `pnpm-workspace.yaml` records both exact package versions under `patchedDependencies`; its relative paths reach this directory.

- Agent Teams `0.1.18`: attach member setup and capability restrictions to the awaited `agent/created` event. Keep the package's delivery, retirement, failure, and approval behavior.
- Outline `0.1.6`: subscribe to the current Conversation Chat target and read its `legacy` projection. Patch the published browser artifact, source, and affected declarations together.

Run the installed-profile regression with `node node_modules/vitest/vitest.mjs run --config local-plugins/patches/vitest.config.ts` from the repository root. It needs the local profile's patched dependencies; it is not part of clean-checkout CI and does not call a model.

Do not carry these patches onto a different package version without review. A reinstall inside the profile applies them through pnpm. Removing either patch requires disabling the corresponding plugin until its upstream compatibility is verified. [The local installation record](../../LOCAL_PLUGIN_INSTALL.md) owns versions, activation, backup, and live validation.
