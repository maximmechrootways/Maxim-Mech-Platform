/**
 * Frank agentic loop: run Claude with tools, execute tools via connectors, stream SSE.
 */

import Anthropic from '@anthropic-ai/sdk'
import { getFrankTools } from './tools'
import { executeTool } from './connectors'
import type { FrankContext } from './types'

type MessageParam = Anthropic.Messages.MessageParam

const MAX_TURNS = 15
const MODEL = 'claude-sonnet-4-6'
const MAX_TOKENS = 8192
const TEMPERATURE = 0

export interface AgentSSEOptions {
    apiKey: string
    systemPrompt: string
    messages: MessageParam[]
    context: FrankContext
    emit: (event: string, data: Record<string, unknown>) => void
}

/**
 * Run the agentic loop: call Claude with tools; on tool_use, execute and re-call until done.
 * Emits SSE events: text (delta), tool_call (name), tool_result (name, result), done (fullText), error.
 */
export async function runAgentLoop(options: AgentSSEOptions): Promise<void> {
    const { apiKey, systemPrompt, messages, context, emit } = options
    const client = new Anthropic({ apiKey })
    const tools = getFrankTools()
    let history: MessageParam[] = [...messages]
    let turnCount = 0
    let fullText = ''

    while (turnCount < MAX_TURNS) {
        turnCount++
        const stream = client.messages.stream({
            model: MODEL,
            max_tokens: MAX_TOKENS,
            temperature: TEMPERATURE,
            system: systemPrompt,
            messages: history,
            tools: tools.length > 0 ? tools : undefined,
        })

        const toolUses: Array<{ id: string; name: string; input: unknown }> = []

        stream.on('text', (delta: string) => {
            fullText += delta
            emit('text', { text: delta })
        })

        const finalMessage = await stream.finalMessage()
        const content = finalMessage.content ?? []
        for (const block of content) {
            if (block.type === 'tool_use') {
                const b = block as { id: string; name: string; input: unknown }
                toolUses.push({ id: b.id, name: b.name, input: b.input })
                emit('tool_call', { name: b.name })
            }
        }

        // Always push assistant turn with full structured content (including tool_use blocks)
        history.push({ role: 'assistant', content } as MessageParam)

        if (toolUses.length === 0) {
            // Emit full history so frontend passes it back verbatim next turn — no reconstruction needed
            emit('done', { text: fullText, history })
            return
        }

        const toolResults: Array<{ type: 'tool_result'; tool_use_id: string; content: string }> = []
        for (const use of toolUses) {
            const result = await executeTool(use.name, (use.input as Record<string, unknown>) ?? {}, context)
            const resultStr = typeof result === 'string' ? result : JSON.stringify(result)
            toolResults.push({ type: 'tool_result', tool_use_id: use.id, content: resultStr })
            emit('tool_result', { name: use.name, result })
        }

        history.push({ role: 'user', content: toolResults } as MessageParam)
    }

    emit('done', { text: fullText || 'I hit the turn limit. Please try a shorter question.', history })
}
