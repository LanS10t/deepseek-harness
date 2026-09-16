import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import Tools from '@deepseek-ai/dsh-tools'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import Approval, { setApprovalPolicy } from '@deepseek-ai/dsh-user-approval'
import { ToolCallId, createToolResultMessage } from '@deepseek-ai/dsh-llm'
import { Session, SessionId } from '@deepseek-ai/dsh-session'
import LocalAttachmentStore from '@deepseek-ai/dsh-attachment-local'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import Commands from '@deepseek-ai/dsh-commands'
import { MemorySettings } from '../../../packages/settings/settings/tests/memory.ts'
import { createTools, Config } from '../index.js'
import * as plugin from '../index.js'
import { DesktopController } from '../policy.js'
import { prepareObservation } from '../images.js'

describe('assembled desktop tool transcript without credentials', () => {
  it('projects registered tools, DSH approval refusal and rich image content through the real runtime', async () => {
    const ctx = new Context()
    await ctx.plugin(SystemPrompt)
    await ctx.plugin(Tools)
    await ctx.plugin(Approval)
    const session = Session.create(SessionId('sky-keyless-snapshot'))
    session.append('turn/start', { turn: 1 })
    const agent = { session }
    const config = Config({ mode: 'ask', allowedApps: ['test.exe'] })
    const calls: string[] = []
    const nativeWindow = { app: 'test.exe', id: 42 }
    const runtime = {
      status: () => 'fake',
      async stop() {},
      async call(_config: unknown, operation: string) {
        calls.push(operation)
        if (operation === 'list_windows') return [nativeWindow]
        if (operation === 'get_window_state') return {
          window: nativeWindow, accessibility: { tree: '[1] input', focused_element: '[1] input' },
          screenshots: [{ id: 's', width: 100, height: 100, url: 'data:image/png;base64,aGVsbG8=' }],
        }
        return null
      },
    }
    const desktop = new DesktopController({
      config: () => config, runtime,
      approve: (_owner: unknown, _op: string, _args: unknown, signal: AbortSignal) =>
        ctx.approval.request({ agent: agent as never, toolName: 'computer_type_text', signal }),
    })
    const attachment = { id: 'test-image', mediaType: 'image/png', size: 5 }
    for (const tool of createTools(desktop, (state: unknown, exec: { signal: AbortSignal }) =>
      prepareObservation(state, { saveImages: async () => [attachment] }, true, exec.signal))) {
      ctx.effect(() => ctx.tools.register(tool))
    }
    const execute = (name: string, args: unknown) => ctx.tools.execute({
      callId: ToolCallId(`call-${session.seq}-${calls.length}`), name, arguments: args,
      agent: agent as never, signal: new AbortController().signal,
    })
    const list = await execute('computer_list_windows', {})
    expect(list.isError).toBe(false)
    const rows = JSON.parse((list.content[0] as { text: string }).text)
    const observed = await execute('computer_observe', { windowId: rows[0].windowId })
    expect(observed.isError).toBe(false)
    const observation = JSON.parse((observed.content[0] as { text: string }).text)
    const refusal = await execute('computer_type_text', {
      windowId: rows[0].windowId, observationId: observation.observationId,
      purpose: '输入测试文本', risk: 'ordinary', input: { text: '中文' },
    })
    expect(refusal.isError).toBe(true)
    expect(calls).not.toContain('type_text')
    expect({
      tools: ctx.tools.schemas().map(tool => tool.name),
      richContent: observed.content.map(block => block.type),
      approvalEvents: session.snapshotEvents().filter(event => event.type.startsWith('approval/')).map(event => ({
        type: event.type, outcome: (event.data as { outcome?: string }).outcome ?? null,
      })),
      refusal: refusal.content,
    }).toMatchSnapshot()
    setApprovalPolicy(agent.session as never, 'never')
    const second = await execute('computer_observe', { windowId: rows[0].windowId })
    const secondObservation = JSON.parse((second.content[0] as { text: string }).text)
    const never = await execute('computer_type_text', {
      windowId: rows[0].windowId, observationId: secondObservation.observationId,
      purpose: '输入文本', risk: 'ordinary', input: { text: '中文' },
    })
    expect(never.isError).toBe(true)
    expect(calls).not.toContain('type_text')
  })

  it('persists a real image and retains the same reference in session-derived model content', async () => {
    const prefix = resolve(join(tmpdir(), 'dsh-sky-attachment-'))
    const home = await mkdtemp(prefix)
    try {
      const store = new LocalAttachmentStore(new Context(), { dshHome: home })
      const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAADElEQVQImWNgZGIGAAAOAAeCcsnOAAAAAElFTkSuQmCC'
      const value = await prepareObservation({
        window: { id: 1, app: 'fixture.exe' }, windowId: 'w', observationId: 'o',
        accessibility: { tree: 'Test' },
        screenshots: [{ id: 's', width: 1, height: 1, url: `data:image/png;base64,${png}` }],
      }, store, true, new AbortController().signal)
      const ref = value.screenshots[0].attachment
      expect(await readFile(store.imageHostPath(ref))).toEqual(Buffer.from(png, 'base64'))
      const session = Session.create(SessionId('sky-image-log'))
      session.append('turn/start', { turn: 1 })
      session.append('tool/result', {
        turn: 1, step: 1,
        message: createToolResultMessage({
          callId: ToolCallId('image-call'), isError: false,
          content: [{ type: 'image', attachment: ref }],
        }),
      }, { surfaceOp: 'append' })
      expect(JSON.stringify(session.deriveMessages())).toContain(ref.attachmentId)
      expect(JSON.stringify(session.snapshotEvents())).not.toContain(png)
      expect((await store.readImage(ref)).data).toEqual(Uint8Array.from(Buffer.from(png, 'base64')))
    } finally {
      if (!resolve(home).startsWith(prefix)) throw new Error('Unexpected test directory')
      await rm(home, { recursive: true, force: true })
    }
  })

  it('mounts the real plugin and reports unconfirmed native stop as an error', async () => {
    const ctx = new Context()
    const fibers = [
      ctx.plugin(SystemPrompt), ctx.plugin(Tools), ctx.plugin(Approval),
      ctx.plugin(Commands), ctx.plugin(MemorySettings),
    ]
    for (const fiber of fibers) await fiber
    ctx.provide('attachments', {} as never)
    const fiber = ctx.plugin(plugin, Config({
      mode: 'full', allowAllApps: true, callTimeoutMs: 1000,
      packagePath: fileURLToPath(new URL('./fixtures/sky', import.meta.url)),
      expectedVersion: '0.0.0-test',
    }))
    await fiber
    const session = Session.create(SessionId('sky-mounted-plugin'))
    session.append('turn/start', { turn: 1 })
    const agent = { session } as never
    const signal = new AbortController().signal
    let seq = 0
    const execute = (name: string, args: unknown = {}) => ctx.tools.execute({
      name, arguments: args, agent, signal, callId: ToolCallId(`mounted-${++seq}`),
    })
    try {
      expect(ctx.settings.describe().some(section => section.ns === 'sky-computer-use')).toBe(true)
      expect((await execute('computer_list_windows')).isError).toBe(false)
      const operation = execute('computer_launch_app', { app: 'hung-close.exe', purpose: 'Test fixture', risk: 'ordinary' })
      await new Promise(resolve => setTimeout(resolve, 100))
      const stop = await ctx.commands.execute(agent, '/computer-stop', [], signal)
      expect(stop?.result.kind).toBe('error')
      expect(stop?.result.text).toContain('原生关闭未获确认')
      expect((await operation).isError).toBe(true)
      const status = await execute('computer_status')
      expect((status.content[0] as { text: string }).text).toContain('unavailable-restart-required')
      expect((await execute('computer_list_windows')).isError).toBe(true)
      await ctx.settings.update('sky-computer-use', { mode: 'disabled', stopEpoch: 1 })
      expect((await execute('computer_list_windows')).isError).toBe(true)
    } finally {
      await fiber.dispose()
      expect(ctx.tools.schemas().some(tool => tool.name.startsWith('computer_'))).toBe(false)
      const replacement = ctx.plugin(plugin, Config({ mode: 'disabled' }))
      await replacement
      const status = await execute('computer_status')
      expect((status.content[0] as { text: string }).text).toContain('unavailable-restart-required')
      await replacement.dispose()
      for (const item of fibers.reverse()) await item.dispose()
    }
  })
})
