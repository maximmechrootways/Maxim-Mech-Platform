"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildFallbackSummary = buildFallbackSummary;
exports.extractToolboxTopicsFromHtml = extractToolboxTopicsFromHtml;
exports.listToolboxTopics = listToolboxTopics;
exports.getToolboxTopicById = getToolboxTopicById;
exports.attachTopicPdfToSubmissionBlob = attachTopicPdfToSubmissionBlob;
exports.importToolboxTopics = importToolboxTopics;
const crypto_1 = __importDefault(require("crypto"));
const sdk_1 = __importDefault(require("@anthropic-ai/sdk"));
const prisma_1 = require("../lib/prisma");
const blobStorageService_1 = require("./blobStorageService");
// eslint-disable-next-line @typescript-eslint/no-var-requires
const pdfParse = require('pdf-parse');
const IHSA_SAFETY_TALKS_URL = 'https://www.ihsa.ca/resources/safetytalks.aspx';
const SOURCE_PROVIDER = 'IHSA';
const MAX_EXTRACT_CHARS = 20000;
function stripHtml(input) {
    return String(input ?? '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/gi, ' ')
        .replace(/&amp;/gi, '&')
        .replace(/&quot;/gi, '"')
        .replace(/&#39;/gi, "'")
        .replace(/\s+/g, ' ')
        .trim();
}
function decodeHtml(input) {
    return String(input ?? '')
        .replace(/&nbsp;/gi, ' ')
        .replace(/&amp;/gi, '&')
        .replace(/&quot;/gi, '"')
        .replace(/&#39;/gi, "'")
        .replace(/&ndash;/gi, '-')
        .replace(/&mdash;/gi, '-')
        .trim();
}
function toAbsoluteUrl(href) {
    try {
        return new URL(href, IHSA_SAFETY_TALKS_URL).toString();
    }
    catch {
        return '';
    }
}
function guessCategory(title, sourcePdfUrl) {
    const lowerTitle = String(title ?? '').toLowerCase();
    const lowerUrl = String(sourcePdfUrl ?? '').toLowerCase();
    if (lowerTitle.includes('mental health') || lowerTitle.includes('stress'))
        return 'Mental Health';
    if (lowerTitle.includes('electrical') || lowerTitle.includes('energ'))
        return 'Electrical Safety';
    if (lowerTitle.includes('fall') || lowerTitle.includes('ladder'))
        return 'Working at Heights';
    if (lowerTitle.includes('lifting') || lowerTitle.includes('ergonom'))
        return 'Ergonomics';
    if (lowerTitle.includes('fire') || lowerTitle.includes('hot work'))
        return 'Fire and Hot Work';
    if (lowerUrl.includes('/transport') || lowerTitle.includes('vehicle'))
        return 'Transportation';
    return 'General Safety';
}
function normalizeWhitespace(text) {
    return String(text ?? '')
        .replace(/\r/g, '\n')
        .replace(/[ \t]+/g, ' ')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}
function firstSentences(text, max = 5) {
    const cleaned = normalizeWhitespace(text);
    if (!cleaned)
        return [];
    return cleaned
        .split(/(?<=[.!?])\s+/)
        .map((sentence) => sentence.trim())
        .filter(Boolean)
        .slice(0, max);
}
function buildFallbackSummary(rawExtract) {
    const sentences = firstSentences(rawExtract, 8);
    const summary = sentences.slice(0, 3).join(' ');
    const keyPoints = sentences.slice(0, 5);
    return {
        summary: summary || 'Review the linked IHSA PDF for discussion points and safe work practices.',
        keyPoints: keyPoints.length > 0 ? keyPoints : ['Review the linked IHSA PDF before starting work.'],
    };
}
function parseAiSummary(rawResponse) {
    const cleaned = String(rawResponse ?? '').trim();
    if (!cleaned)
        return null;
    try {
        const parsed = JSON.parse(cleaned);
        const summary = String(parsed.summary ?? '').trim();
        const keyPoints = Array.isArray(parsed.keyPoints)
            ? parsed.keyPoints.map((item) => String(item ?? '').trim()).filter(Boolean).slice(0, 6)
            : [];
        if (!summary || keyPoints.length === 0)
            return null;
        return { summary, keyPoints };
    }
    catch {
        return null;
    }
}
async function generateSummaryWithAnthropic(topicTitle, rawExtract) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    const model = String(process.env.TOOLBOX_TOPIC_SUMMARY_MODEL ?? 'claude-3-5-haiku-latest').trim();
    if (!apiKey)
        return null;
    const client = new sdk_1.default({ apiKey });
    const prompt = [
        'You are summarizing a construction safety toolbox talk.',
        'Return strict JSON with shape: {"summary":"...","keyPoints":["..."]}.',
        'Summary must be 2-3 concise sentences.',
        'keyPoints must contain 3-5 short worker-facing bullets.',
        `Topic title: ${topicTitle}`,
        'Source text:',
        rawExtract.slice(0, MAX_EXTRACT_CHARS),
    ].join('\n');
    const payload = {
        model,
        max_tokens: 500,
        temperature: 0.2,
        messages: [{ role: 'user', content: prompt }],
    };
    const response = await client.messages.create(payload);
    const text = response.content
        .filter((block) => block?.type === 'text' && typeof block?.text === 'string')
        .map((block) => String(block.text))
        .join('\n');
    return parseAiSummary(text);
}
async function extractPdfText(buffer) {
    const parsed = await pdfParse(buffer);
    return normalizeWhitespace(String(parsed?.text ?? ''));
}
function extractToolboxTopicsFromHtml(html, sourcePageUrl) {
    const regex = /<a[^>]*href=["']([^"']+\.pdf(?:\?[^"']*)?)["'][^>]*>([\s\S]*?)<\/a>/gi;
    const topicMap = new Map();
    let match;
    while ((match = regex.exec(html)) != null) {
        const href = String(match[1] ?? '').trim();
        const innerText = stripHtml(match[2] ?? '');
        const sourcePdfUrl = toAbsoluteUrl(decodeHtml(href));
        const title = decodeHtml(innerText) || decodeHtml(href.split('/').pop() ?? '').replace(/\.pdf$/i, '');
        if (!sourcePdfUrl)
            continue;
        if (!title)
            continue;
        if (!/\.pdf(\?|$)/i.test(sourcePdfUrl))
            continue;
        const topic = {
            title,
            sourcePdfUrl,
            sourcePageUrl,
            category: guessCategory(title, sourcePdfUrl),
        };
        topicMap.set(sourcePdfUrl.toLowerCase(), topic);
    }
    return [...topicMap.values()].sort((a, b) => a.title.localeCompare(b.title));
}
async function fetchTopicIndex(sourcePageUrl) {
    const response = await fetch(sourcePageUrl);
    if (!response.ok)
        throw { status: 502, message: `Could not fetch IHSA index (${response.status})` };
    const html = await response.text();
    return extractToolboxTopicsFromHtml(html, sourcePageUrl);
}
function normalizeLimit(value, fallback, max) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0)
        return fallback;
    return Math.min(Math.floor(parsed), max);
}
async function listToolboxTopics(params) {
    const limit = normalizeLimit(params?.limit, 50, 200);
    const cursor = String(params?.cursor ?? '').trim();
    const search = String(params?.search ?? '').trim();
    const includeInactive = Boolean(params?.includeInactive);
    const where = {
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
    };
    const rows = await prisma_1.prisma.toolboxTopic.findMany({
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
    });
    const hasMore = rows.length > limit;
    const items = (hasMore ? rows.slice(0, limit) : rows).map((row) => ({
        id: row.id,
        topicTitle: row.topicTitle,
        category: row.category ?? undefined,
        summary: row.summary ?? undefined,
        keyPoints: Array.isArray(row.keyPoints) ? row.keyPoints.map((item) => String(item ?? '')).filter(Boolean) : [],
        sourcePdfUrl: row.sourcePdfUrl,
        sourcePageUrl: row.sourcePageUrl ?? undefined,
        lastImportedAt: row.lastImportedAt ? new Date(row.lastImportedAt).toISOString() : undefined,
        importStatus: row.importStatus,
        isActive: Boolean(row.isActive),
    }));
    return {
        items,
        nextCursor: hasMore ? String(items[items.length - 1]?.id ?? '') : null,
    };
}
async function getToolboxTopicById(topicId) {
    const topic = await prisma_1.prisma.toolboxTopic.findUnique({
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
    });
    if (!topic || !topic.isActive)
        throw { status: 404, message: 'Toolbox topic not found' };
    return {
        id: topic.id,
        topicTitle: topic.topicTitle,
        category: topic.category ?? undefined,
        summary: topic.summary ?? undefined,
        keyPoints: Array.isArray(topic.keyPoints) ? topic.keyPoints.map((item) => String(item ?? '')).filter(Boolean) : [],
        sourcePdfUrl: topic.sourcePdfUrl,
        sourcePdfHash: topic.sourcePdfHash ?? undefined,
        sourcePageUrl: topic.sourcePageUrl ?? undefined,
        importStatus: topic.importStatus,
        importError: topic.importError ?? undefined,
        lastImportedAt: topic.lastImportedAt ? new Date(topic.lastImportedAt).toISOString() : undefined,
    };
}
async function attachTopicPdfToSubmissionBlob(params) {
    const topic = await getToolboxTopicById(params.topicId);
    const response = await fetch(topic.sourcePdfUrl);
    if (!response.ok)
        throw { status: 502, message: `Could not download source PDF (${response.status})` };
    const contentType = String(response.headers.get('content-type') ?? '').toLowerCase();
    if (contentType && !contentType.includes('pdf')) {
        throw { status: 400, message: 'Selected topic source is not a PDF' };
    }
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    if (!buffer.length)
        throw { status: 400, message: 'Source PDF was empty' };
    const blobPath = `submissions/${params.submissionId}-topic-${Date.now()}-${Math.random().toString(36).slice(2, 10)}.pdf`;
    await (0, blobStorageService_1.uploadBufferToBlob)(blobPath, buffer, 'application/pdf');
    const originalName = topic.topicTitle
        .replace(/[^a-z0-9]+/gi, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 80) || 'toolbox-topic';
    return {
        blobPath,
        originalName: `${originalName}.pdf`,
    };
}
async function importToolboxTopics(params) {
    const sourcePageUrl = String(params?.sourcePageUrl ?? IHSA_SAFETY_TALKS_URL).trim() || IHSA_SAFETY_TALKS_URL;
    const offset = Math.max(0, Math.floor(Number(params?.offset ?? 0) || 0));
    const batchSize = normalizeLimit(params?.batchSize, 20, 100);
    const batchTag = String(params?.batchTag ?? '').trim() || `batch-${new Date().toISOString().slice(0, 10)}`;
    const importedById = params?.importedById;
    const dryRun = Boolean(params?.dryRun);
    const allTopics = await fetchTopicIndex(sourcePageUrl);
    const batch = allTopics.slice(offset, offset + batchSize);
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
        failures: [],
    };
    for (const topic of batch) {
        try {
            if (dryRun) {
                telemetry.skipped += 1;
                continue;
            }
            const pdfResponse = await fetch(topic.sourcePdfUrl);
            if (!pdfResponse.ok)
                throw new Error(`PDF download failed (${pdfResponse.status})`);
            const pdfBuffer = Buffer.from(await pdfResponse.arrayBuffer());
            if (!pdfBuffer.length)
                throw new Error('PDF was empty');
            const sourcePdfHash = crypto_1.default.createHash('sha256').update(pdfBuffer).digest('hex');
            const rawExtract = (await extractPdfText(pdfBuffer)).slice(0, MAX_EXTRACT_CHARS);
            const aiSummary = await generateSummaryWithAnthropic(topic.title, rawExtract).catch(() => null);
            const fallback = buildFallbackSummary(rawExtract);
            const summary = aiSummary?.summary ?? fallback.summary;
            const keyPoints = aiSummary?.keyPoints ?? fallback.keyPoints;
            const existing = await prisma_1.prisma.toolboxTopic.findUnique({
                where: {
                    sourceProvider_sourcePdfUrl: {
                        sourceProvider: SOURCE_PROVIDER,
                        sourcePdfUrl: topic.sourcePdfUrl,
                    },
                },
                select: { id: true, sourcePdfHash: true },
            });
            if (existing?.id) {
                await prisma_1.prisma.toolboxTopic.update({
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
                });
                telemetry.updated += 1;
            }
            else {
                await prisma_1.prisma.toolboxTopic.create({
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
                });
                telemetry.created += 1;
            }
        }
        catch (error) {
            telemetry.failed += 1;
            telemetry.failures.push({
                sourcePdfUrl: topic.sourcePdfUrl,
                title: topic.title,
                error: String(error?.message ?? 'Unknown import error'),
            });
            if (!dryRun) {
                await prisma_1.prisma.toolboxTopic.upsert({
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
                });
            }
        }
    }
    return telemetry;
}
