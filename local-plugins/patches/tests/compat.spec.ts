import { expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import Agents from '@deepseek-ai/dsh-agent'
import AgentLoop from '@deepseek-ai/dsh-agent-loop'
import Llm from '@deepseek-ai/dsh-llm'
import Sessions, { SessionId } from '@deepseek-ai/dsh-session'
import Projections from '@deepseek-ai/dsh-session-projection'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import Tools, { defineContentToolFixture } from '@deepseek-ai/dsh-tools'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { JSDOM } from 'jsdom'
import { installContinuableMemberSetup } from '../../../.storages/dsh-home/profiles/web/node_modules/@nanmicoder/dsh-agent-teams/lib/harness-compat.js'
import { installTeamCapabilities } from '../../../.storages/dsh-home/profiles/web/node_modules/@nanmicoder/dsh-agent-teams/lib/capabilities.js'
import { TEAM_TOOL_NAMES, MEMBER_TOOL_NAMES } from '../../../.storages/dsh-home/profiles/web/node_modules/@nanmicoder/dsh-agent-teams/lib/tool-names.js'
import { buildOutlineItems } from '../../../.storages/dsh-home/profiles/web/node_modules/dsh-outline/src/client/outline-source.ts'
import { findChatRoot, locateItem } from '../../../.storages/dsh-home/profiles/web/node_modules/dsh-outline/src/client/dom-anchor.ts'

it('initializes modern AgentTeams members before agent creation resolves and revokes them on unload', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-plugin-compat-'))
  const ctx = new Context()
  let installed = 0
  let disposed = 0
  try {
    for (const plugin of [Sessions, Projections, Agents, Llm, SystemPrompt, Tools]) await ctx.plugin(plugin)
    await ctx.plugin(AgentLoop, { agents: [] })
    ctx.provide('subagents', {
      [Symbol.for('dsh.subagent.deliverPrompt')]: () => {},
      sendMessage: () => {},
    } as never)
    const fiber = ctx.plugin({
      inject: ['systemPrompt', 'tools', 'agents', 'subagents'],
      apply(child: Context) {
        for (const name of TEAM_TOOL_NAMES) {
          child.tools.register(defineContentToolFixture({
            name, description: 'Compatibility fixture', parameters: {},
            async execute() { return [] },
          }))
        }
        installContinuableMemberSetup(child, () => {
          installed++
          return () => { disposed++ }
        })
        installTeamCapabilities(child, {
          stateDir: '.agent-teams',
          captainPrompt: () => 'CAPTAIN',
          isPendingMember: () => true,
        })
      },
    })
    await fiber
    const handle = await ctx.agents.create({
      sessionId: SessionId('compat-member'),
      meta: { cwd: root },
    })
    expect(installed).toBe(1)
    expect(ctx.tools.schemas(handle.agent).map(tool => tool.name).sort()).toEqual([...MEMBER_TOOL_NAMES].sort())
    const prompt = await ctx.systemPrompt.assemble({
      agent: handle.agent, scope: handle.agent, signal: new AbortController().signal,
    })
    expect(JSON.stringify(prompt)).toContain('You are an AgentTeams member.')
    await fiber.dispose()
    expect(disposed).toBe(1)
    await handle.dispose()
    expect(disposed).toBe(1)
  } finally {
    await ctx.fiber.dispose()
    await rm(root, { recursive: true, force: true })
  }
})

it('projects current Chat legacy history and streamed headings without reading lifecycle snapshots', () => {
  const output = buildOutlineItems({
    nodes: [
      { kind: 'user', content: [{ type: 'text', text: 'Question' }] },
      { kind: 'assistant', blocks: [{ kind: 'text', text: '# Answer' }] },
    ],
    partial: { blocks: [{ kind: 'text', text: '## Streaming' }] },
  } as never)
  expect(output.map(item => ({ text: item.text, streaming: item.streaming ?? false }))).toEqual([
    { text: 'Question', streaming: false },
    { text: 'Answer', streaming: false },
    { text: 'Streaming', streaming: true },
  ])
})

it('locates outline questions inside the current conversation session slot', () => {
  const dom = new JSDOM('<main data-slot="main.conversation"><section data-slot="conversation.session"><div data-chat-flow-kind="user">Question</div></section><div data-slot="conversation.composer">Question</div></main>')
  try {
    const root = findChatRoot(dom.window.document)
    expect(root?.getAttribute('data-slot')).toBe('conversation.session')
    expect(locateItem(root!, { text: 'Question', isUserQuery: true, userIndex: 0 } as never)?.getAttribute('data-chat-flow-kind')).toBe('user')
  } finally {
    dom.window.close()
  }
})
