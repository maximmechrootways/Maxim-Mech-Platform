"use strict";
/**
 * Frank agentic loop: run Claude with tools, execute tools via connectors, stream SSE.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.runAgentLoop = runAgentLoop;
const sdk_1 = __importDefault(require("@anthropic-ai/sdk"));
const tools_1 = require("./tools");
const connectors_1 = require("./connectors");
const MAX_TURNS = 15;
const MODEL = 'claude-sonnet-4-6';
const MAX_TOKENS = 8192;
const TEMPERATURE = 0;
/**
 * Run the agentic loop: call Claude with tools; on tool_use, execute and re-call until done.
 * Emits SSE events: text (delta), tool_call (name), tool_result (name, result), done (fullText), error.
 */
async function runAgentLoop(options) {
    const { apiKey, systemPrompt, messages, context, emit } = options;
    const client = new sdk_1.default({ apiKey });
    const tools = (0, tools_1.getFrankTools)();
    let history = [...messages];
    let turnCount = 0;
    let fullText = '';
    while (turnCount < MAX_TURNS) {
        turnCount++;
        const stream = client.messages.stream({
            model: MODEL,
            max_tokens: MAX_TOKENS,
            temperature: TEMPERATURE,
            system: systemPrompt,
            messages: history,
            tools: tools.length > 0 ? tools : undefined,
        });
        const toolUses = [];
        stream.on('text', (delta) => {
            fullText += delta;
            emit('text', { text: delta });
        });
        const finalMessage = await stream.finalMessage();
        const content = finalMessage.content ?? [];
        for (const block of content) {
            if (block.type === 'tool_use') {
                const b = block;
                toolUses.push({ id: b.id, name: b.name, input: b.input });
                emit('tool_call', { name: b.name });
            }
        }
        // Always push assistant turn with full structured content (including tool_use blocks)
        history.push({ role: 'assistant', content });
        if (toolUses.length === 0) {
            // Emit full history so frontend passes it back verbatim next turn — no reconstruction needed
            emit('done', { text: fullText, history });
            return;
        }
        const toolResults = [];
        for (const use of toolUses) {
            const result = await (0, connectors_1.executeTool)(use.name, use.input ?? {}, context);
            const resultStr = typeof result === 'string' ? result : JSON.stringify(result);
            toolResults.push({ type: 'tool_result', tool_use_id: use.id, content: resultStr });
            emit('tool_result', { name: use.name, result });
        }
        history.push({ role: 'user', content: toolResults });
    }
    emit('done', { text: fullText || 'I hit the turn limit. Please try a shorter question.', history });
}
