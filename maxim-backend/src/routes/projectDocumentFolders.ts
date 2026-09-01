import { Router } from 'express'
import { authenticate } from '../middleware/authenticate'
import {
    listProjectDocumentFolders,
    getProjectDocumentFolderPath,
    createProjectDocumentFolder,
    renameProjectDocumentFolder,
    deleteProjectDocumentFolder,
} from '../services/projectDocumentFolderService'

const router = Router({ mergeParams: true })

router.use(authenticate)

function jobIdFromReq(req: { params: Record<string, string | undefined> }) {
    return (req.params.id || req.params.jobId) as string
}

function parseParentId(raw: unknown): string | null {
    if (raw === undefined || raw === null || raw === '' || raw === 'root') return null
    return String(raw)
}

router.get('/', async (req, res, next) => {
    try {
        const jobId = jobIdFromReq(req)
        const parentId = parseParentId(req.query.parentId)
        const folders = await listProjectDocumentFolders(jobId, parentId)
        res.status(200).json(folders)
    } catch (e) {
        next(e)
    }
})

router.get('/:folderId/path', async (req, res, next) => {
    try {
        const jobId = jobIdFromReq(req)
        const path = await getProjectDocumentFolderPath(jobId, req.params.folderId)
        res.status(200).json(path)
    } catch (e) {
        next(e)
    }
})

router.post('/', async (req, res, next) => {
    try {
        const jobId = jobIdFromReq(req)
        const body = (req.body || {}) as { name?: string; parentId?: string | null }
        const folder = await createProjectDocumentFolder(req.user!.id, req.user!.role, jobId, {
            name: body.name || '',
            parentId: body.parentId ?? null,
        })
        res.status(201).json(folder)
    } catch (e) {
        next(e)
    }
})

router.patch('/:folderId', async (req, res, next) => {
    try {
        const jobId = jobIdFromReq(req)
        const body = (req.body || {}) as { name?: string }
        const folder = await renameProjectDocumentFolder(
            req.user!.id,
            req.user!.role,
            jobId,
            req.params.folderId,
            body.name || ''
        )
        res.status(200).json(folder)
    } catch (e) {
        next(e)
    }
})

router.delete('/:folderId', async (req, res, next) => {
    try {
        const jobId = jobIdFromReq(req)
        const result = await deleteProjectDocumentFolder(
            req.user!.id,
            req.user!.role,
            jobId,
            req.params.folderId
        )
        res.status(200).json(result)
    } catch (e) {
        next(e)
    }
})

export default router
