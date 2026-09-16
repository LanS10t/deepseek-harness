# Agent Note: Local Sky desktop authorization

Status: implemented

English | [中文](2026-09-16-local-sky-desktop-authorization.zh.md)

## Problem

A locally installed desktop driver can expose useful observation and input APIs while retaining native application approval requirements. Treating successful import, enumeration, or an adapter's approval as proof of complete independent operation grants authority the adapter does not own.

## Decision

The [local Sky bundle](../../../../local-plugins/dsh-sky-computer-use/README.md) uses a persistent private Node worker and only the installed package's public export. The model receives fixed DSH tools, not a JavaScript execution endpoint. User settings own the exact application scope and permission mode. DSH one-shot approval and native application approval remain separate decisions.

Window selection comes from enumeration. An observation belongs to one session and window and is consumed before input. The executor rejects overlap, rechecks current policy after approval, and refreshes after each input. Cancellation closes the owned worker; an unacknowledged shutdown makes the worker unavailable until process restart. Saved attachment references enter normal DSH tool results so screenshots can be logged and projected without encoded bytes in text.

The installable bundle keeps desktop access disabled. The standalone native probe reports app approval unavailability instead of synthesizing a trusted host or silently replacing the driver. Independent UIA, screenshot, input, Codex-closed, and model-delivery evidence are distinct requirements.

## Alternatives considered

- Copying or modifying native runtime files would redistribute proprietary implementation and couple the adapter to undocumented internals.
- Returning an accepted native approval or fabricating Codex context would confuse user-owned DSH permission with a separate provider restriction.
- Automatically retrying input after timeout cannot distinguish a lost response from an action that already happened.
- A model-reported risk label cannot enforce the meaning of coordinate actions. Full mode therefore remains a trust choice; Ask mode retains human review of every state change.

## Consequences

No DSH core change is required. The local bundle can be mounted and tested with a fake adapter while real native input remains unavailable. Package paths and versions require explicit configuration and revalidation after an installed runtime changes. The adapter is not an OS sandbox: trusted plugins and unrestricted filesystem access remain outside its authorization guarantees.
