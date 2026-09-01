import type { Tool } from '@anthropic-ai/sdk/resources/messages/messages'
import { isLocalDocumentStoreConfigured } from '../services/localDocumentService'

const SEARCH_LOCAL_DOCUMENTS_TOOL: Tool = {
    name: 'search_local_documents',
    description:
        'Search the on-premises local archive (USB / field project folders). Finds passages inside text PDFs and also matches by file name, folder path, and project — so scanned/image drawings with no readable PDF text can still be found when the user names the drawing (e.g. "electrical drawing", sheet numbers in the filename). Prefer exact terms the user said (drawing title, discipline, project). Use alongside search_documents for cloud library files.',
    input_schema: {
        type: 'object' as const,
        properties: {
            query: {
                type: 'string',
                description:
                    'Search query — use the exact terms the user mentioned (drawing names, electrical/mechanical, sheet numbers, project names)',
            },
            project: {
                type: 'string',
                description:
                    'Optional project name to restrict the search (partial match, e.g. "Dehumidification"). Use when the user names a job.',
            },
            limit: {
                type: 'number',
                description: 'Number of results to return (default 5, max 10)',
            },
        },
        required: ['query'],
    },
}

const TOOLS: Tool[] = [
    {
        name: 'query_people',
        description: 'Search or list employees (users). Use for questions about who works here, who has a given role, or who is active. Only Owner and HR can list all employees; others have restricted visibility.',
        input_schema: {
            type: 'object' as const,
            properties: {
                search: { type: 'string', description: 'Optional name or email search (partial match)' },
                role: { type: 'string', description: 'Filter by role: owner, hr, supervisor, labourer' },
                isActive: { type: 'boolean', description: 'Filter by active status' },
            },
            required: [],
        },
    },
    {
        name: 'query_certificates',
        description: 'List certifications (e.g. Working at Heights, First Aid). Filter by expiry status or holder. Use for "who has expired certs", "who needs renewal", or "certificates for [name]". Owner/HR only.',
        input_schema: {
            type: 'object' as const,
            properties: {
                status: { type: 'string', enum: ['expired', 'expiring', 'current'], description: 'Expiry status: expired, expiring (within 30 days), or current' },
                holderName: { type: 'string', description: 'Filter by holder name (partial match)' },
            },
            required: [],
        },
    },
    {
        name: 'query_jobs',
        description: 'List jobs/sites. Filter by status or site. Role-scoped: labourers see assigned jobs, supervisors see jobs they supervise, Owner/HR see all. Use for "jobs on North Site", "active jobs", or crew assignment context.',
        input_schema: {
            type: 'object' as const,
            properties: {
                status: { type: 'string', description: 'Filter by job status: active, completed, on-hold' },
                siteId: { type: 'string', description: 'Filter by site ID' },
            },
            required: [],
        },
    },
    {
        name: 'query_sites',
        description: 'List all sites. Returns site id, name, and optional active job info. Use when the user asks about sites or locations.',
        input_schema: {
            type: 'object' as const,
            properties: {},
            required: [],
        },
    },
    {
        name: 'query_pdf_submissions',
        description: 'List PDF form submissions (templates filled and submitted). Role-scoped. Use for "who submitted the incident report", "submissions this month", or form completion questions.',
        input_schema: {
            type: 'object' as const,
            properties: {},
            required: [],
        },
    },
    {
        name: 'query_signable_submissions',
        description: 'List signable form submissions (e.g. daily forms, signed documents). Optional filter by form template. Role-scoped. Use for "who has signed", "pending sign-offs", or daily form status.',
        input_schema: {
            type: 'object' as const,
            properties: {
                signableFormId: { type: 'string', description: 'Optional template ID to filter by one form type' },
            },
            required: [],
        },
    },
    {
        name: 'query_form_submissions',
        description: 'List generic form submissions (workflow forms). Filter by status or template. Role-scoped. Use for hazard reports, inspections, or other form types.',
        input_schema: {
            type: 'object' as const,
            properties: {
                status: { type: 'string', description: 'Filter by status' },
                templateId: { type: 'string', description: 'Filter by template ID' },
            },
            required: [],
        },
    },
    {
        name: 'query_incidents',
        description: 'List incident reports. Filter by status or site. Use for "incidents on North Site", "open incidents", or safety event summaries. Owner/HR/Supervisor only.',
        input_schema: {
            type: 'object' as const,
            properties: {
                status: { type: 'string', description: 'Filter by status (e.g. open, closed)' },
                siteId: { type: 'string', description: 'Filter by site ID' },
            },
            required: [],
        },
    },
    {
        name: 'query_injury_reports',
        description: 'List injury reports. Filter by status, job, or subcontractor. Use for "open injury reports", "injuries on job X", or severity summaries. Owner/HR/Supervisor only.',
        input_schema: {
            type: 'object' as const,
            properties: {
                status: { type: 'string', description: 'Filter by status' },
                jobId: { type: 'string', description: 'Filter by job ID' },
                subcontractorId: { type: 'string', description: 'Filter by subcontractor ID' },
            },
            required: [],
        },
    },
    {
        name: 'query_near_misses',
        description: 'List near-miss reports. Filter by status or site. Use for "near misses this month" or by site. Owner/HR/Supervisor only.',
        input_schema: {
            type: 'object' as const,
            properties: {
                status: { type: 'string', description: 'Filter by status' },
                siteId: { type: 'string', description: 'Filter by site ID' },
            },
            required: [],
        },
    },
    {
        name: 'query_hazards',
        description: 'List hazard reports. Filter by status or site. Use for "open hazards", "hazards on North Site", or risk level. Owner/HR/Supervisor only.',
        input_schema: {
            type: 'object' as const,
            properties: {
                status: { type: 'string', description: 'Filter by status (e.g. open, closed)' },
                siteId: { type: 'string', description: 'Filter by site ID' },
            },
            required: [],
        },
    },
    {
        name: 'query_safety_alerts',
        description: 'List safety alerts (broadcasts). Optional active-only. Use for "active safety alerts" or "what alerts are out".',
        input_schema: {
            type: 'object' as const,
            properties: {
                activeOnly: { type: 'boolean', description: 'If true, only return non-expired alerts' },
            },
            required: [],
        },
    },
    {
        name: 'query_observations',
        description: 'List safety observations (positive or corrective). Filter by type or site. Owner/HR/Supervisor only.',
        input_schema: {
            type: 'object' as const,
            properties: {
                type: { type: 'string', enum: ['positive', 'corrective'], description: 'Filter by observation type' },
                siteId: { type: 'string', description: 'Filter by site ID' },
            },
            required: [],
        },
    },
    {
        name: 'query_inspection_schedules',
        description: 'List inspection schedules or due inspections. Use for "what inspections are due", "upcoming inspections", or schedule list. Optional asOf date for due items.',
        input_schema: {
            type: 'object' as const,
            properties: {
                dueOnly: { type: 'boolean', description: 'If true, return only schedules that are due on or before asOf (default today)' },
                asOf: { type: 'string', description: 'Date (YYYY-MM-DD) for due calculation; default today' },
            },
            required: [],
        },
    },
    {
        name: 'query_inspection_results',
        description: 'List completed inspection results. Optional filter by schedule. Use for "inspections completed last week", "results for schedule X", or pass/fail summary.',
        input_schema: {
            type: 'object' as const,
            properties: {
                scheduleId: { type: 'string', description: 'Filter by inspection schedule ID' },
            },
            required: [],
        },
    },
    {
        name: 'query_capa',
        description: 'List corrective/preventive action items (CAPA). Filter by status or source type. Use for "overdue CAPA", "open actions", or by source. Owner/HR/Supervisor only.',
        input_schema: {
            type: 'object' as const,
            properties: {
                status: { type: 'string', description: 'Filter by status (e.g. open, completed)' },
                sourceType: { type: 'string', description: 'Filter by source type (e.g. incident, hazard)' },
            },
            required: [],
        },
    },
    {
        name: 'query_compliance_calendar',
        description: 'List compliance calendar events (deadlines, tasks). Filter by date range or type. Use for "what is due this month", "compliance deadlines", or listDue.',
        input_schema: {
            type: 'object' as const,
            properties: {
                from: { type: 'string', description: 'Start date YYYY-MM-DD' },
                to: { type: 'string', description: 'End date YYYY-MM-DD' },
                type: { type: 'string', description: 'Filter by event type' },
                dueOnly: { type: 'boolean', description: 'If true, return only upcoming due events from asOf' },
                asOf: { type: 'string', description: 'Date for dueOnly; default today' },
            },
            required: [],
        },
    },
    {
        name: 'query_hr_todos',
        description: 'List the current user\'s HR todo items. Filter by due date or completed. Use for "my todos", "what is due today", or reminder lists. Owner/HR only.',
        input_schema: {
            type: 'object' as const,
            properties: {
                dueDate: { type: 'string', description: 'Filter by due date YYYY-MM-DD' },
                completed: { type: 'boolean', description: 'Filter by completed (true/false)' },
            },
            required: [],
        },
    },
    {
        name: 'query_subcontractors',
        description: 'List subcontractors (companies). Use for "which subcontractors", "subcontractor contact", or insurance expiry. Owner/HR only.',
        input_schema: {
            type: 'object' as const,
            properties: {},
            required: [],
        },
    },
    {
        name: 'query_form_templates',
        description: 'List form templates (PDFs with fillable fields) from Forms & documents. These are the forms that users fill and submit (e.g. incident report, inspection checklist). Use when the user asks about "a form I uploaded", "templates", or "forms in the library". Role-scoped: users see templates assigned to them; Owner/HR see all.',
        input_schema: {
            type: 'object' as const,
            properties: {
                search: { type: 'string', description: 'Optional name search to find a template by partial name' },
            },
            required: [],
        },
    },
    {
        name: 'query_library_documents',
        description: 'List documents from Forms & documents (view-only PDFs: policies, manuals, uploaded documents). Use when the user asks about "a document I uploaded", "library documents", "Forms & documents", "safety manual", or "policy PDF". Visibility is role-based.',
        input_schema: {
            type: 'object' as const,
            properties: {
                search: { type: 'string', description: 'Optional name or type search to find a document by partial name or type' },
            },
            required: [],
        },
    },
    {
        name: 'read_document_content',
        description: 'Read the extracted text content of a specific library document by its ID. Call query_library_documents first to get the document ID, then call this tool to read its content. Use for questions like "what does the MSDS say about X" or "summarize the safety manual".',
        input_schema: {
            type: 'object' as const,
            properties: {
                documentId: { type: 'string', description: 'The library document ID (from query_library_documents results)' },
            },
            required: ['documentId'],
        },
    },
    {
        name: 'search_documents',
        description: 'Semantic search across the full text of all ingested documents (SDS books, manuals, policies). Use when the user asks about a specific chemical, substance, hazard, procedure, or topic that might be inside a document — even if they do not know which document. Returns the most relevant passages with source document name. Use this before read_document_content for content questions.',
        input_schema: {
            type: 'object' as const,
            properties: {
                query: {
                    type: 'string',
                    description: 'Search query — use the exact terms the user mentioned (chemical names, procedures, topics)',
                },
                limit: {
                    type: 'number',
                    description: 'Number of passages to return (default 5, max 10)',
                },
            },
            required: ['query'],
        },
    },
    {
        name: 'query_audit_log',
        description: 'Query the audit log by entity type, entity ID, user, or date range. Use for "who changed X", "recent changes", or activity history. Owner/HR only.',
        input_schema: {
            type: 'object' as const,
            properties: {
                entityType: { type: 'string', description: 'Filter by entity type (e.g. incident, user)' },
                entityId: { type: 'string', description: 'Filter by entity ID' },
                userId: { type: 'string', description: 'Filter by user who performed the action' },
                from: { type: 'string', description: 'Start date (ISO or YYYY-MM-DD)' },
                to: { type: 'string', description: 'End date (ISO or YYYY-MM-DD)' },
                limit: { type: 'number', description: 'Max items (default 100, max 500)' },
            },
            required: [],
        },
    },
    {
        name: 'query_notifications',
        description: 'List the current user\'s notifications. Optional unread only. Use for "my notifications" or "unread alerts".',
        input_schema: {
            type: 'object' as const,
            properties: {
                unreadOnly: { type: 'boolean', description: 'If true, only unread notifications' },
                limit: { type: 'number', description: 'Max items (default 50, max 100)' },
            },
            required: [],
        },
    },
    {
        name: 'create_hr_todo',
        description: 'Create an HR todo/reminder. Can assign to the current user or to another person (assignToUserId). Use when the user wants to create a reminder for themselves or assign a reminder to someone else. Owner/HR only. Requires confirmation before calling.',
        input_schema: {
            type: 'object' as const,
            properties: {
                title: { type: 'string', description: 'Todo/reminder title' },
                dueDate: { type: 'string', description: 'Due date YYYY-MM-DD' },
                recurrence: { type: 'string', description: 'Recurrence e.g. daily, weekly; default daily' },
                dueTime: { type: 'string', description: 'Optional time' },
                linkTo: { type: 'string', description: 'Optional link URL' },
                assignToUserId: { type: 'string', description: 'User ID to assign the reminder to (leave empty for current user). Use query_people to find their exact UUID. NEVER use an email address.' },
            },
            required: ['title', 'dueDate'],
        },
    },
    {
        name: 'update_capa_status',
        description: 'Update a CAPA item\'s status or completed date. Use only after the user has explicitly confirmed. Owner/HR/Supervisor only.',
        input_schema: {
            type: 'object' as const,
            properties: {
                id: { type: 'string', description: 'CAPA item ID' },
                status: { type: 'string', description: 'New status (e.g. open, completed)' },
                completedAt: { type: 'string', description: 'Optional ISO date when completed' },
            },
            required: ['id'],
        },
    },
    {
        name: 'create_calendar_event',
        description: 'Create a new event on the user\'s connected Google Calendar. Use when the user asks to schedule a meeting, reminder, or calendar event. Requires the user\'s calendar to be connected. Ask for confirmation before calling. Owner/HR only.',
        input_schema: {
            type: 'object' as const,
            properties: {
                summary: { type: 'string', description: 'Event title (e.g. "Team Standup", "Safety Meeting")' },
                description: { type: 'string', description: 'Optional event description or notes' },
                date: { type: 'string', description: 'Event date in YYYY-MM-DD format' },
                startTime: { type: 'string', description: 'Start time in HH:mm format (24h), e.g. "09:00", "14:30"' },
                endTime: { type: 'string', description: 'End time in HH:mm format (24h), e.g. "10:00", "15:30". If not provided, defaults to 1 hour after start.' },
            },
            required: ['summary', 'date', 'startTime'],
        },
    },
    {
        name: 'query_calendar_events',
        description: 'List events from the user\'s connected Google Calendar for a date range. Use for "what\'s on my calendar today", "events this week", or similar. Requires the user\'s calendar to be connected. Owner/HR only.',
        input_schema: {
            type: 'object' as const,
            properties: {
                from: { type: 'string', description: 'Start date YYYY-MM-DD (default: today)' },
                to: { type: 'string', description: 'End date YYYY-MM-DD (default: 7 days from now)' },
            },
            required: [],
        },
    },
]

export function getFrankTools(): Tool[] {
    if (isLocalDocumentStoreConfigured()) {
        return [...TOOLS, SEARCH_LOCAL_DOCUMENTS_TOOL]
    }
    return TOOLS
}
