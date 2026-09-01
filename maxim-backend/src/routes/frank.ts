import { Router, Request, Response } from 'express'
import type { MessageParam } from '@anthropic-ai/sdk/resources/messages'
import { authenticate } from '../middleware/authenticate'
import { runAgentLoop } from '../frank/agent'
import type { FrankContext } from '../frank/types'
import { isLocalDocumentStoreConfigured } from '../services/localDocumentService'

const router = Router()
router.use(authenticate)

function ensureFrankAccess(role: string) {
    return role === 'owner' || role === 'hr' || role === 'supervisor'
}

function getFrankSystemPrompt(): string {
    const now = new Date()
    const today = now.toISOString().slice(0, 10)
    const dayName = now.toLocaleDateString('en-US', { weekday: 'long' })

    // Generate a 6-week calendar for Claude to reference so it never miscalculates day-of-week
    const dayAbbr = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
    const weekStart = new Date(now)
    weekStart.setDate(weekStart.getDate() - weekStart.getDay()) // go to Sunday of this week
    const calLines: string[] = []
    for (let w = 0; w < 6; w++) {
        const days: string[] = []
        for (let d = 0; d < 7; d++) {
            const dt = new Date(weekStart)
            dt.setDate(dt.getDate() + w * 7 + d)
            const iso = dt.toISOString().slice(0, 10)
            const label = iso === today ? `**${dayAbbr[d]} ${iso} (TODAY)**` : `${dayAbbr[d]} ${iso}`
            days.push(label)
        }
        calLines.push(days.join(' | '))
    }
    return `You are Frank, the AI operations assistant built into Maxim — workforce management software for the trades and construction industry. You give direct, confident answers grounded in real data.

## Tools Available
You have tools to query: employees, jobs, sites, certificates, form templates, library documents, submissions, incidents, injuries, near-misses, hazards, safety alerts, inspections, CAPA, compliance calendar, HR todos, subcontractors, audit log, and notifications.
- For anything uploaded in "Forms & documents": use query_form_templates (fillable/submittable forms) or query_library_documents (view-only reference documents).
- For questions about chemicals, substances, hazards, safety procedures, or any topic that might be in an SDS or uploaded document: use search_documents first. The search is semantic — "welding fumes hazards" can match content about isocyanates and metal fumes.${isLocalDocumentStoreConfigured() ? `
- A second, on-premises "local archive" holds documents ingested from USB drives and field uploads (separate from the cloud library). Use search_local_documents alongside search_documents for document-content questions. When your answer draws on a local archive passage, say so — e.g. "According to [document name] (local archive, p. 12) …" — so the user knows the source is the local store.` : ''}

---

## Rules

**1. Use tools for specific data. Never invent.**
Always call a tool when the user asks about specific data (expired certs, incidents on a job, who's on site, etc.). Never fabricate names, IDs, or counts.

**2. Chain tools as needed.**
Example: find a job by name → query incidents for that job's site.
If an intermediate step returns no results, report that before stopping. Example: "I found the job (ID: 482) but there are no incidents recorded for that site."

**3. Use names in answers, not internal IDs.**

**4. Write actions require confirmation first.**
For create_hr_todo, update_capa_status, create_calendar_event, or any other write tool:
State exactly what you will do, then wait for the user to confirm before calling the tool.
Example: "I'll create a reminder for Sarah Chen to renew her Fall Protection cert by June 1. Confirm?"

**5. Flag safety-critical items.**
Always surface expired/expiring certs, open hazards, and overdue CAPA — even if not explicitly asked.

**6. If a tool returns an error, say so. Never fabricate.**

**7. No filler before read tool calls. Write actions follow Rule 4.**
For read/query tools: execute immediately, no preamble.
For write tools: Rule 4 applies — state intent first, get confirmation, then call the tool.

**8. Document content: report what the document says, supplement general knowledge clearly.**
For document-specific facts (company procedures, product names, site-specific rules): only state what is explicitly in retrieved chunks. If not present, say "The document doesn't contain that information."
For general industry knowledge (OSHA limits, common definitions, standard practices): you may supplement, but clearly distinguish it. Example: "The document states X. For context, the general industry standard is Y."

**9. Navigation questions: answer directly. No tool call needed.**
If the user asks where to find, submit, or manage something, direct them to the correct page and stop. Do not call tools to verify.
- Incident Reports → "Health & Safety" → "Incident Reports"
- Injury Reports → "Work" → "Injury Reports"
- Hazards / Near-Misses / Observations → "Health & Safety"
- Daily Forms (Hazard Analysis, Toolkits) → "Work" → "Daily Forms"
- Job Sites → "Work" → "Job Management"
- Subcontractors → "Safety & HR" → "Subcontractors"
- Employees → "Safety & HR" → "Employees"
- Certificates → "Safety & HR" → "Certificates"
- To-Do & Calendar → "Work" → "To-Do & Calendar"

**10. Today's date: ${today} (${dayName}).**
Use the calendar reference below for ALL date lookups. Never compute day-of-week manually.

**11. Never claim a write action happened without calling the tool.**
If you see a prior "Done!" in conversation history, that does not authorize skipping the tool call for a new request. Every write action requires its own tool invocation.

**12. Every reminder is a separate tool call.**
When creating reminders or todos, always call create_hr_todo — even if you created one for the same person earlier in this conversation.

**13. Handle open-ended queries with a sensible default.**
If a user asks for data with no filters (e.g. "show me the incidents"), default to the last 30 days, surface the count first, then list details. If the dataset is large, summarize and offer to filter.

---

## Response Format
- **Simple / navigation questions**: 1–2 sentences. No bullet points unless listing multiple items.
- **Data queries**: Lead with the direct answer (count, name, status). Then supporting detail. Flag anything safety-critical in bold.
- **Write confirmations**: Single short paragraph. State the action, the target, and any key parameters. End with "Confirm?"
- **Never add unsolicited suggestions** at the end of an answer unless something is safety-critical.

---

## Calendar Reference
(Use for all date lookups — do not compute manually)
${calLines.join('\n')}`
}

/**
 * POST /frank
 * Body: { messages: Array<{ role: 'user'|'assistant', content: string }> }
 * Response: SSE stream (text/event-stream) with events: text, tool_call, tool_result, done, error.
 */
router.post('/', async (req: Request, res: Response) => {
    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) {
        return res.status(503).json({ error: 'Frank is not configured. Set ANTHROPIC_API_KEY in the server environment.' })
    }

    const { messages } = req.body as { messages?: Array<{ role: string; content?: any; text?: string }> }
    if (!Array.isArray(messages) || messages.length === 0) {
        return res.status(400).json({ error: 'messages array is required' })
    }

    const user = req.user!
    if (!ensureFrankAccess(user.role)) {
        return res.status(403).json({ error: 'Frank is available to Owner, HR, and Supervisor only.' })
    }
    const roleLabel = user.role === 'owner'
        ? 'Full access'
        : user.role === 'hr'
            ? 'HR access'
            : 'Supervisor access'
    const systemPrompt = `${getFrankSystemPrompt()}

Current user: ${user.email} (${user.role}). Access level: ${roleLabel}. Only expose data their role can see.`

    // Accept messages as-is — the frontend sends the raw Anthropic MessageParam array from agent history.
    // Do not normalize: tool_use and tool_result blocks must survive as structured objects.
    const anthropicMessages = (messages as MessageParam[]).filter(
        (m) => m.role === 'user' || m.role === 'assistant'
    )

    if (anthropicMessages.length === 0) {
        return res.status(400).json({ error: 'No valid messages' })
    }

    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('Connection', 'keep-alive')
    res.flushHeaders?.()

    const emit = (event: string, data: Record<string, unknown>) => {
        const payload = JSON.stringify(data)
        res.write(`event: ${event}\ndata: ${payload}\n\n`)
    }

    const context: FrankContext = {
        userId: user.id,
        userRole: user.role,
        userEmail: user.email,
    }

    try {
        await runAgentLoop({
            apiKey,
            systemPrompt,
            messages: anthropicMessages,
            context,
            emit,
        })
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Frank is temporarily unavailable.'
        console.error('Frank agent error:', err)
        emit('error', { message })
    } finally {
        res.end()
    }
})

/**
 * POST /frank/tts
 * Body: { text: string }
 * Response: audio/mpeg stream from ElevenLabs
 */
router.post('/tts', async (req: Request, res: Response) => {
    const user = req.user!
    if (!ensureFrankAccess(user.role)) {
        return res.status(403).json({ error: 'Frank is available to Owner, HR, and Supervisor only.' })
    }

    const text = String((req.body as { text?: unknown })?.text ?? '').trim()
    if (!text) {
        return res.status(400).json({ error: 'text is required' })
    }

    const elevenLabsKey = process.env.ELEVENLABS_API_KEY
    if (!elevenLabsKey) {
        return res.status(503).json({ error: 'TTS is not configured. Set ELEVENLABS_API_KEY in server environment.' })
    }

    const voiceId = process.env.ELEVENLABS_VOICE_ID || 'IRHApOXLvnW57QJPQH2P'
    const modelId = process.env.ELEVENLABS_MODEL_ID || 'eleven_turbo_v2_5'

    try {
        const upstream = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
            method: 'POST',
            headers: {
                'xi-api-key': elevenLabsKey,
                'Content-Type': 'application/json',
                Accept: 'audio/mpeg',
            },
            body: JSON.stringify({
                text,
                model_id: modelId,
                voice_settings: {
                    stability: 0.45,
                    similarity_boost: 0.85,
                },
            }),
        })

        if (!upstream.ok) {
            const errText = await upstream.text().catch(() => '')
            return res.status(502).json({
                error: 'ElevenLabs request failed',
                details: errText.slice(0, 300) || upstream.statusText,
            })
        }

        const audioBuffer = Buffer.from(await upstream.arrayBuffer())
        res.setHeader('Content-Type', 'audio/mpeg')
        res.setHeader('Cache-Control', 'no-store')
        return res.send(audioBuffer)
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'TTS request failed'
        return res.status(500).json({ error: message })
    }
})

export default router
