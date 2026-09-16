/**
 * Hand-authored DSH lazy-CJS client artifact. No build step or plugin value imports.
 * The package name must match this factory id; the Host owns tool-side authorization.
 */
window.__ModuleLoader__.load({
  id: 'dsh-sky-computer-use',
  factory: (require) => {
    'use strict';
    const React = require('react');
    const h = React.createElement;
    const NS = 'sky-computer-use';
    const LOCALE = 'settings.skyComputerUse';
    const MODES = ['disabled', 'read-only', 'ask', 'full'];
    const FIELDS = [
      'mode', 'allowedApps', 'allowAllApps', 'packagePath', 'expectedVersion',
      'observationTtlMs', 'callTimeoutMs',
    ];
    const zh = {
      title: '电脑操作',
      mode: '权限模式',
      disabled: '已禁用',
      'read-only': '只读',
      ask: '逐次询问',
      full: '完全授权',
      allowedApps: '应用白名单（每行一个应用 ID）',
      allowAllApps: '允许所有应用',
      packagePath: '运行时包路径',
      expectedVersion: '预期运行时版本',
      observationTtlMs: '观察有效期（毫秒）',
      callTimeoutMs: '调用超时（毫秒）',
      stopEpoch: '停止序号',
      save: '保存',
      saving: '正在保存',
      discard: '放弃修改',
      stop: '紧急停止',
      stopping: '正在停止',
      stopped: '已保存禁用状态',
      saved: '已保存',
      loading: '正在读取配置',
      unavailable: '此连接未提供电脑操作设置',
      readOnly: '当前连接不允许修改设置',
      unsaved: '有未保存的修改',
      invalid: '请检查字段；时间必须是大于零的安全整数',
      conflict: '配置版本已变化。请放弃修改，重新核对后保存。',
      saveFailed: '保存失败，Host 未确认这些设置；修改已保留。',
      stopFailed: '停止失败，尚未确认禁用。请重试并检查 Host 状态。',
      untrusted: '请在设置页手动点击操作按钮。',
      cancelled: '已取消授权，未保存修改。',
      confirm: '即将保存高权限电脑操作配置。完全授权可在应用授权范围内免除适配器逐次确认；允许所有应用会取消应用白名单限制。系统和运行时的原生授权仍然有效。是否确认？',
      confirmFailed: '无法获取用户确认，未保存修改。',
    };
    /** @type {Record<keyof typeof zh, string>} */
    const en = {
      title: 'Computer use',
      mode: 'Permission mode',
      disabled: 'Disabled',
      'read-only': 'Read only',
      ask: 'Ask each time',
      full: 'Full access',
      allowedApps: 'Allowed apps (one app ID per line)',
      allowAllApps: 'Allow all apps',
      packagePath: 'Runtime package path',
      expectedVersion: 'Expected runtime version',
      observationTtlMs: 'Observation lifetime (ms)',
      callTimeoutMs: 'Call timeout (ms)',
      stopEpoch: 'Stop sequence',
      save: 'Save',
      saving: 'Saving',
      discard: 'Discard changes',
      stop: 'Emergency stop',
      stopping: 'Stopping',
      stopped: 'Disabled state saved',
      saved: 'Saved',
      loading: 'Loading settings',
      unavailable: 'Computer-use settings are unavailable on this connection',
      readOnly: 'This connection cannot change settings',
      unsaved: 'Unsaved changes',
      invalid: 'Check the fields; durations must be positive safe integers',
      conflict: 'The settings revision changed. Discard your edits and review before saving.',
      saveFailed: 'Save failed: the Host did not confirm these settings. Your edits were retained.',
      stopFailed: 'Stop failed: disabling is not confirmed. Retry and check the Host.',
      untrusted: 'Click the action button yourself on the settings page.',
      cancelled: 'Authorization cancelled; changes were not saved.',
      confirm: 'Save high-privilege computer-use settings? Full access removes per-call adapter confirmation within the authorized apps; allowing all apps removes the app allowlist restriction. Native system and runtime approvals still apply.',
      confirmFailed: 'User confirmation is unavailable; changes were not saved.',
    };

    const css = `
.dsh-sky-settings{box-sizing:border-box;min-width:0;border:1px solid var(--dsw-alias-border-l4);border-radius:8px;padding:14px 16px;background:var(--dsw-alias-bg-layer-3);color:var(--dsw-alias-label-primary);font:inherit;font-size:13px;line-height:1.5;letter-spacing:0}
.dsh-sky-settings *{box-sizing:border-box;min-width:0;letter-spacing:0}
.dsh-sky-settings header,.dsh-sky-settings footer{display:flex;align-items:center;flex-wrap:wrap;gap:8px}
.dsh-sky-settings h3{flex:1;margin:0;font-size:15px;font-weight:600;overflow-wrap:anywhere}
.dsh-sky-settings fieldset{margin:12px 0 0;padding:0;border:0}
.dsh-sky-settings legend{margin-bottom:6px;padding:0;font-weight:500}
.dsh-sky-settings .sky-modes{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:4px}
.dsh-sky-settings .sky-mode{display:flex;align-items:center;justify-content:center;gap:5px;border:1px solid var(--dsw-alias-border-l4);border-radius:6px;min-height:34px;padding:4px;cursor:pointer;overflow-wrap:anywhere}
.dsh-sky-settings .sky-mode:has(input:checked){border-color:var(--dsw-alias-brand-primary);background:var(--dsw-alias-bg-layer-2)}
.dsh-sky-settings input[type=radio],.dsh-sky-settings input[type=checkbox]{accent-color:var(--dsw-alias-brand-primary);flex:none}
.dsh-sky-settings .sky-fields{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px 12px;margin:12px 0}
.dsh-sky-settings .sky-field{display:flex;flex-direction:column;gap:5px;overflow-wrap:anywhere}
.dsh-sky-settings .sky-wide{grid-column:1/-1}
.dsh-sky-settings .sky-input{width:100%;border:1px solid var(--dsw-alias-border-l4);border-radius:6px;background:var(--dsw-alias-bg-layer-2);color:inherit;padding:6px 9px;font:inherit;min-height:34px}
.dsh-sky-settings textarea.sky-input{resize:vertical;min-height:88px;white-space:pre-wrap;overflow-wrap:anywhere}
.dsh-sky-settings .sky-check{display:flex;align-items:center;gap:6px}
.dsh-sky-settings button{border:1px solid var(--dsw-alias-border-l4);border-radius:6px;background:var(--dsw-alias-bg-layer-2);color:inherit;font:inherit;padding:5px 12px;min-height:32px;cursor:pointer;white-space:normal;overflow-wrap:anywhere}
.dsh-sky-settings .sky-save{background:var(--dsw-alias-label-primary);color:var(--dsw-alias-bg-layer-3)}
.dsh-sky-settings .sky-stop,.dsh-sky-settings [role=alert]{color:var(--dsw-alias-label-error)}
.dsh-sky-settings :disabled{opacity:.5;cursor:default}
.dsh-sky-settings :focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px}
.dsh-sky-settings [aria-invalid=true]{border-color:var(--dsw-alias-label-error)}
.dsh-sky-settings footer{border-top:1px solid var(--dsw-alias-border-l2);padding-top:10px}
.dsh-sky-settings .sky-status{flex:1;color:var(--dsw-alias-label-tertiary);overflow-wrap:anywhere}
.dsh-sky-settings p{margin:8px 0 0;overflow-wrap:anywhere}
@media(max-width:480px){.dsh-sky-settings{padding:12px}.dsh-sky-settings .sky-fields{grid-template-columns:minmax(0,1fr)}.dsh-sky-settings .sky-modes{grid-template-columns:repeat(2,minmax(0,1fr))}}
`;
    // These tags let the DSH loader reclaim the stylesheet on invalidation/HMR.
    const style = document.createElement('style');
    style.setAttribute('data-plugin', 'dsh-sky-computer-use');
    style.setAttribute('data-plugin-css', 'sky-computer-use-settings');
    style.textContent = css;
    document.head.append(style);

    function same(left, right) {
      return Array.isArray(left) && Array.isArray(right)
        ? left.length === right.length && left.every((value, index) => value === right[index])
        : left === right;
    }

    function format(value) {
      return {
        mode: value.mode,
        allowedApps: value.allowedApps.join('\n'),
        allowAllApps: value.allowAllApps,
        packagePath: value.packagePath,
        expectedVersion: value.expectedVersion,
        observationTtlMs: String(value.observationTtlMs),
        callTimeoutMs: String(value.callTimeoutMs),
      };
    }

    function parse(draft) {
      const value = {
        ...draft,
        allowedApps: [...new Set(draft.allowedApps.split(/\r?\n/).map(line => line.trim()).filter(Boolean))],
        packagePath: draft.packagePath.trim(),
        expectedVersion: draft.expectedVersion.trim(),
        observationTtlMs: Number(draft.observationTtlMs),
        callTimeoutMs: Number(draft.callTimeoutMs),
      };
      const invalidFields = FIELDS.filter(field => {
        if (field === 'mode') return !MODES.includes(value.mode);
        if (field === 'allowAllApps') return typeof value.allowAllApps !== 'boolean';
        if (field.endsWith('Ms')) return !Number.isSafeInteger(value[field]) || value[field] <= 0;
        return false;
      });
      return { value, invalidFields };
    }

    /** Only browser-originated button actions may start a settings write. */
    function trusted(event) {
      return (event?.nativeEvent ?? event)?.isTrusted === true;
    }

    /**
     * One card's drafts over the actual SettingsScope snapshot:
     * {status,value,base,user,revision,writable,mode}. Rejections may resolve,
     * so writes must verify both the effective and raw user-layer values.
     */
    class CardController {
      constructor(scope, t) {
        this.scope = scope;
        this.t = t;
        this.listeners = new Set();
        this.draft = undefined;
        this.draftRevision = undefined;
        this.saving = false;
        this.stopping = false;
        this.message = undefined;
        this.error = undefined;
        this.disposed = false;
        this.generation = 0;
        this.pendingSave = Promise.resolve();
        this.snapshot = this.project();
        this.off = scope.subscribe(() => this.publish());
        this.store = {
          getSnapshot: () => this.snapshot,
          subscribe: (listener) => {
            this.listeners.add(listener);
            return () => this.listeners.delete(listener);
          },
        };
      }

      canWrite() {
        const snapshot = this.scope.getSnapshot();
        return !this.disposed && snapshot.status === 'ready' && snapshot.writable
          && snapshot.mode === 'host' && Number.isSafeInteger(snapshot.revision);
      }

      project() {
        const snapshot = this.scope.getSnapshot();
        const draft = this.draft ?? (snapshot.value ? format(snapshot.value) : undefined);
        const parsed = draft ? parse(draft) : undefined;
        return {
          status: snapshot.status,
          writable: this.canWrite(),
          draft,
          dirty: this.draft !== undefined && FIELDS.some(field =>
            !same(parsed.value[field], snapshot.value?.[field])),
          invalidFields: parsed?.invalidFields ?? [],
          conflicted: this.draft !== undefined && this.draftRevision !== snapshot.revision,
          saving: this.saving,
          stopping: this.stopping,
          stopEpoch: snapshot.value?.stopEpoch,
          error: this.error,
          message: this.message,
        };
      }

      publish() {
        if (this.disposed) return;
        this.snapshot = this.project();
        for (const listener of this.listeners) listener();
      }

      edit(field, value) {
        if (!FIELDS.includes(field) || !this.canWrite() || this.saving || this.stopping) return;
        if (this.draft === undefined) {
          const snapshot = this.scope.getSnapshot();
          this.draft = format(snapshot.value);
          this.draftRevision = snapshot.revision;
        }
        this.draft = { ...this.draft, [field]: value };
        this.error = undefined;
        this.message = undefined;
        this.publish();
      }

      clearDraft() {
        this.draft = undefined;
        this.draftRevision = undefined;
        this.error = undefined;
        this.message = undefined;
      }

      discard() {
        if (this.saving || this.stopping || this.disposed) return;
        this.clearDraft();
        this.publish();
      }

      landed(ops, revision) {
        const snapshot = this.scope.getSnapshot();
        return snapshot.status === 'ready' && snapshot.revision > revision
          && ops.every(({ path: [field], value }) =>
            Object.hasOwn(snapshot.user ?? {}, field)
            && same(snapshot.user[field], value) && same(snapshot.value?.[field], value));
      }

      save(event) {
        if (!this.canWrite() || this.saving || this.stopping || !this.draft) return Promise.resolve();
        if (!trusted(event)) {
          this.error = 'untrusted';
          this.publish();
          return Promise.resolve();
        }
        const snapshot = this.scope.getSnapshot();
        const { value, invalidFields } = parse(this.draft);
        if (snapshot.revision !== this.draftRevision || invalidFields.length > 0) {
          this.error = invalidFields.length ? 'invalid' : 'conflict';
          this.publish();
          return Promise.resolve();
        }
        const ops = FIELDS.filter(field => !same(value[field], snapshot.value[field]))
          .map(field => ({ op: 'set', path: [field], value: value[field] }));
        if (ops.length === 0) return Promise.resolve();
        // Reconfirm every saved change under full access, including runtime/app edits.
        if (value.mode === 'full' || (value.allowAllApps && !snapshot.value.allowAllApps)) {
          let confirmed;
          try {
            confirmed = window.confirm(this.t('confirm'));
          } catch {
            // A missing/blocked native dialog supplies no user authorization.
            this.error = 'confirmFailed';
            this.publish();
            return Promise.resolve();
          }
          if (confirmed !== true) {
            this.message = 'cancelled';
            this.error = undefined;
            this.publish();
            return Promise.resolve();
          }
        }
        const revision = this.draftRevision;
        const generation = this.generation;
        this.saving = true;
        this.error = undefined;
        this.message = undefined;
        this.publish();
        this.pendingSave = this.writeSave(ops, revision, generation);
        return this.pendingSave;
      }

      async writeSave(ops, revision, generation) {
        let landed = false;
        try {
          await this.scope.mutate(ops, revision);
          landed = this.landed(ops, revision);
        } catch {
          // Transport rejection is a visible failed save; drafts remain retryable.
          landed = false;
        } finally {
          this.saving = false;
          if (!this.disposed && generation === this.generation && !this.stopping) {
            if (landed) {
              this.clearDraft();
              this.message = 'saved';
            } else this.error = 'saveFailed';
          }
          this.publish();
        }
      }

      async stop(event) {
        if (!this.canWrite() || this.stopping) return;
        if (!trusted(event)) {
          this.error = 'untrusted';
          this.publish();
          return;
        }
        const generation = this.generation;
        this.stopping = true;
        this.clearDraft();
        this.publish();
        let landed = false;
        try {
          // Do not let a pending full-access save land after this stop.
          await this.pendingSave;
          if (!this.canWrite() || generation !== this.generation) return;
          const snapshot = this.scope.getSnapshot();
          const epoch = snapshot.value.stopEpoch;
          if (!Number.isSafeInteger(epoch) || epoch < 0 || !Number.isSafeInteger(epoch + 1)) {
            this.error = 'stopFailed';
            return;
          }
          const ops = [
            { op: 'set', path: ['mode'], value: 'disabled' },
            { op: 'set', path: ['stopEpoch'], value: epoch + 1 },
          ];
          await this.scope.mutate(ops, snapshot.revision);
          landed = this.landed(ops, snapshot.revision);
        } catch {
          // Failure does not prove that the Host stopped an active operation.
          landed = false;
        } finally {
          this.stopping = false;
          if (!this.disposed && generation === this.generation) {
            this.error = landed ? undefined : 'stopFailed';
            this.message = landed ? 'stopped' : undefined;
          }
          this.publish();
        }
      }

      resetConnection() {
        this.generation += 1;
        this.clearDraft();
        this.publish();
      }

      dispose() {
        this.disposed = true;
        this.generation += 1;
        this.off();
        this.listeners.clear();
      }

      inject() {
        return {
          hooks: { skyComputerUse: this.store },
          edit: (field, value) => this.edit(field, value),
          save: event => this.save(event),
          discard: () => this.discard(),
          stop: event => this.stop(event),
        };
      }
    }

    /** Render localized controls; the DSH slot renderer supplies the snapshot hook. */
    function Card(props) {
      const { t } = props;
      const state = props.useSkyComputerUse(value => value);
      const id = React.useId();
      if (state.status !== 'ready' || !state.draft) {
        return h('section', { className: 'dsh-sky-settings', 'aria-label': t('title') },
          h('h3', null, t('title')),
          h('p', { role: 'status' }, t(state.status === 'loading' ? 'loading' : 'unavailable')));
      }
      const disabled = !state.writable || state.saving || state.stopping;
      const field = (name, type = 'text', wide = false) => h('label', {
        key: name, className: `sky-field${wide ? ' sky-wide' : ''}`,
      }, h('span', null, t(name)), h(name === 'allowedApps' ? 'textarea' : 'input', {
        className: 'sky-input',
        ...(name === 'allowedApps' ? { rows: 4 } : { type }),
        ...(type === 'number' ? { min: 1, max: Number.MAX_SAFE_INTEGER, step: 1 } : {}),
        name,
        value: state.draft[name],
        disabled,
        spellCheck: false,
        autoComplete: 'off',
        'aria-invalid': state.invalidFields.includes(name),
        onChange: event => props.edit(name, event.target.value),
      }));
      const status = state.saving ? 'saving' : state.stopping ? 'stopping'
        : state.message ?? (state.dirty ? 'unsaved' : undefined);
      const error = state.error ?? (state.conflicted ? 'conflict'
        : state.invalidFields.length ? 'invalid' : undefined);
      return h('section', { className: 'dsh-sky-settings', 'aria-labelledby': `${id}-title` },
        h('header', null,
          h('h3', { id: `${id}-title` }, t('title')),
          h('button', {
            type: 'button', className: 'sky-stop', onClick: props.stop,
            disabled: !state.writable || state.stopping,
          }, t(state.stopping ? 'stopping' : 'stop'))),
        !state.writable && h('p', { role: 'status' }, t('readOnly')),
        h('fieldset', { disabled },
          h('legend', null, t('mode')),
          h('div', { className: 'sky-modes' }, MODES.map(mode =>
            h('label', { key: mode, className: 'sky-mode' },
              h('input', {
                type: 'radio', name: `${id}-mode`, value: mode,
                checked: state.draft.mode === mode,
                onChange: () => props.edit('mode', mode),
              }), h('span', null, t(mode)))))),
        h('div', { className: 'sky-fields' },
          h('label', { className: 'sky-check sky-wide' },
            h('input', {
              type: 'checkbox', checked: state.draft.allowAllApps, disabled,
              onChange: event => props.edit('allowAllApps', event.target.checked),
            }), t('allowAllApps')),
          field('allowedApps', 'text', true),
          field('packagePath', 'text', true),
          field('expectedVersion', 'text', true),
          field('observationTtlMs', 'number'),
          field('callTimeoutMs', 'number')),
        h('footer', null,
          h('span', { className: 'sky-status', role: 'status', 'aria-live': 'polite' },
            `${t('stopEpoch')}: ${state.stopEpoch}`,
            status ? ` · ${t(status)}` : ''),
          h('button', {
            type: 'button', onClick: props.discard,
            disabled: state.saving || state.stopping || (!state.dirty && !state.conflicted && !state.error),
          }, t('discard')),
          h('button', {
            type: 'button', className: 'sky-save', onClick: props.save,
            disabled: disabled || !state.dirty || state.conflicted || state.invalidFields.length > 0,
          }, t(state.saving ? 'saving' : 'save'))),
        error && h('p', { role: 'alert' }, t(error)));
    }

    return {
      inject: ['slots', 'locale', 'connection', 'settingsScope'],
      /** @param {object} ctx - DSH browser context, never a model/tool context. */
      apply(ctx) {
        ctx.effect(() => ctx.locale.register(LOCALE, { zh, en }), 'sky-computer-use: dictionaries');
        const card = new CardController(ctx.settingsScope.bind({ namespace: NS }), ctx.locale.bind(LOCALE));
        ctx.effect(() => () => card.dispose(), 'sky-computer-use: settings card');
        ctx.effect(() => ctx.on('connection/reset', () => card.resetConnection()),
          'sky-computer-use: connection generation');
        ctx.slots.inject('settings.plugin.item', () => ctx.slots.register({
          name: 'settings.plugin.item',
          key: NS,
          locale: LOCALE,
          inject: () => card.inject(),
        }, Card));
      },
    };
  },
});
