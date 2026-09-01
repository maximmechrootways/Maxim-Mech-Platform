/**
 * Autodesk Platform Services (APS) — high-quality CAD viewing (DWG/DXF/RVT/…).
 *
 * Flow: download source bytes → upload to APS OSS → Model Derivative SVF2 → Viewer URN.
 * Requires APS_CLIENT_ID + APS_CLIENT_SECRET in the environment.
 */

import crypto from 'crypto'
import { prisma } from '../lib/prisma'

const APS_BASE = 'https://developer.api.autodesk.com'
const AUTH_URL = `${APS_BASE}/authentication/v2/token`
const OSS_BASE = `${APS_BASE}/oss/v2`
const MD_BASE = `${APS_BASE}/modelderivative/v2`

const CLIENT_ID = process.env.APS_CLIENT_ID || ''
const CLIENT_SECRET = process.env.APS_CLIENT_SECRET || ''
const BUCKET_KEY =
    process.env.APS_BUCKET_KEY ||
    `maximcad${(CLIENT_ID || 'local').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 20)}`

export const CAD_EXTENSIONS = new Set([
    '.dwg', '.dxf', '.dwf', '.dwfx',
    '.rvt', '.rfa', '.rte',
    '.nwd', '.nwc',
    '.ifc',
    '.step', '.stp', '.iges', '.igs',
    '.f3d', '.fbx', '.obj', '.stl',
])

export function isCadFileName(fileName: string): boolean {
    const i = fileName.lastIndexOf('.')
    if (i < 0) return false
    return CAD_EXTENSIONS.has(fileName.slice(i).toLowerCase())
}

export function isApsConfigured(): boolean {
    return Boolean(CLIENT_ID && CLIENT_SECRET)
}

type TokenCache = { token: string; expiresAt: number }
let tokenCache: TokenCache | null = null

async function getAccessToken(scopes: string): Promise<string> {
    if (!isApsConfigured()) {
        throw new Error('APS is not configured. Set APS_CLIENT_ID and APS_CLIENT_SECRET.')
    }
    if (tokenCache && tokenCache.expiresAt > Date.now() + 60_000) {
        return tokenCache.token
    }
    const basic = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64')
    const res = await fetch(AUTH_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            Accept: 'application/json',
            Authorization: `Basic ${basic}`,
        },
        body: new URLSearchParams({
            grant_type: 'client_credentials',
            scope: scopes,
        }),
    })
    if (!res.ok) {
        throw new Error(`APS auth failed: ${res.status} ${await res.text()}`)
    }
    const data = (await res.json()) as { access_token: string; expires_in: number }
    tokenCache = {
        token: data.access_token,
        expiresAt: Date.now() + data.expires_in * 1000,
    }
    return data.access_token
}

/** Short-lived token for the browser Viewer (viewables:read only). */
export async function getViewerToken(): Promise<{ access_token: string; expires_in: number }> {
    const basic = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64')
    const res = await fetch(AUTH_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            Accept: 'application/json',
            Authorization: `Basic ${basic}`,
        },
        body: new URLSearchParams({
            grant_type: 'client_credentials',
            scope: 'viewables:read',
        }),
    })
    if (!res.ok) {
        throw new Error(`APS viewer token failed: ${res.status} ${await res.text()}`)
    }
    return (await res.json()) as { access_token: string; expires_in: number }
}

function toUrn(objectId: string): string {
    return Buffer.from(objectId).toString('base64').replace(/=+$/g, '').replace(/\+/g, '-').replace(/\//g, '_')
}

async function ensureBucket(token: string): Promise<void> {
    const res = await fetch(`${OSS_BASE}/buckets`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            bucketKey: BUCKET_KEY,
            policyKey: 'persistent',
        }),
    })
    if (res.status === 409 || res.ok) return
    // Already exists under another app? try GET
    const get = await fetch(`${OSS_BASE}/buckets/${BUCKET_KEY}/details`, {
        headers: { Authorization: `Bearer ${token}` },
    })
    if (get.ok) return
    throw new Error(`APS bucket create failed: ${res.status} ${await res.text()}`)
}

async function uploadObject(token: string, objectKey: string, buffer: Buffer, contentType: string): Promise<string> {
    await ensureBucket(token)
    const res = await fetch(`${OSS_BASE}/buckets/${encodeURIComponent(BUCKET_KEY)}/objects/${encodeURIComponent(objectKey)}`, {
        method: 'PUT',
        headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': contentType || 'application/octet-stream',
            'Content-Length': String(buffer.length),
        },
        body: new Uint8Array(buffer),
    })
    if (!res.ok) {
        throw new Error(`APS upload failed: ${res.status} ${await res.text()}`)
    }
    const data = (await res.json()) as { objectId: string }
    return data.objectId
}

async function startTranslation(token: string, urn: string): Promise<void> {
    const res = await fetch(`${MD_BASE}/designdata/job`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
            'x-ads-force': 'true',
        },
        body: JSON.stringify({
            input: { urn },
            output: {
                formats: [
                    {
                        type: 'svf2',
                        views: ['2d', '3d'],
                    },
                ],
            },
        }),
    })
    if (!res.ok && res.status !== 200) {
        const text = await res.text()
        // 409 often means already translating / done
        if (res.status !== 409) {
            throw new Error(`APS translate failed: ${res.status} ${text}`)
        }
    }
}

async function getManifest(token: string, urn: string): Promise<{ status: string; progress: string; messages?: unknown }> {
    const res = await fetch(`${MD_BASE}/designdata/${encodeURIComponent(urn)}/manifest`, {
        headers: { Authorization: `Bearer ${token}` },
    })
    if (res.status === 404) {
        return { status: 'pending', progress: '0%' }
    }
    if (!res.ok) {
        throw new Error(`APS manifest failed: ${res.status} ${await res.text()}`)
    }
    return (await res.json()) as { status: string; progress: string; messages?: unknown }
}

export interface CadViewerStatus {
    configured: boolean
    sourceKey: string
    fileName: string
    status: string
    progress?: string | null
    urn?: string | null
    error?: string | null
}

export async function getCadDerivativeStatus(sourceKey: string): Promise<CadViewerStatus | null> {
    const row = await prisma.cadDerivative.findUnique({ where: { sourceKey } })
    if (!row) return null
    return {
        configured: isApsConfigured(),
        sourceKey: row.sourceKey,
        fileName: row.fileName,
        status: row.status,
        progress: row.progress,
        urn: row.urn,
        error: row.error,
    }
}

/**
 * Ensure a CAD file is translated for the Viewer. Idempotent — reuses cache by sourceKey + sha.
 */
export async function prepareCadDerivative(params: {
    sourceKey: string
    fileName: string
    buffer: Buffer
    contentType?: string
}): Promise<CadViewerStatus> {
    if (!isApsConfigured()) {
        return {
            configured: false,
            sourceKey: params.sourceKey,
            fileName: params.fileName,
            status: 'failed',
            error: 'APS is not configured (set APS_CLIENT_ID and APS_CLIENT_SECRET).',
        }
    }

    const sha = crypto.createHash('sha256').update(params.buffer).digest('hex')
    const existing = await prisma.cadDerivative.findUnique({ where: { sourceKey: params.sourceKey } })

    if (existing?.status === 'success' && existing.urn && existing.contentSha256 === sha) {
        return {
            configured: true,
            sourceKey: existing.sourceKey,
            fileName: existing.fileName,
            status: 'success',
            progress: 'complete',
            urn: existing.urn,
        }
    }

    if (existing?.status === 'translating' && existing.urn && existing.contentSha256 === sha) {
        const token = await getAccessToken('data:read')
        const manifest = await getManifest(token, existing.urn)
        if (manifest.status === 'success') {
            const updated = await prisma.cadDerivative.update({
                where: { sourceKey: params.sourceKey },
                data: { status: 'success', progress: 'complete', error: null },
            })
            return {
                configured: true,
                sourceKey: updated.sourceKey,
                fileName: updated.fileName,
                status: 'success',
                progress: 'complete',
                urn: updated.urn,
            }
        }
        if (manifest.status === 'failed') {
            const updated = await prisma.cadDerivative.update({
                where: { sourceKey: params.sourceKey },
                data: { status: 'failed', error: 'APS translation failed', progress: manifest.progress },
            })
            return {
                configured: true,
                sourceKey: updated.sourceKey,
                fileName: updated.fileName,
                status: 'failed',
                progress: updated.progress,
                error: updated.error,
            }
        }
        await prisma.cadDerivative.update({
            where: { sourceKey: params.sourceKey },
            data: { progress: manifest.progress, status: 'translating' },
        })
        return {
            configured: true,
            sourceKey: existing.sourceKey,
            fileName: existing.fileName,
            status: 'translating',
            progress: manifest.progress,
            urn: existing.urn,
        }
    }

    const objectKey = `${params.sourceKey.replace(/[^a-zA-Z0-9._-]/g, '_')}_${sha.slice(0, 12)}_${params.fileName}`
        .slice(0, 200)

    await prisma.cadDerivative.upsert({
        where: { sourceKey: params.sourceKey },
        create: {
            sourceKey: params.sourceKey,
            fileName: params.fileName,
            contentSha256: sha,
            objectKey,
            status: 'uploading',
        },
        update: {
            fileName: params.fileName,
            contentSha256: sha,
            objectKey,
            status: 'uploading',
            error: null,
            urn: null,
            progress: 'uploading',
        },
    })

    try {
        const token = await getAccessToken('data:read data:write data:create bucket:create bucket:read')
        const objectId = await uploadObject(token, objectKey, params.buffer, params.contentType || 'application/octet-stream')
        const urn = toUrn(objectId)
        await prisma.cadDerivative.update({
            where: { sourceKey: params.sourceKey },
            data: { urn, status: 'translating', progress: '0%' },
        })
        await startTranslation(token, urn)
        return {
            configured: true,
            sourceKey: params.sourceKey,
            fileName: params.fileName,
            status: 'translating',
            progress: '0%',
            urn,
        }
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'CAD prepare failed'
        await prisma.cadDerivative.update({
            where: { sourceKey: params.sourceKey },
            data: { status: 'failed', error: message.slice(0, 2000) },
        })
        return {
            configured: true,
            sourceKey: params.sourceKey,
            fileName: params.fileName,
            status: 'failed',
            error: message,
        }
    }
}

/** Poll translation progress for an existing derivative. */
export async function refreshCadDerivative(sourceKey: string): Promise<CadViewerStatus | null> {
    const row = await prisma.cadDerivative.findUnique({ where: { sourceKey } })
    if (!row?.urn) return row ? await getCadDerivativeStatus(sourceKey) : null
    if (row.status === 'success') {
        return {
            configured: isApsConfigured(),
            sourceKey: row.sourceKey,
            fileName: row.fileName,
            status: 'success',
            progress: 'complete',
            urn: row.urn,
        }
    }
    if (!isApsConfigured()) {
        return {
            configured: false,
            sourceKey: row.sourceKey,
            fileName: row.fileName,
            status: 'failed',
            error: 'APS is not configured.',
        }
    }

    const token = await getAccessToken('data:read')
    const manifest = await getManifest(token, row.urn)
    if (manifest.status === 'success') {
        await prisma.cadDerivative.update({
            where: { sourceKey },
            data: { status: 'success', progress: 'complete', error: null },
        })
        return {
            configured: true,
            sourceKey: row.sourceKey,
            fileName: row.fileName,
            status: 'success',
            progress: 'complete',
            urn: row.urn,
        }
    }
    if (manifest.status === 'failed') {
        await prisma.cadDerivative.update({
            where: { sourceKey },
            data: { status: 'failed', progress: manifest.progress, error: 'APS translation failed' },
        })
        return {
            configured: true,
            sourceKey: row.sourceKey,
            fileName: row.fileName,
            status: 'failed',
            progress: manifest.progress,
            error: 'APS translation failed',
        }
    }
    await prisma.cadDerivative.update({
        where: { sourceKey },
        data: { status: 'translating', progress: manifest.progress },
    })
    return {
        configured: true,
        sourceKey: row.sourceKey,
        fileName: row.fileName,
        status: 'translating',
        progress: manifest.progress,
        urn: row.urn,
    }
}
