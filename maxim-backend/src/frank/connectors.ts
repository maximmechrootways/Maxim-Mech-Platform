/**
 * Frank connectors: execute a tool by name by calling existing backend services.
 * Never use raw Prisma here — only service layer.
 */

import type { FrankContext } from './types'
import * as userService from '../services/userService'
import * as certificateService from '../services/certificateService'
import * as jobService from '../services/jobService'
import * as siteService from '../services/siteService'
import * as pdfSubmissionService from '../services/pdfSubmissionService'
import * as signableSubmissionService from '../services/signableSubmissionService'
import * as submissionService from '../services/submissionService'
import * as incidentService from '../services/incidentService'
import * as injuryReportService from '../services/injuryReportService'
import * as nearMissService from '../services/nearMissService'
import * as hazardService from '../services/hazardService'
import * as safetyAlertService from '../services/safetyAlertService'
import * as observationService from '../services/observationService'
import * as inspectionService from '../services/inspectionService'
import * as capaService from '../services/capaService'
import * as complianceCalendarService from '../services/complianceCalendarService'
import * as hrTodoService from '../services/hrTodoService'
import * as subcontractorService from '../services/subcontractorService'
import * as libraryDocumentService from '../services/libraryDocumentService'
import * as documentIngestionService from '../services/documentIngestionService'
import * as localDocumentService from '../services/localDocumentService'
import * as pdfTemplateService from '../services/pdfTemplateService'
import * as auditLogService from '../services/auditLogService'
import * as notificationService from '../services/notificationService'
import * as googleCalendarService from '../services/googleCalendarService'

const EXPIRING_DAYS = 30
function certStatus(expirationDate: string): 'expired' | 'expiring' | 'current' {
    const today = new Date().toISOString().slice(0, 10)
    const in30 = new Date(Date.now() + EXPIRING_DAYS * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
    if (expirationDate < today) return 'expired'
    if (expirationDate <= in30) return 'expiring'
    return 'current'
}

function isOwnerOrHr(role: string) {
    return role === 'owner' || role === 'hr'
}

export async function executeTool(
    toolName: string,
    input: Record<string, unknown>,
    ctx: FrankContext
): Promise<unknown> {
    const { userId, userRole, userEmail: _ } = ctx

    try {
        switch (toolName) {
            case 'query_people': {
                if (!isOwnerOrHr(userRole)) return { error: 'Only Owner or HR can list employees.' }
                const list = await userService.listAllUsersForAdmin(userRole)
                let out = list as Array<Record<string, unknown>>
                const search = input.search as string | undefined
                if (search && search.trim()) {
                    const s = search.trim().toLowerCase()
                    out = out.filter(
                        (u) =>
                            String(u.name ?? '').toLowerCase().includes(s) ||
                            String(u.email ?? '').toLowerCase().includes(s)
                    )
                }
                if (input.role !== undefined) out = out.filter((u) => u.role === input.role)
                if (input.isActive !== undefined) out = out.filter((u) => u.isActive === input.isActive)
                return { people: out }
            }

            case 'query_certificates': {
                const list = await certificateService.listCertificates(userId, userRole)
                let out = list as Array<Record<string, unknown> & { expirationDate: string; holderName: string }>
                if (input.status) {
                    const want = input.status as string
                    out = out.filter((c) => certStatus(c.expirationDate) === want)
                }
                if (input.holderName) {
                    const s = String(input.holderName).toLowerCase()
                    out = out.filter((c) => c.holderName?.toLowerCase().includes(s))
                }
                return { certificates: out }
            }

            case 'query_jobs': {
                const status = input.status as string | undefined
                const siteId = input.siteId as string | undefined
                const list = await jobService.listJobs(userId, userRole, { status, siteId })
                return { jobs: list }
            }

            case 'query_sites': {
                const list = await siteService.listSites()
                return { sites: list }
            }

            case 'query_pdf_submissions': {
                const list = await pdfSubmissionService.listSubmissions(userId, userRole)
                return { submissions: list }
            }

            case 'query_signable_submissions': {
                const signableFormId = input.signableFormId as string | undefined
                const list = await signableSubmissionService.listSignableSubmissions(userId, userRole, {
                    signableFormId,
                })
                return { submissions: list }
            }

            case 'query_form_submissions': {
                const status = input.status as string | undefined
                const templateId = input.templateId as string | undefined
                const list = await submissionService.listFormSubmissions(userId, userRole, {
                    status,
                    templateId,
                })
                return { submissions: list }
            }

            case 'query_incidents': {
                const list = await incidentService.listIncidents(userRole, {
                    status: input.status as string | undefined,
                    siteId: input.siteId as string | undefined,
                })
                return { incidents: list }
            }

            case 'query_injury_reports': {
                const list = await injuryReportService.listInjuryReports(userId, userRole, {
                    status: input.status as string | undefined,
                    jobId: input.jobId as string | undefined,
                    subcontractorId: input.subcontractorId as string | undefined,
                })
                return { injuryReports: list }
            }

            case 'query_near_misses': {
                const list = await nearMissService.listNearMisses(userRole, {
                    status: input.status as string | undefined,
                    siteId: input.siteId as string | undefined,
                })
                return { nearMisses: list }
            }

            case 'query_hazards': {
                const list = await hazardService.listHazards(userRole, {
                    status: input.status as string | undefined,
                    siteId: input.siteId as string | undefined,
                })
                return { hazards: list }
            }

            case 'query_safety_alerts': {
                const activeOnly = input.activeOnly === true ? 'true' : undefined
                const list = await safetyAlertService.listAlerts(userRole, { activeOnly })
                return { safetyAlerts: list }
            }

            case 'query_observations': {
                const list = await observationService.listObservations(userRole, {
                    type: input.type as string | undefined,
                    siteId: input.siteId as string | undefined,
                })
                return { observations: list }
            }

            case 'query_inspection_schedules': {
                if (input.dueOnly) {
                    const asOf = (input.asOf as string) || new Date().toISOString().slice(0, 10)
                    const list = await inspectionService.listDue(userRole, asOf)
                    return { schedules: list }
                }
                const list = await inspectionService.listSchedules(userRole)
                return { schedules: list }
            }

            case 'query_inspection_results': {
                const list = await inspectionService.listResults(userRole, {
                    scheduleId: input.scheduleId as string | undefined,
                })
                return { results: list }
            }

            case 'query_capa': {
                const list = await capaService.listCAPA(userRole, {
                    status: input.status as string | undefined,
                    sourceType: input.sourceType as string | undefined,
                })
                return { capa: list }
            }

            case 'query_compliance_calendar': {
                if (input.dueOnly) {
                    const asOf = (input.asOf as string) || new Date().toISOString().slice(0, 10)
                    const list = await complianceCalendarService.listDue(userRole, asOf)
                    return { events: list }
                }
                const list = await complianceCalendarService.listEvents(userRole, {
                    from: input.from as string | undefined,
                    to: input.to as string | undefined,
                    type: input.type as string | undefined,
                })
                return { events: list }
            }

            case 'query_hr_todos': {
                const list = await hrTodoService.listTodo(userId, userRole, {
                    dueDate: input.dueDate as string | undefined,
                    completed: input.completed === true ? 'true' : input.completed === false ? 'false' : undefined,
                })
                return { todos: list }
            }

            case 'query_subcontractors': {
                const list = await subcontractorService.listSubcontractors(userId, userRole)
                return { subcontractors: list }
            }

            case 'query_form_templates': {
                const list = await pdfTemplateService.listTemplates(userId, userRole)
                let out = list as Array<Record<string, unknown> & { name?: string }>
                const search = input.search as string | undefined
                if (search && search.trim()) {
                    const s = search.trim().toLowerCase()
                    out = out.filter((t) => String(t.name ?? '').toLowerCase().includes(s))
                }
                return { templates: out }
            }

            case 'query_library_documents': {
                const list = await libraryDocumentService.listLibraryDocuments(userId, userRole)
                let out = list as Array<Record<string, unknown> & { name?: string; type?: string }>
                const search = input.search as string | undefined
                if (search && search.trim()) {
                    const s = search.trim().toLowerCase()
                    out = out.filter(
                        (d) =>
                            String(d.name ?? '').toLowerCase().includes(s) ||
                            String(d.type ?? '').toLowerCase().includes(s)
                    )
                }
                return { documents: out }
            }
            case 'read_document_content': {
                const documentId = String(input.documentId ?? '')
                if (!documentId) return { error: 'documentId is required.' }
                try {
                    const doc = await libraryDocumentService.getLibraryDocumentById(documentId, userId, userRole)
                    if (!doc) return { error: 'Document not found or you do not have access.' }
                    const text = (doc as { extractedText?: string | null }).extractedText
                    if (!text) {
                        return {
                            documentName: doc.name,
                            documentType: doc.type,
                            error: 'No extracted text available for this document. The text may not have been extracted yet.',
                        }
                    }
                    const truncated = text.length > 8000 ? text.substring(0, 8000) + '\n\n... [truncated, document continues]' : text
                    return {
                        documentName: doc.name,
                        documentType: doc.type,
                        contentLength: text.length,
                        content: truncated,
                    }
                } catch (err: unknown) {
                    const message = err instanceof Error ? err.message : 'Failed to read document.'
                    return { error: message }
                }
            }

            case 'search_documents': {
                const query = String(input.query ?? '').trim()
                if (!query) return { error: 'query is required.', found: false }
                try {
                    const results = await documentIngestionService.searchDocumentChunks({
                        query,
                        organisationId: undefined,
                        limit: typeof input.limit === 'number' ? Math.min(Math.max(input.limit, 1), 10) : 5,
                    })
                    if (results.length === 0) {
                        return { found: false, message: 'No relevant content found in uploaded documents.' }
                    }
                    return {
                        found: true,
                        source: 'cloud',
                        results: results.map((r) => ({
                            documentName: r.documentName,
                            relevanceScore: `${Math.round(r.similarity * 100)}%`,
                            content: r.content,
                            source: 'cloud',
                        })),
                    }
                } catch (err: unknown) {
                    const message = err instanceof Error ? err.message : 'Document search failed.'
                    return { error: message, found: false }
                }
            }

            case 'search_local_documents': {
                const query = String(input.query ?? '').trim()
                if (!query) return { error: 'query is required.', found: false }
                try {
                    const results = await localDocumentService.searchLocalDocuments(
                        query,
                        typeof input.limit === 'number' ? input.limit : 5,
                        typeof input.project === 'string' ? input.project : undefined
                    )
                    if (results.length === 0) {
                        return { found: false, source: 'local', message: 'No relevant content found in the local archive.' }
                    }
                    return {
                        found: true,
                        source: 'local',
                        results: results.map((r) => ({
                            documentName: r.documentName,
                            documentId: r.documentId,
                            project: r.project || undefined,
                            folderPath: r.folderPath || undefined,
                            pageNumber: r.pageNumber,
                            relevanceScore: `${Math.round(r.similarity * 100)}%`,
                            content: r.content,
                            source: 'local',
                            // Same-origin proxy path the frontend can open for preview/download
                            fileUrl: `/local-documents/${r.documentId}/file`,
                        })),
                    }
                } catch (err: unknown) {
                    const message = err instanceof Error ? err.message : 'Local archive search failed.'
                    return { error: message, found: false, source: 'local' }
                }
            }

            case 'query_audit_log': {
                if (!isOwnerOrHr(userRole)) return { error: 'Only Owner or HR can query the audit log.' }
                const result = await auditLogService.listAuditLogs({
                    entityType: input.entityType as string | undefined,
                    entityId: input.entityId as string | undefined,
                    userId: input.userId as string | undefined,
                    from: input.from as string | undefined,
                    to: input.to as string | undefined,
                    limit: typeof input.limit === 'number' ? Math.min(input.limit, 500) : 100,
                })
                return result
            }

            case 'query_notifications': {
                const list = await notificationService.listForUser(userId, {
                    unreadOnly: input.unreadOnly === true ? 'true' : undefined,
                    limit: typeof input.limit === 'number' ? Math.min(input.limit, 100) : 50,
                })
                return { notifications: list }
            }

            case 'create_hr_todo': {
                if (!isOwnerOrHr(userRole)) return { error: 'Only Owner or HR can create HR todos.' }
                const title = String(input.title ?? '').trim()
                const dueDate = String(input.dueDate ?? '').trim()
                if (!title || !dueDate) return { error: 'title and dueDate are required.' }
                const assigneeId = (input.assignToUserId as string)?.trim() || undefined
                if (assigneeId && assigneeId.includes('@')) {
                    return { error: 'assignToUserId must be the user UUID, NOT an email address. Use query_people to find their exact UUID.' }
                }

                const created = await hrTodoService.createTodo(userId, userRole, {
                    title,
                    dueDate,
                    recurrence: (input.recurrence as string) || 'daily',
                    dueTime: input.dueTime as string | undefined,
                    linkTo: input.linkTo as string | undefined,
                    assignToUserId: assigneeId,
                })

                // In-app bell only (no email). Dedupe if the agent retries the same tool call.
                const targetUserId = assigneeId || userId
                try {
                    await notificationService.createFrankHRTodoNotificationIfNotDuplicate({
                        userId: targetUserId,
                        body: `${title} — due ${dueDate}`,
                        linkTo: '/hr/todo',
                    })
                } catch { /* don't fail the todo creation if notification fails */ }

                return { created, message: 'HR todo created; assignee is notified in-app (no duplicate spam).' }
            }

            case 'update_capa_status': {
                const id = String(input.id ?? '')
                if (!id) return { error: 'CAPA id is required.' }
                const updated = await capaService.updateCAPA(id, userRole, {
                    status: input.status as string | undefined,
                    completedAt: input.completedAt as string | undefined,
                })
                return { updated, message: 'CAPA status updated.' }
            }

            case 'create_calendar_event': {
                if (!isOwnerOrHr(userRole)) return { error: 'Only Owner or HR can create calendar events.' }
                const summary = String(input.summary ?? '').trim()
                const date = String(input.date ?? '').trim()
                const startTime = String(input.startTime ?? '').trim()
                if (!summary || !date || !startTime) return { error: 'summary, date, and startTime are required.' }
                const endTime = input.endTime ? String(input.endTime).trim() : (() => {
                    const [h, m] = startTime.split(':').map(Number)
                    return `${String(h + 1).padStart(2, '0')}:${String(m).padStart(2, '0')}`
                })()
                const startDateTime = `${date}T${startTime}:00`
                const endDateTime = `${date}T${endTime}:00`
                try {
                    const event = await googleCalendarService.createEvent(userId, {
                        summary,
                        description: input.description as string | undefined,
                        startDateTime,
                        endDateTime,
                    })
                    return { event, message: `Calendar event "${summary}" created on ${date} from ${startTime} to ${endTime}.` }
                } catch (err: unknown) {
                    const e = err as { status?: number; message?: string }
                    if (e?.status === 400) return { error: 'Google Calendar is not connected. Please connect it first from the To-Do & Calendar page.' }
                    return { error: e?.message || 'Failed to create calendar event.' }
                }
            }

            case 'query_calendar_events': {
                if (!isOwnerOrHr(userRole)) return { error: 'Only Owner or HR can query calendar events.' }
                const today = new Date().toISOString().slice(0, 10)
                const fromDate = (input.from as string) || today
                const toDate = (input.to as string) || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
                try {
                    const events = await googleCalendarService.listEvents(
                        userId,
                        `${fromDate}T00:00:00Z`,
                        `${toDate}T23:59:59Z`
                    )
                    if (events.length === 0) return { events: [], message: `No events from ${fromDate} to ${toDate}.` }
                    return { events, count: events.length }
                } catch (err: unknown) {
                    const e = err as { status?: number; message?: string }
                    if (e?.status === 400) return { error: 'Google Calendar is not connected. Please connect it first from the To-Do & Calendar page.' }
                    return { error: e?.message || 'Failed to query calendar events.' }
                }
            }

            default:
                return { error: `Unknown tool: ${toolName}` }
        }
    } catch (err: unknown) {
        const e = err as { status?: number; message?: string }
        const message = e?.message ?? (err instanceof Error ? err.message : 'Tool execution failed')
        return { error: message }
    }
}
