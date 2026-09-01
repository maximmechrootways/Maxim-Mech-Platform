"use strict";
/**
 * Frank connectors: execute a tool by name by calling existing backend services.
 * Never use raw Prisma here — only service layer.
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.executeTool = executeTool;
const userService = __importStar(require("../services/userService"));
const certificateService = __importStar(require("../services/certificateService"));
const jobService = __importStar(require("../services/jobService"));
const siteService = __importStar(require("../services/siteService"));
const pdfSubmissionService = __importStar(require("../services/pdfSubmissionService"));
const signableSubmissionService = __importStar(require("../services/signableSubmissionService"));
const submissionService = __importStar(require("../services/submissionService"));
const incidentService = __importStar(require("../services/incidentService"));
const injuryReportService = __importStar(require("../services/injuryReportService"));
const nearMissService = __importStar(require("../services/nearMissService"));
const hazardService = __importStar(require("../services/hazardService"));
const safetyAlertService = __importStar(require("../services/safetyAlertService"));
const observationService = __importStar(require("../services/observationService"));
const inspectionService = __importStar(require("../services/inspectionService"));
const capaService = __importStar(require("../services/capaService"));
const complianceCalendarService = __importStar(require("../services/complianceCalendarService"));
const hrTodoService = __importStar(require("../services/hrTodoService"));
const subcontractorService = __importStar(require("../services/subcontractorService"));
const libraryDocumentService = __importStar(require("../services/libraryDocumentService"));
const documentIngestionService = __importStar(require("../services/documentIngestionService"));
const pdfTemplateService = __importStar(require("../services/pdfTemplateService"));
const auditLogService = __importStar(require("../services/auditLogService"));
const notificationService = __importStar(require("../services/notificationService"));
const googleCalendarService = __importStar(require("../services/googleCalendarService"));
const EXPIRING_DAYS = 30;
function certStatus(expirationDate) {
    const today = new Date().toISOString().slice(0, 10);
    const in30 = new Date(Date.now() + EXPIRING_DAYS * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    if (expirationDate < today)
        return 'expired';
    if (expirationDate <= in30)
        return 'expiring';
    return 'current';
}
function isOwnerOrHr(role) {
    return role === 'owner' || role === 'hr';
}
async function executeTool(toolName, input, ctx) {
    const { userId, userRole, userEmail: _ } = ctx;
    try {
        switch (toolName) {
            case 'query_people': {
                if (!isOwnerOrHr(userRole))
                    return { error: 'Only Owner or HR can list employees.' };
                const list = await userService.listAllUsersForAdmin(userRole);
                let out = list;
                const search = input.search;
                if (search && search.trim()) {
                    const s = search.trim().toLowerCase();
                    out = out.filter((u) => String(u.name ?? '').toLowerCase().includes(s) ||
                        String(u.email ?? '').toLowerCase().includes(s));
                }
                if (input.role !== undefined)
                    out = out.filter((u) => u.role === input.role);
                if (input.isActive !== undefined)
                    out = out.filter((u) => u.isActive === input.isActive);
                return { people: out };
            }
            case 'query_certificates': {
                const list = await certificateService.listCertificates(userId, userRole);
                let out = list;
                if (input.status) {
                    const want = input.status;
                    out = out.filter((c) => certStatus(c.expirationDate) === want);
                }
                if (input.holderName) {
                    const s = String(input.holderName).toLowerCase();
                    out = out.filter((c) => c.holderName?.toLowerCase().includes(s));
                }
                return { certificates: out };
            }
            case 'query_jobs': {
                const status = input.status;
                const siteId = input.siteId;
                const list = await jobService.listJobs(userId, userRole, { status, siteId });
                return { jobs: list };
            }
            case 'query_sites': {
                const list = await siteService.listSites();
                return { sites: list };
            }
            case 'query_pdf_submissions': {
                const list = await pdfSubmissionService.listSubmissions(userId, userRole);
                return { submissions: list };
            }
            case 'query_signable_submissions': {
                const signableFormId = input.signableFormId;
                const list = await signableSubmissionService.listSignableSubmissions(userId, userRole, {
                    signableFormId,
                });
                return { submissions: list };
            }
            case 'query_form_submissions': {
                const status = input.status;
                const templateId = input.templateId;
                const list = await submissionService.listFormSubmissions(userId, userRole, {
                    status,
                    templateId,
                });
                return { submissions: list };
            }
            case 'query_incidents': {
                const list = await incidentService.listIncidents(userRole, {
                    status: input.status,
                    siteId: input.siteId,
                });
                return { incidents: list };
            }
            case 'query_injury_reports': {
                const list = await injuryReportService.listInjuryReports(userId, userRole, {
                    status: input.status,
                    jobId: input.jobId,
                    subcontractorId: input.subcontractorId,
                });
                return { injuryReports: list };
            }
            case 'query_near_misses': {
                const list = await nearMissService.listNearMisses(userRole, {
                    status: input.status,
                    siteId: input.siteId,
                });
                return { nearMisses: list };
            }
            case 'query_hazards': {
                const list = await hazardService.listHazards(userRole, {
                    status: input.status,
                    siteId: input.siteId,
                });
                return { hazards: list };
            }
            case 'query_safety_alerts': {
                const activeOnly = input.activeOnly === true ? 'true' : undefined;
                const list = await safetyAlertService.listAlerts(userRole, { activeOnly });
                return { safetyAlerts: list };
            }
            case 'query_observations': {
                const list = await observationService.listObservations(userRole, {
                    type: input.type,
                    siteId: input.siteId,
                });
                return { observations: list };
            }
            case 'query_inspection_schedules': {
                if (input.dueOnly) {
                    const asOf = input.asOf || new Date().toISOString().slice(0, 10);
                    const list = await inspectionService.listDue(userRole, asOf);
                    return { schedules: list };
                }
                const list = await inspectionService.listSchedules(userRole);
                return { schedules: list };
            }
            case 'query_inspection_results': {
                const list = await inspectionService.listResults(userRole, {
                    scheduleId: input.scheduleId,
                });
                return { results: list };
            }
            case 'query_capa': {
                const list = await capaService.listCAPA(userRole, {
                    status: input.status,
                    sourceType: input.sourceType,
                });
                return { capa: list };
            }
            case 'query_compliance_calendar': {
                if (input.dueOnly) {
                    const asOf = input.asOf || new Date().toISOString().slice(0, 10);
                    const list = await complianceCalendarService.listDue(userRole, asOf);
                    return { events: list };
                }
                const list = await complianceCalendarService.listEvents(userRole, {
                    from: input.from,
                    to: input.to,
                    type: input.type,
                });
                return { events: list };
            }
            case 'query_hr_todos': {
                const list = await hrTodoService.listTodo(userId, userRole, {
                    dueDate: input.dueDate,
                    completed: input.completed === true ? 'true' : input.completed === false ? 'false' : undefined,
                });
                return { todos: list };
            }
            case 'query_subcontractors': {
                const list = await subcontractorService.listSubcontractors(userId, userRole);
                return { subcontractors: list };
            }
            case 'query_form_templates': {
                const list = await pdfTemplateService.listTemplates(userId, userRole);
                let out = list;
                const search = input.search;
                if (search && search.trim()) {
                    const s = search.trim().toLowerCase();
                    out = out.filter((t) => String(t.name ?? '').toLowerCase().includes(s));
                }
                return { templates: out };
            }
            case 'query_library_documents': {
                const list = await libraryDocumentService.listLibraryDocuments(userId, userRole);
                let out = list;
                const search = input.search;
                if (search && search.trim()) {
                    const s = search.trim().toLowerCase();
                    out = out.filter((d) => String(d.name ?? '').toLowerCase().includes(s) ||
                        String(d.type ?? '').toLowerCase().includes(s));
                }
                return { documents: out };
            }
            case 'read_document_content': {
                const documentId = String(input.documentId ?? '');
                if (!documentId)
                    return { error: 'documentId is required.' };
                try {
                    const doc = await libraryDocumentService.getLibraryDocumentById(documentId, userId, userRole);
                    if (!doc)
                        return { error: 'Document not found or you do not have access.' };
                    const text = doc.extractedText;
                    if (!text) {
                        return {
                            documentName: doc.name,
                            documentType: doc.type,
                            error: 'No extracted text available for this document. The text may not have been extracted yet.',
                        };
                    }
                    const truncated = text.length > 8000 ? text.substring(0, 8000) + '\n\n... [truncated, document continues]' : text;
                    return {
                        documentName: doc.name,
                        documentType: doc.type,
                        contentLength: text.length,
                        content: truncated,
                    };
                }
                catch (err) {
                    const message = err instanceof Error ? err.message : 'Failed to read document.';
                    return { error: message };
                }
            }
            case 'search_documents': {
                const query = String(input.query ?? '').trim();
                if (!query)
                    return { error: 'query is required.', found: false };
                try {
                    const results = await documentIngestionService.searchDocumentChunks({
                        query,
                        organisationId: undefined,
                        limit: typeof input.limit === 'number' ? Math.min(Math.max(input.limit, 1), 10) : 5,
                    });
                    if (results.length === 0) {
                        return { found: false, message: 'No relevant content found in uploaded documents.' };
                    }
                    return {
                        found: true,
                        results: results.map((r) => ({
                            documentName: r.documentName,
                            relevanceScore: `${Math.round(r.similarity * 100)}%`,
                            content: r.content,
                        })),
                    };
                }
                catch (err) {
                    const message = err instanceof Error ? err.message : 'Document search failed.';
                    return { error: message, found: false };
                }
            }
            case 'query_audit_log': {
                if (!isOwnerOrHr(userRole))
                    return { error: 'Only Owner or HR can query the audit log.' };
                const result = await auditLogService.listAuditLogs({
                    entityType: input.entityType,
                    entityId: input.entityId,
                    userId: input.userId,
                    from: input.from,
                    to: input.to,
                    limit: typeof input.limit === 'number' ? Math.min(input.limit, 500) : 100,
                });
                return result;
            }
            case 'query_notifications': {
                const list = await notificationService.listForUser(userId, {
                    unreadOnly: input.unreadOnly === true ? 'true' : undefined,
                    limit: typeof input.limit === 'number' ? Math.min(input.limit, 100) : 50,
                });
                return { notifications: list };
            }
            case 'create_hr_todo': {
                if (!isOwnerOrHr(userRole))
                    return { error: 'Only Owner or HR can create HR todos.' };
                const title = String(input.title ?? '').trim();
                const dueDate = String(input.dueDate ?? '').trim();
                if (!title || !dueDate)
                    return { error: 'title and dueDate are required.' };
                const assigneeId = input.assignToUserId?.trim() || undefined;
                if (assigneeId && assigneeId.includes('@')) {
                    return { error: 'assignToUserId must be the user UUID, NOT an email address. Use query_people to find their exact UUID.' };
                }
                const created = await hrTodoService.createTodo(userId, userRole, {
                    title,
                    dueDate,
                    recurrence: input.recurrence || 'daily',
                    dueTime: input.dueTime,
                    linkTo: input.linkTo,
                    assignToUserId: assigneeId,
                });
                // In-app bell only (no email). Dedupe if the agent retries the same tool call.
                const targetUserId = assigneeId || userId;
                try {
                    await notificationService.createFrankHRTodoNotificationIfNotDuplicate({
                        userId: targetUserId,
                        body: `${title} — due ${dueDate}`,
                        linkTo: '/hr/todo',
                    });
                }
                catch { /* don't fail the todo creation if notification fails */ }
                return { created, message: 'HR todo created; assignee is notified in-app (no duplicate spam).' };
            }
            case 'update_capa_status': {
                const id = String(input.id ?? '');
                if (!id)
                    return { error: 'CAPA id is required.' };
                const updated = await capaService.updateCAPA(id, userRole, {
                    status: input.status,
                    completedAt: input.completedAt,
                });
                return { updated, message: 'CAPA status updated.' };
            }
            case 'create_calendar_event': {
                if (!isOwnerOrHr(userRole))
                    return { error: 'Only Owner or HR can create calendar events.' };
                const summary = String(input.summary ?? '').trim();
                const date = String(input.date ?? '').trim();
                const startTime = String(input.startTime ?? '').trim();
                if (!summary || !date || !startTime)
                    return { error: 'summary, date, and startTime are required.' };
                const endTime = input.endTime ? String(input.endTime).trim() : (() => {
                    const [h, m] = startTime.split(':').map(Number);
                    return `${String(h + 1).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
                })();
                const startDateTime = `${date}T${startTime}:00`;
                const endDateTime = `${date}T${endTime}:00`;
                try {
                    const event = await googleCalendarService.createEvent(userId, {
                        summary,
                        description: input.description,
                        startDateTime,
                        endDateTime,
                    });
                    return { event, message: `Calendar event "${summary}" created on ${date} from ${startTime} to ${endTime}.` };
                }
                catch (err) {
                    const e = err;
                    if (e?.status === 400)
                        return { error: 'Google Calendar is not connected. Please connect it first from the To-Do & Calendar page.' };
                    return { error: e?.message || 'Failed to create calendar event.' };
                }
            }
            case 'query_calendar_events': {
                if (!isOwnerOrHr(userRole))
                    return { error: 'Only Owner or HR can query calendar events.' };
                const today = new Date().toISOString().slice(0, 10);
                const fromDate = input.from || today;
                const toDate = input.to || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
                try {
                    const events = await googleCalendarService.listEvents(userId, `${fromDate}T00:00:00Z`, `${toDate}T23:59:59Z`);
                    if (events.length === 0)
                        return { events: [], message: `No events from ${fromDate} to ${toDate}.` };
                    return { events, count: events.length };
                }
                catch (err) {
                    const e = err;
                    if (e?.status === 400)
                        return { error: 'Google Calendar is not connected. Please connect it first from the To-Do & Calendar page.' };
                    return { error: e?.message || 'Failed to query calendar events.' };
                }
            }
            default:
                return { error: `Unknown tool: ${toolName}` };
        }
    }
    catch (err) {
        const e = err;
        const message = e?.message ?? (err instanceof Error ? err.message : 'Tool execution failed');
        return { error: message };
    }
}
