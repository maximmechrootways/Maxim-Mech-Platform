/**
 * High-quality CAD viewing via Autodesk Platform Services Viewer.
 * POST /cad-viewer/prepare  — upload/translate a local-archive (or other) CAD file
 * GET  /cad-viewer/status/:sourceKey — poll translation
 * GET  /cad-viewer/token — short-lived viewer access token
 */

import { Router, Request, Response } from 'express'
import { authenticate } from '../middleware/authenticate'
import {
    getCadDerivativeStatus,
    getViewerToken,
    isApsConfigured,
    isCadFileName,
    prepareCadDerivative,
    refreshCadDerivative,
} from '../services/apsCadViewerService'
import { getLocalDocumentFile, isLocalDocumentStoreConfigured } from '../services/localDocumentService'

const router = Router()
router.use(authenticate)

function ensureAccess(role: string) {
    return role === 'owner' || role === 'hr' || role === 'supervisor'
}

// GET /cad-viewer/config
router.get('/config', (req: Request, res: Response) => {
    if (!ensureAccess(req.user!.role)) return res.status(403).json({ error: 'Forbidden' })
    return res.json({ configured: isApsConfigured() })
})

// GET /cad-viewer/token
router.get('/token', async (req: Request, res: Response) => {
    if (!ensureAccess(req.user!.role)) return res.status(403).json({ error: 'Forbidden' })
    if (!isApsConfigured()) return res.status(503).json({ error: 'APS is not configured.' })
    try {
        const token = await getViewerToken()
        return res.json(token)
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Could not get viewer token'
        return res.status(502).json({ error: message })
    }
})

// GET /cad-viewer/status?sourceKey=local%3A<id>
router.get('/status', async (req: Request, res: Response) => {
    if (!ensureAccess(req.user!.role)) return res.status(403).json({ error: 'Forbidden' })
    const sourceKey = typeof req.query.sourceKey === 'string' ? req.query.sourceKey.trim() : ''
    if (!sourceKey) return res.status(400).json({ error: 'sourceKey is required' })
    try {
        const status = (await refreshCadDerivative(sourceKey)) || (await getCadDerivativeStatus(sourceKey))
        if (!status) return res.status(404).json({ error: 'Unknown CAD derivative' })
        return res.json(status)
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Status check failed'
        return res.status(502).json({ error: message })
    }
})

// POST /cad-viewer/prepare
// Body: { source: 'local', documentId: string }
router.post('/prepare', async (req: Request, res: Response) => {
    if (!ensureAccess(req.user!.role)) return res.status(403).json({ error: 'Forbidden' })
    if (!isApsConfigured()) {
        return res.status(503).json({
            error: 'High-quality CAD viewing requires Autodesk APS. Set APS_CLIENT_ID and APS_CLIENT_SECRET on the API.',
        })
    }

    const source = String((req.body as { source?: string })?.source || '')
    const documentId = String((req.body as { documentId?: string })?.documentId || '')

    try {
        if (source === 'local') {
            if (!isLocalDocumentStoreConfigured()) {
                return res.status(503).json({ error: 'Local document store is not configured.' })
            }
            if (!documentId) return res.status(400).json({ error: 'documentId is required' })
            const file = await getLocalDocumentFile(documentId)
            if (!file) return res.status(404).json({ error: 'Local document not found' })
            if (!isCadFileName(file.fileName)) {
                return res.status(400).json({ error: 'File type is not a supported CAD format for APS Viewer.' })
            }
            const status = await prepareCadDerivative({
                sourceKey: `local:${documentId}`,
                fileName: file.fileName,
                buffer: file.buffer,
                contentType: file.contentType,
            })
            return res.json(status)
        }

        return res.status(400).json({ error: 'Unsupported source. Use source: "local" with documentId.' })
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'CAD prepare failed'
        console.error('CAD prepare error:', message)
        return res.status(502).json({ error: message })
    }
})

export default router
