import crypto from 'crypto'
import type { MessageCreateParams } from '@anthropic-ai/sdk/resources/messages'
import Anthropic from '@anthropic-ai/sdk'
import { prisma } from '../lib/prisma'
import { uploadBufferToBlob } from './blobStorageService'

// eslint-disable-next-line @typescript-eslint/no-var-requires
const pdfParse = require('pdf-parse')

const IHSA_SAFETY_TALKS_URL = 'https://www.ihsa.ca/resources/safetytalks.aspx'
const SOURCE_PROVIDER = 'IHSA'
const MAX_EXTRACT_CHARS = 20000

type RawTopic = {
  title: string
  sourcePdfUrl: string
  sourcePageUrl: string
  category?: string
}

function stripHtml(input: string) {
  return String(input ?? '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim()
}

function decodeHtml(input: string) {
  return String(input ?? '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&ndash;/gi, '-')
    .replace(/&mdash;/gi, '-')
    .trim()
}

function toAbsoluteUrl(href: string) {
  try {
    return new URL(href, IHSA_SAFETY_TALKS_URL).toString()
  } catch {
    return ''
  }
}

function guessCategory(title: string, sourcePdfUrl: string) {
  const lowerTitle = String(title ?? '').toLowerCase()
  const lowerUrl = String(sourcePdfUrl ?? '').toLowerCase()
  if (lowerTitle.includes('mental health') || lowerTitle.includes('stress')) return 'Mental Health'
  if (lowerTitle.includes('electrical') || lowerTitle.includes('energ')) return 'Electrical Safety'
  if (lowerTitle.includes('fall') || lowerTitle.includes('ladder')) return 'Working at Heights'
  if (lowerTitle.includes('lifting') || lowerTitle.includes('ergonom')) return 'Ergonomics'
  if (lowerTitle.includes('fire') || lowerTitle.includes('hot work')) return 'Fire and Hot Work'
  if (lowerUrl.includes('/transport') || lowerTitle.includes('vehicle')) return 'Transportation'
  return 'General Safety'
}

function normalizeWhitespace(text: string) {
  return String(text ?? '')
    .replace(/\r/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function firstSentences(text: string, max = 5) {
  const cleaned = normalizeWhitespace(text)
  if (!cleaned) return []
  return cleaned
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean)
    .slice(0, max)
}

export function buildFallbackSummary(rawExtract: string) {
  const sentences = firstSentences(rawExtract, 8)
  const summary = sentences.slice(0, 3).join(' ')
  const keyPoints = sentences.slice(0, 5)
  return {
    summary: summary || 'Review the linked IHSA PDF for discussion points and safe work practices.',
    keyPoints: keyPoints.length > 0 ? keyPoints : ['Review the linked IHSA PDF before starting work.'],
  }
}

function parseAiSummary(rawResponse: string) {
  const cleaned = String(rawResponse ?? '').trim()
  if (!cleaned) return null
  try {
    const parsed = JSON.parse(cleaned) as { summary?: unknown; keyPoints?: unknown }
    const summary = String(parsed.summary ?? '').trim()
    const keyPoints = Array.isArray(parsed.keyPoints)
      ? parsed.keyPoints.map((item) => String(item ?? '').trim()).filter(Boolean).slice(0, 6)
      : []
    if (!summary || keyPoints.length === 0) return null
    return { summary, keyPoints }
  } catch {
    return null
  }
}

async function generateSummaryWithAnthropic(topicTitle: string, rawExtract: string) {
  const apiKey = process.env.ANTHROPIC_API_KEY
  const model = String(process.env.TOOLBOX_TOPIC_SUMMARY_MODEL ?? 'claude-3-5-haiku-latest').trim()
  if (!apiKey) return null

  const client = new Anthropic({ apiKey })
  const prompt = [
    'You are summarizing a construction safety toolbox talk.',
    'Return strict JSON with shape: {"summary":"...","keyPoints":["..."]}.',
    'Summary must be 2-3 concise sentences.',
    'keyPoints must contain 3-5 short worker-facing bullets.',
    `Topic title: ${topicTitle}`,
    'Source text:',
    rawExtract.slice(0, MAX_EXTRACT_CHARS),
  ].join('\n')

  const payload: MessageCreateParams = {
    model,
    max_tokens: 500,
    temperature: 0.2,
    messages: [{ role: 'user', content: prompt }],
  }

  const response = await client.messages.create(payload)
  const text = (response.content as any[])
    .filter((block: any) => block?.type === 'text' && typeof block?.text === 'string')
    .map((block: any) => String(block.text))
    .join('\n')
  return parseAiSummary(text)
}

async function extractPdfText(buffer: Buffer) {
  const parsed = await pdfParse(buffer)
  return normalizeWhitespace(String(parsed?.text ?? ''))
}

export function extractToolboxTopicsFromHtml(html: string, sourcePageUrl: string): RawTopic[] {
  const regex = /<a[^>]*href=["']([^"']+\.pdf(?:\?[^"']*)?)["'][^>]*>([\s\S]*?)<\/a>/gi
  const topicMap = new Map<string, RawTopic>()

  let match: RegExpExecArray | null
  while ((match = regex.exec(html)) != null) {
    const href = String(match[1] ?? '').trim()
    const innerText = stripHtml(match[2] ?? '')
    const sourcePdfUrl = toAbsoluteUrl(decodeHtml(href))
    const title = decodeHtml(innerText) || decodeHtml(href.split('/').pop() ?? '').replace(/\.pdf$/i, '')
    if (!sourcePdfUrl) continue
    if (!title) continue
    if (!/\.pdf(\?|$)/i.test(sourcePdfUrl)) continue
    const topic: RawTopic = {
      title,
      sourcePdfUrl,
      sourcePageUrl,
      category: guessCategory(title, sourcePdfUrl),
    }
    topicMap.set(sourcePdfUrl.toLowerCase(), topic)
  }

  return [...topicMap.values()].sort((a, b) => a.title.localeCompare(b.title))
}

async function fetchTopicIndex(sourcePageUrl: string): Promise<RawTopic[]> {
  const response = await fetch(sourcePageUrl)
  if (!response.ok) throw { status: 502, message: `Could not fetch IHSA index (${response.status})` }
  const html = await response.text()
  return extractToolboxTopicsFromHtml(html, sourcePageUrl)
}

function normalizeLimit(value: unknown, fallback: number, max: number) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback
  return Math.min(Math.floor(parsed), max)
}

export async function listToolboxTopics(params?: {
  search?: string
  limit?: number
  cursor?: string
  includeInactive?: boolean
}) {
  const limit = normalizeLimit(params?.limit, 50, 200)
  const cursor = String(params?.cursor ?? '').trim()
  const search = String(params?.search ?? '').trim()
  const includeInactive = Boolean(params?.includeInactive)
  const where: Record<string, unknown> = {
    ...(includeInactive ? {} : { isActive: true }),
    ...(search
      ? {
          OR: [
            { topicTitle: { contains: search, mode: 'insensitive' } },
            { summary: { contains: search, mode: 'insensitive' } },
            { category: { contains: search, mode: 'insensitive' } },
          ],
        }
      : {}),
  }

  const rows = await (prisma as any).toolboxTopic.findMany({
    where,
    orderBy: [{ topicTitle: 'asc' }, { id: 'asc' }],
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    select: {
      id: true,
      topicTitle: true,
      category: true,
      summary: true,
      keyPoints: true,
      sourcePdfUrl: true,
      sourcePageUrl: true,
      lastImportedAt: true,
      importStatus: true,
      isActive: true,
    },
  })

  const hasMore = rows.length > limit
  const items = (hasMore ? rows.slice(0, limit) : rows).map((row: any) => ({
    id: row.id,
    topicTitle: row.topicTitle,
    category: row.category ?? undefined,
    summary: row.summary ?? undefined,
    keyPoints: Array.isArray(row.keyPoints) ? row.keyPoints.map((item: unknown) => String(item ?? '')).filter(Boolean) : [],
    sourcePdfUrl: row.sourcePdfUrl,
    sourcePageUrl: row.sourcePageUrl ?? undefined,
    lastImportedAt: row.lastImportedAt ? new Date(row.lastImportedAt).toISOString() : undefined,
    importStatus: row.importStatus,
    isActive: Boolean(row.isActive),
  }))

  return {
    items,
    nextCursor: hasMore ? String(items[items.length - 1]?.id ?? '') : null,
  }
}

export async function getToolboxTopicById(topicId: string) {
  const topic = await (prisma as any).toolboxTopic.findUnique({
    where: { id: topicId },
    select: {
      id: true,
      topicTitle: true,
      category: true,
      summary: true,
      keyPoints: true,
      sourcePdfUrl: true,
      sourcePdfHash: true,
      sourcePageUrl: true,
      importStatus: true,
      importError: true,
      isActive: true,
      lastImportedAt: true,
    },
  })
  if (!topic || !topic.isActive) throw { status: 404, message: 'Toolbox topic not found' }

  return {
    id: topic.id,
    topicTitle: topic.topicTitle,
    category: topic.category ?? undefined,
    summary: topic.summary ?? undefined,
    keyPoints: Array.isArray(topic.keyPoints) ? topic.keyPoints.map((item: unknown) => String(item ?? '')).filter(Boolean) : [],
    sourcePdfUrl: topic.sourcePdfUrl,
    sourcePdfHash: topic.sourcePdfHash ?? undefined,
    sourcePageUrl: topic.sourcePageUrl ?? undefined,
    importStatus: topic.importStatus,
    importError: topic.importError ?? undefined,
    lastImportedAt: topic.lastImportedAt ? new Date(topic.lastImportedAt).toISOString() : undefined,
  }
}

export async function attachTopicPdfToSubmissionBlob(params: {
  submissionId: string
  topicId: string
}) {
  const topic = await getToolboxTopicById(params.topicId)
  const response = await fetch(topic.sourcePdfUrl)
  if (!response.ok) throw { status: 502, message: `Could not download source PDF (${response.status})` }
  const contentType = String(response.headers.get('content-type') ?? '').toLowerCase()
  if (contentType && !contentType.includes('pdf')) {
    throw { status: 400, message: 'Selected topic source is not a PDF' }
  }
  const arrayBuffer = await response.arrayBuffer()
  const buffer = Buffer.from(arrayBuffer)
  if (!buffer.length) throw { status: 400, message: 'Source PDF was empty' }

  const blobPath = `submissions/${params.submissionId}-topic-${Date.now()}-${Math.random().toString(36).slice(2, 10)}.pdf`
  await uploadBufferToBlob(blobPath, buffer, 'application/pdf')
  const originalName =
    topic.topicTitle
      .replace(/[^a-z0-9]+/gi, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80) || 'toolbox-topic'

  return {
    blobPath,
    originalName: `${originalName}.pdf`,
  }
}

export async function importToolboxTopics(params?: {
  sourcePageUrl?: string
  batchTag?: string
  offset?: number
  batchSize?: number
  importedById?: string
  dryRun?: boolean
}) {
  const sourcePageUrl = String(params?.sourcePageUrl ?? IHSA_SAFETY_TALKS_URL).trim() || IHSA_SAFETY_TALKS_URL
  const offset = Math.max(0, Math.floor(Number(params?.offset ?? 0) || 0))
  const batchSize = normalizeLimit(params?.batchSize, 20, 100)
  const batchTag = String(params?.batchTag ?? '').trim() || `batch-${new Date().toISOString().slice(0, 10)}`
  const importedById = params?.importedById
  const dryRun = Boolean(params?.dryRun)

  const allTopics = await fetchTopicIndex(sourcePageUrl)
  const batch = allTopics.slice(offset, offset + batchSize)

  const telemetry = {
    sourcePageUrl,
    discovered: allTopics.length,
    attempted: batch.length,
    created: 0,
    updated: 0,
    failed: 0,
    skipped: 0,
    offset,
    nextOffset: offset + batch.length,
    batchSize,
    batchTag,
    dryRun,
    failures: [] as Array<{ sourcePdfUrl: string; title: string; error: string }>,
  }

  for (const topic of batch) {
    try {
      if (dryRun) {
        telemetry.skipped += 1
        continue
      }

      const pdfResponse = await fetch(topic.sourcePdfUrl)
      if (!pdfResponse.ok) throw new Error(`PDF download failed (${pdfResponse.status})`)
      const pdfBuffer = Buffer.from(await pdfResponse.arrayBuffer())
      if (!pdfBuffer.length) throw new Error('PDF was empty')

      const sourcePdfHash = crypto.createHash('sha256').update(pdfBuffer).digest('hex')
      const rawExtract = (await extractPdfText(pdfBuffer)).slice(0, MAX_EXTRACT_CHARS)
      const aiSummary = await generateSummaryWithAnthropic(topic.title, rawExtract).catch(() => null)
      const fallback = buildFallbackSummary(rawExtract)
      const summary = aiSummary?.summary ?? fallback.summary
      const keyPoints = aiSummary?.keyPoints ?? fallback.keyPoints

      const existing = await (prisma as any).toolboxTopic.findUnique({
        where: {
          sourceProvider_sourcePdfUrl: {
            sourceProvider: SOURCE_PROVIDER,
            sourcePdfUrl: topic.sourcePdfUrl,
          },
        },
        select: { id: true, sourcePdfHash: true },
      })

      if (existing?.id) {
        await (prisma as any).toolboxTopic.update({
          where: { id: existing.id },
          data: {
            topicTitle: topic.title,
            category: topic.category ?? null,
            sourcePageUrl: topic.sourcePageUrl,
            sourcePdfHash,
            summary,
            keyPoints,
            rawExtract,
            importStatus: 'READY',
            importError: null,
            batchTag,
            importedById: importedById ?? null,
            lastImportedAt: new Date(),
            isActive: true,
          },
        })
        telemetry.updated += 1
      } else {
        await (prisma as any).toolboxTopic.create({
          data: {
            sourceProvider: SOURCE_PROVIDER,
            sourcePageUrl: topic.sourcePageUrl,
            sourcePdfUrl: topic.sourcePdfUrl,
            sourcePdfHash,
            topicTitle: topic.title,
            category: topic.category ?? null,
            summary,
            keyPoints,
            rawExtract,
            importStatus: 'READY',
            importError: null,
            batchTag,
            importedById: importedById ?? null,
            lastImportedAt: new Date(),
            isActive: true,
          },
        })
        telemetry.created += 1
      }
    } catch (error: any) {
      telemetry.failed += 1
      telemetry.failures.push({
        sourcePdfUrl: topic.sourcePdfUrl,
        title: topic.title,
        error: String(error?.message ?? 'Unknown import error'),
      })

      if (!dryRun) {
        await (prisma as any).toolboxTopic.upsert({
          where: {
            sourceProvider_sourcePdfUrl: {
              sourceProvider: SOURCE_PROVIDER,
              sourcePdfUrl: topic.sourcePdfUrl,
            },
          },
          create: {
            sourceProvider: SOURCE_PROVIDER,
            sourcePageUrl: topic.sourcePageUrl,
            sourcePdfUrl: topic.sourcePdfUrl,
            topicTitle: topic.title,
            category: topic.category ?? null,
            importStatus: 'FAILED',
            importError: String(error?.message ?? 'Unknown import error'),
            batchTag,
            importedById: importedById ?? null,
            lastImportedAt: new Date(),
            isActive: true,
          },
          update: {
            topicTitle: topic.title,
            category: topic.category ?? null,
            sourcePageUrl: topic.sourcePageUrl,
            importStatus: 'FAILED',
            importError: String(error?.message ?? 'Unknown import error'),
            batchTag,
            importedById: importedById ?? null,
            lastImportedAt: new Date(),
            isActive: true,
          },
        })
      }
    }
  }

  return telemetry
}
