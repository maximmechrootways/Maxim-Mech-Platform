/**
 * Client for the GX10 local RAG service (on-prem document store + GPU embeddings).
 * Reached over a Cloudflare Tunnel; authenticated with a shared secret header.
 *
 * This is a parallel retrieval source to the cloud pipeline (Voyage + Neon pgvector).
 * The GX10 embeds queries itself — its local embedding model is incompatible with
 * Voyage vectors, so query embedding must happen on that side.
 *
 * If GX10_API_URL / GX10_API_KEY are unset, isLocalDocumentStoreConfigured()
 * returns false and Frank does not receive the search_local_documents tool.
 */

import { prisma } from '../lib/prisma'

const GX10_API_URL = (process.env.GX10_API_URL || '').replace(/\/$/, '')
const GX10_API_KEY = process.env.GX10_API_KEY || ''
const REQUEST_TIMEOUT_MS = Number(process.env.GX10_TIMEOUT_MS || 20000)

export function isLocalDocumentStoreConfigured(): boolean {
    return Boolean(GX10_API_URL && GX10_API_KEY)
}

export interface LocalSearchResult {
    content: string
    pageNumber: number | null
    chunkIndex: number
    documentId: string
    documentName: string
    /** Top-level folder the document was dropped under (job/project name); '' for loose files. */
    project: string
    /** Folder path within the project, e.g. "ONTC Station/drawings". */
    folderPath: string
    similarity: number
}

export interface LocalDocumentMeta {
    id: string
    name: string
    contentType: string | null
    sizeBytes: number
    status: string
    chunkCount: number
    error: string | null
    createdAt: string | null
    project: string
    folderPath: string
}

export interface LocalTreeFolder {
    path: string
    files: LocalDocumentMeta[]
}

export interface LocalTreeProject {
    name: string
    fileCount: number
    folders: LocalTreeFolder[]
}

async function gx10Fetch(path: string, init?: RequestInit): Promise<globalThis.Response> {
    if (!isLocalDocumentStoreConfigured()) {
        throw new Error('Local document store is not configured (set GX10_API_URL and GX10_API_KEY).')
    }
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
    try {
        return await fetch(`${GX10_API_URL}${path}`, {
            ...init,
            headers: {
                'X-API-Key': GX10_API_KEY,
                ...(init?.headers ?? {}),
            },
            signal: controller.signal,
        })
    } finally {
        clearTimeout(timer)
    }
}

/** Semantic search over the local (on-prem) document store. Optional project filter (partial match). */
export async function searchLocalDocuments(query: string, limit = 5, project?: string): Promise<LocalSearchResult[]> {
    const res = await gx10Fetch('/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            query,
            limit: Math.min(Math.max(limit, 1), 10),
            project: project?.trim() || undefined,
        }),
    })
    if (!res.ok) {
        const text = await res.text().catch(() => '')
        throw new Error(`Local document search failed: ${res.status} ${text.slice(0, 200)}`)
    }
    const data = (await res.json()) as { results: LocalSearchResult[] }
    return data.results ?? []
}

export interface LocalDocumentFile {
    buffer: Buffer
    contentType: string
    fileName: string
}

/** Fetch the raw bytes of a local document for preview/download (proxied to the frontend). */
export async function getLocalDocumentFile(documentId: string): Promise<LocalDocumentFile | null> {
    const res = await gx10Fetch(`/documents/${encodeURIComponent(documentId)}/file`)
    if (res.status === 404 || res.status === 410) return null
    if (!res.ok) {
        throw new Error(`Local document fetch failed: ${res.status}`)
    }
    const disposition = res.headers.get('content-disposition') || ''
    const nameMatch = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(disposition)
    return {
        buffer: Buffer.from(await res.arrayBuffer()),
        contentType: res.headers.get('content-type') || 'application/octet-stream',
        fileName: nameMatch ? decodeURIComponent(nameMatch[1]) : 'document',
    }
}

export async function listLocalDocuments(project?: string): Promise<LocalDocumentMeta[]> {
    const qs = project?.trim() ? `?project=${encodeURIComponent(project.trim())}` : ''
    const res = await gx10Fetch(`/documents${qs}`)
    if (!res.ok) {
        const text = await res.text().catch(() => '')
        throw new Error(`Local document list failed: ${res.status} ${text.slice(0, 200)}`)
    }
    const data = (await res.json()) as { documents: LocalDocumentMeta[] }
    return data.documents ?? []
}

export async function getLocalDocumentTree(project?: string): Promise<LocalTreeProject[]> {
    const qs = project?.trim() ? `?project=${encodeURIComponent(project.trim())}` : ''
    const res = await gx10Fetch(`/tree${qs}`)
    if (!res.ok) {
        const text = await res.text().catch(() => '')
        throw new Error(`Local document tree failed: ${res.status} ${text.slice(0, 200)}`)
    }
    const data = (await res.json()) as { projects: LocalTreeProject[] }
    return data.projects ?? []
}

function normalizeMatchKey(s: string): string {
    return s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

function namesOverlap(a: string, b: string): boolean {
    const na = normalizeMatchKey(a)
    const nb = normalizeMatchKey(b)
    if (!na || !nb) return false
    if (na === nb) return true
    if (na.includes(nb) || nb.includes(na)) return true
    const wa = new Set(na.split(' ').filter((w) => w.length > 2))
    const wb = nb.split(' ').filter((w) => w.length > 2)
    if (wa.size === 0 || wb.length === 0) return false
    const hits = wb.filter((w) => wa.has(w)).length
    return hits >= Math.min(2, wb.length)
}

export interface MatchedLocalProject {
    gx10Project: string
    fileCount: number
    jobId: string | null
    jobTitle: string | null
    siteName: string | null
    jobStatus: string | null
    linked: boolean
}

/**
 * Map GX10 project folder names onto Maxim jobs (title or site name).
 * Unmatched projects are returned with linked: false for the Local Archive (Unlinked) page.
 */
export async function matchLocalProjectsToJobs(): Promise<MatchedLocalProject[]> {
    const tree = await getLocalDocumentTree()
    const jobs = await prisma.job.findMany({
        select: {
            id: true,
            title: true,
            status: true,
            site: { select: { name: true } },
        },
    })

    return tree
        .filter((p) => p.name && p.name !== '(loose files)')
        .map((p) => {
            const match = jobs.find(
                (j) => namesOverlap(p.name, j.title) || namesOverlap(p.name, j.site.name)
            )
            return {
                gx10Project: p.name,
                fileCount: p.fileCount,
                jobId: match?.id ?? null,
                jobTitle: match?.title ?? null,
                siteName: match?.site.name ?? null,
                jobStatus: match?.status ?? null,
                linked: Boolean(match),
            }
        })
}

/** GX10 projects that fuzzy-match a specific Maxim job. */
export async function getLocalProjectsForJob(jobId: string): Promise<LocalTreeProject[]> {
    const job = await prisma.job.findUnique({
        where: { id: jobId },
        select: { title: true, site: { select: { name: true } } },
    })
    if (!job) return []

    const tree = await getLocalDocumentTree()
    return tree.filter(
        (p) =>
            p.name !== '(loose files)' &&
            (namesOverlap(p.name, job.title) || namesOverlap(p.name, job.site.name))
    )
}

/** Delete one document from the GX10 archive (file + chunks). */
export async function deleteLocalDocument(documentId: string): Promise<{ deleted: boolean; name?: string }> {
    const res = await gx10Fetch(`/documents/${encodeURIComponent(documentId)}`, { method: 'DELETE' })
    if (res.status === 404) {
        throw Object.assign(new Error('Document not found in local archive.'), { status: 404 })
    }
    if (!res.ok) {
        const text = await res.text().catch(() => '')
        throw new Error(`Local document delete failed: ${res.status} ${text.slice(0, 200)}`)
    }
    return (await res.json()) as { deleted: boolean; name?: string }
}

/** Delete every document in a GX10 project (exact project name). */
export async function deleteLocalProject(projectName: string): Promise<{ deleted: boolean; documentsDeleted?: number }> {
    const name = projectName.trim()
    if (!name) throw new Error('Project name is required')
    // Query param avoids path encoding bugs with spaces / dashes in project names
    const res = await gx10Fetch(`/projects?name=${encodeURIComponent(name)}`, { method: 'DELETE' })
    if (res.status === 404) {
        throw Object.assign(new Error('Project not found in local archive.'), { status: 404 })
    }
    if (!res.ok) {
        const text = await res.text().catch(() => '')
        throw new Error(`Local project delete failed: ${res.status} ${text.slice(0, 200)}`)
    }
    return (await res.json()) as { deleted: boolean; documentsDeleted?: number }
}
