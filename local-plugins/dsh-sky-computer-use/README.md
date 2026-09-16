# Sky Computer Use for DSH

English | [中文](README.zh.md)

This adapter calls an explicitly configured installation of `@oai/sky` through its public package export. It contains no OpenAI driver code and does not patch DSH core, create Codex identities, or answer native app approval requests.

## Availability

The bundle installs with desktop access **disabled**. The settings card remains accessible. Independent native input is not validated: on this machine, Sky 0.6.32 enumerates windows but app launch fails with `Computer Use requires app approval but elicitations are unavailable`. A DSH approval cannot fix that refusal. Do not enable production use until independent observation, input, and shutdown have passed, including a run after the user closes Codex normally.

The local adapter is not an official redistribution or supported third-party Sky SDK. Keep the proprietary package in its existing installation and review its applicable usage terms separately.

## Permissions

| Mode | Behavior |
| --- | --- |
| Disabled | Status only; no enumeration, observation, launch, or input |
| Read-only | Enumeration and observation within the allowed application scope |
| Ask | DSH one-shot approval for every input or state change |
| Full | Ordinary actions skip adapter approval; sensitive actions still request it |

The schema default is `ask`; the installed bundle overrides it to `disabled` until native validation. An empty allowlist allows no applications. Entries are exact native application identifiers, not display names, executable basenames inferred from a path, glob patterns, or window titles. “Allow all applications” removes only the allowlist filter. Built-in target restrictions, native approval, and DSH tool policy still apply.

The model must supply an action purpose and classify sensitive operations. The adapter also recognizes common sensitive words and asks again. This is **not a semantic security classifier**: coordinate clicks cannot prove what a UI action means. Full mode trusts the model's classification for ordinary operations. Use Ask mode for untrusted desktop content. Authentication, terminal commands, password managers, security changes, and bypassing safety barriers are prohibited; identifier/shortcut checks are defense in depth, not complete UI-content recognition.

Only user settings change the policy. No Computer Use tool grants permission or changes settings. As with other local DSH settings, arbitrary shell/file access to the profile or a trusted plugin can change configuration; this bundle is not an OS sandbox against such access. Do not expose the settings API to untrusted callers.

## Installation

From the repository root, install the local adapter dependencies once, then add the bundle through DSH. Scope `DSH_HOME` to the intended installation:

```powershell
npm install --ignore-scripts --legacy-peer-deps --package-lock=false --prefix local-plugins/dsh-sky-computer-use
$env:DSH_HOME = Join-Path $PWD '.storages/dsh-home'
corepack pnpm dsh plugin --profile web add ./local-plugins/dsh-sky-computer-use
```

Before adding or updating the bundle, copy the profile's `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, and `cordis.patch.yml` into a dated backup directory. Installation does not restart a running instance. Restart that instance manually to load a newly added bundle.

In Settings → Plugins → 电脑操作, set `packagePath` to the absolute **package directory containing package.json**, not an internal module or helper executable. Set `expectedVersion` to the exact tested version. Updating Codex may move or replace that directory; the worker refuses a version mismatch rather than selecting another installation.

Keep the mode disabled during configuration. The settings card supports staged edits, revision conflict checks, and explicit confirmation for full/all-app access. Configure only the dedicated validation application's exact native identity before testing.

## Tools and Lifetime

`computer_status`, `computer_list_apps`, `computer_list_windows`, `computer_launch_app`, `computer_observe`, `computer_activate_window`, `computer_click`, `computer_press_key`, `computer_type_text`, `computer_set_value`, `computer_scroll`, `computer_drag`, and `computer_perform_secondary_action` enter DSH's normal tool pipeline.

Enumerating produces session-owned opaque `windowId` values. Observation returns UIA text, saved screenshots, and an `observationId`. One action consumes one observation and immediately refreshes the target. Enumeration, cancellation, permission changes, input errors, and intervening observations invalidate prior observations. Window disappearance and expired observations require fresh selection. Input is never automatically retried.

The executor rejects overlap rather than queuing another session. Cancellation and disposal close the owned worker through Sky's public `close()` method. If shutdown is not acknowledged, the adapter refuses further operations until the DSH process restarts; killing a worker is not proof that a native action stopped.

Screenshots pass through DSH attachment storage before tool projection. The canonical tool value includes attachment references, not base64. An image-capable active model receives image blocks through the same tool result. A model without positively declared image input receives UIA and an explicit notice; the plugin does not start a second model request.

The card's emergency stop stores `disabled` and increments `stopEpoch`. `/computer-stop` immediately stops the live executor; `/computer-status` reports its worker state and latest error. A successful settings save confirms configuration persistence, not native shutdown; check live status when an operation was in flight.

## Verification

```powershell
node --test local-plugins/dsh-sky-computer-use/tests/*.test.js local-plugins/dsh-sky-computer-use/tests/*.test.mjs
node node_modules/vitest/vitest.mjs run --config local-plugins/dsh-sky-computer-use/vitest.config.ts
node local-plugins/dsh-sky-computer-use/scripts/native-probe.mjs '<package-directory>' 0.6.32 calc.exe
```

The first two commands use fake adapters and no API keys or desktop input. The last command is an explicit real-desktop launch probe: it enumerates windows, optionally launches the supplied test app, and closes the worker. Omitting the app performs enumeration only. It does not prove UIA, screenshots, typing, Codex-closed independence, or model request delivery.

## Troubleshooting and Removal

- Native approval unavailable: preserve the refusal. No fake `nodeRepl`, approval callback shim, direct helper launch, or private pipe is supported.
- Unknown outcome or stale observation: inspect the target again. Do not repeat the input automatically.
- Worker unavailable after forced shutdown: stop the task, check the target manually, and restart DSH before further use.
- Approval rejected with session policy `never`: that policy rejects requests; it does not automatically approve them.
- Empty enumeration: check exact app identifiers and scope. Disabled mode does not allow desktop discovery.
- Card missing: restart the profile after adding the bundle, then inspect plugin loading errors.

Stop Computer Use before removing the bundle:

```powershell
$env:DSH_HOME = Join-Path $PWD '.storages/dsh-home'
corepack pnpm dsh plugin --profile web remove dsh-sky-computer-use
```

Remove only this plugin's `sky-computer-use` profile patch entry, then restart the profile. Other plugins, disabled entries, credentials, sessions, and screenshots remain untouched. Backups allow restoring profile metadata; do not restore an old whole-profile backup over subsequent user changes.
