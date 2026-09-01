"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const helmet_1 = __importDefault(require("helmet"));
const dotenv_1 = __importDefault(require("dotenv"));
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const prisma_1 = require("./lib/prisma");
const pdfTemplateService_1 = require("./services/pdfTemplateService");
const legislativeComplianceEvaluationFields_1 = require("./seed/legislativeComplianceEvaluationFields");
const criticalTaskInventoryRiskRegisterFields_1 = require("./seed/criticalTaskInventoryRiskRegisterFields");
const confinedSpaceEntryPermitFields_1 = require("./seed/confinedSpaceEntryPermitFields");
const fallArrestInspectionChecklistFields_1 = require("./seed/fallArrestInspectionChecklistFields");
const washroomInspectionChecklistFields_1 = require("./seed/washroomInspectionChecklistFields");
const equipmentInspectionChecklistFields_1 = require("./seed/equipmentInspectionChecklistFields");
const pipelineSafetyFormsFields_1 = require("./seed/pipelineSafetyFormsFields");
const interim2PmChecklistFields_1 = require("./seed/interim2PmChecklistFields");
const auth_1 = __importDefault(require("./routes/auth"));
const pdfTemplates_1 = __importDefault(require("./routes/pdfTemplates"));
const pdfSubmissions_1 = __importDefault(require("./routes/pdfSubmissions"));
const toolboxTopics_1 = __importDefault(require("./routes/toolboxTopics"));
const documents_1 = __importDefault(require("./routes/documents"));
const jobs_1 = __importDefault(require("./routes/jobs"));
const sites_1 = __importDefault(require("./routes/sites"));
const subcontractors_1 = __importDefault(require("./routes/subcontractors"));
const offlineSubcontractorForms_1 = __importDefault(require("./routes/offlineSubcontractorForms"));
const equipment_1 = __importDefault(require("./routes/equipment"));
const users_1 = __importDefault(require("./routes/users"));
const templates_1 = __importDefault(require("./routes/templates"));
const submissions_1 = __importDefault(require("./routes/submissions"));
const signableSubmissions_1 = __importDefault(require("./routes/signableSubmissions"));
const dailyForms_1 = __importDefault(require("./routes/dailyForms"));
const dailyHazard_1 = __importDefault(require("./routes/dailyHazard"));
const dhaPresets_1 = __importDefault(require("./routes/dhaPresets"));
const libraryDocuments_1 = __importDefault(require("./routes/libraryDocuments"));
const library_1 = __importDefault(require("./routes/library"));
const signing_1 = __importDefault(require("./routes/signing"));
const injuryReports_1 = __importDefault(require("./routes/injuryReports"));
const certificates_1 = __importDefault(require("./routes/certificates"));
const incidents_1 = __importDefault(require("./routes/incidents"));
const nearMisses_1 = __importDefault(require("./routes/nearMisses"));
const hazards_1 = __importDefault(require("./routes/hazards"));
const observations_1 = __importDefault(require("./routes/observations"));
const capa_1 = __importDefault(require("./routes/capa"));
const safetyAlerts_1 = __importDefault(require("./routes/safetyAlerts"));
const inspections_1 = __importDefault(require("./routes/inspections"));
const complianceCalendar_1 = __importDefault(require("./routes/complianceCalendar"));
const auditLog_1 = __importDefault(require("./routes/auditLog"));
const qualityFindings_1 = __importDefault(require("./routes/qualityFindings"));
const hrTodo_1 = __importDefault(require("./routes/hrTodo"));
const googleCalendar_1 = __importDefault(require("./routes/googleCalendar"));
const notifications_1 = __importDefault(require("./routes/notifications"));
const composio_1 = __importDefault(require("./routes/composio"));
const composioWebhook_1 = __importDefault(require("./routes/composioWebhook"));
const composioInvoiceWebhook_1 = __importDefault(require("./routes/composioInvoiceWebhook"));
const incomingInvoices_1 = __importDefault(require("./routes/incomingInvoices"));
const outgoingInvoices_1 = __importDefault(require("./routes/outgoingInvoices"));
const formQrCodes_1 = __importDefault(require("./routes/formQrCodes"));
const qrResolve_1 = __importDefault(require("./routes/qrResolve"));
const permissions_1 = __importDefault(require("./routes/permissions"));
const invite_1 = __importDefault(require("./routes/invite"));
const employeeDocuments_1 = __importDefault(require("./routes/employeeDocuments"));
const estimationProjectFiles_1 = __importDefault(require("./routes/estimationProjectFiles"));
const inspectionAttachments_1 = __importDefault(require("./routes/inspectionAttachments"));
const frank_1 = __importDefault(require("./routes/frank"));
const formAssignments_1 = __importDefault(require("./routes/formAssignments"));
const hazardReview_1 = __importDefault(require("./routes/hazardReview"));
const productFeedback_1 = __importDefault(require("./routes/productFeedback"));
const timeOff_1 = __importDefault(require("./routes/timeOff"));
const employeeTimeTracking_1 = __importDefault(require("./routes/employeeTimeTracking"));
const admin_1 = __importDefault(require("./routes/admin"));
const errorHandler_1 = require("./middleware/errorHandler");
// Rate limiter disabled — mobile users on CGNAT share IPs and hit 429s.
// import { globalLimiter } from './middleware/rateLimiter'
const sanitizeInput_1 = require("./middleware/sanitizeInput");
const authenticate_1 = require("./middleware/authenticate");
const migrateFilesToBlob_1 = require("./utils/migrateFilesToBlob");
const backfillExtractedText_1 = require("./utils/backfillExtractedText");
const notificationEmailQueue_1 = require("./services/notificationEmailQueue");
const incomingInvoiceIngestionService_1 = require("./services/incomingInvoiceIngestionService");
const outgoingInvoiceIngestionService_1 = require("./services/outgoingInvoiceIngestionService");
const outgoingInvoiceReminderService_1 = require("./services/outgoingInvoiceReminderService");
const expiryNotificationService_1 = require("./services/expiryNotificationService");
const formsApprovalDigestService_1 = require("./services/formsApprovalDigestService");
const nicheBakeryReminderService_1 = require("./services/nicheBakeryReminderService");
dotenv_1.default.config();
const app = (0, express_1.default)();
app.set('trust proxy', 1);
app.use((0, helmet_1.default)({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
            fontSrc: ["'self'", 'https://fonts.gstatic.com'],
            imgSrc: ["'self'", 'data:', 'blob:'],
            connectSrc: ["'self'", 'https://maxim-mech-platform.vercel.app'],
            workerSrc: ["'self'", 'blob:'],
            objectSrc: ["'none'"],
            frameSrc: ["'self'", 'https://calendar.google.com'],
            frameAncestors: ["'none'"],
            upgradeInsecureRequests: [],
        },
    },
    hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
    noSniff: true,
    frameguard: { action: 'deny' },
    hidePoweredBy: true,
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
}));
const ALLOWED_ORIGINS = [
    'https://maxim-mech-platform.vercel.app',
    'https://maximmech.com',
    'https://www.maximmech.com',
    'http://localhost:5173',
    'http://localhost:5174',
    'http://localhost:4173',
];
if (process.env.STAGING_FRONTEND_URL) {
    ALLOWED_ORIGINS.push(process.env.STAGING_FRONTEND_URL);
}
for (const raw of (process.env.EXTRA_ALLOWED_ORIGINS || '').split(',')) {
    const o = raw.trim();
    if (o)
        ALLOWED_ORIGINS.push(o);
}
// credentials: true requires exact origin (no wildcard); required for cross-origin cookies
app.use((0, cors_1.default)({
    origin: (origin, callback) => {
        if (!origin)
            return callback(null, true);
        if (ALLOWED_ORIGINS.includes(origin)) {
            callback(null, true);
        }
        else {
            console.warn(`CORS blocked request from origin: ${origin}`);
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    exposedHeaders: ['X-Total-Count'],
    maxAge: 86400,
}));
app.use('/webhooks/composio', express_1.default.text({ type: '*/*' }), composioWebhook_1.default);
app.use('/webhooks/composio-invoice', express_1.default.text({ type: '*/*' }), composioInvoiceWebhook_1.default);
app.use(express_1.default.json({ limit: process.env.JSON_BODY_LIMIT || '20mb' }));
app.use(express_1.default.urlencoded({ extended: true, limit: process.env.JSON_BODY_LIMIT || '20mb' }));
app.use(sanitizeInput_1.sanitizeInput);
if (process.env.NODE_ENV === 'production') {
    app.use((req, res, next) => {
        if (req.headers['x-forwarded-proto'] !== 'https') {
            return res.redirect(301, `https://${req.headers.host}${req.url}`);
        }
        next();
    });
}
// Ensure upload directory exists (resolved from dist/ when running node dist/index.js)
const uploadDir = path_1.default.join(__dirname, '..', process.env.UPLOAD_DIR || 'uploads');
if (!fs_1.default.existsSync(uploadDir)) {
    fs_1.default.mkdirSync(uploadDir, { recursive: true });
    console.log('Created uploads directory:', uploadDir);
}
// Proxy /uploads/* to Azure Blob Storage (same-origin avoids CORS issues)
const blobStorageService_1 = require("./services/blobStorageService");
app.use('/uploads', authenticate_1.authenticate, async (req, res, next) => {
    try {
        // req.path is e.g. "/templates/1234-abc.pdf" or "/template-old-name.pdf"
        const blobName = req.path.startsWith('/') ? req.path.slice(1) : req.path;
        if (!blobName)
            return res.status(400).json({ error: 'No file specified' });
        // Get a short-lived SAS URL and stream the blob content to the client
        const sasUrl = await (0, blobStorageService_1.getBlobSasUrl)(blobName, 5);
        const blobRes = await fetch(sasUrl);
        if (!blobRes.ok)
            return res.status(404).json({ error: 'File not found' });
        res.setHeader('Content-Type', blobRes.headers.get('content-type') || 'application/pdf');
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('Cache-Control', 'private, max-age=300');
        const arrayBuffer = await blobRes.arrayBuffer();
        res.send(Buffer.from(arrayBuffer));
    }
    catch (err) {
        console.error('Blob proxy error:', err.message);
        res.status(500).json({ error: 'Could not retrieve file' });
    }
});
// Routes — register /documents/library before /documents so GET /documents/library is not matched as /documents/:id
app.use('/auth', auth_1.default);
app.use('/documents/library', libraryDocuments_1.default);
app.use('/documents', documents_1.default);
app.use('/api/library', library_1.default);
app.use('/jobs', jobs_1.default);
app.use('/sites', sites_1.default);
app.use('/subcontractors', subcontractors_1.default);
app.use('/offline-subcontractor-forms', offlineSubcontractorForms_1.default);
app.use('/equipment', equipment_1.default);
app.use('/users', users_1.default);
app.use('/templates', templates_1.default);
app.use('/submissions', submissions_1.default);
app.use('/signable-submissions', signableSubmissions_1.default);
app.use('/daily-forms', dailyForms_1.default);
app.use('/daily-hazard-analysis', dailyHazard_1.default);
app.use('/dha-presets', dhaPresets_1.default);
app.use('/pdf-templates', pdfTemplates_1.default);
app.use('/pdf-submissions', pdfSubmissions_1.default);
app.use('/toolbox-topics', toolboxTopics_1.default);
app.use('/signing', signing_1.default);
app.use('/injury-reports', injuryReports_1.default);
app.use('/certificates', certificates_1.default);
app.use('/incidents', incidents_1.default);
app.use('/near-misses', nearMisses_1.default);
app.use('/hazards', hazards_1.default);
app.use('/observations', observations_1.default);
app.use('/capa', capa_1.default);
app.use('/safety-alerts', safetyAlerts_1.default);
app.use('/inspections', inspections_1.default);
app.use('/compliance-calendar', complianceCalendar_1.default);
app.use('/audit-log', auditLog_1.default);
app.use('/quality-findings', qualityFindings_1.default);
app.use('/hr-todo', hrTodo_1.default);
app.use('/google-calendar', googleCalendar_1.default);
app.use('/notifications', notifications_1.default);
app.use('/composio', composio_1.default);
app.use('/incoming-invoices', incomingInvoices_1.default);
app.use('/outgoing-invoices', outgoingInvoices_1.default);
app.use('/hazard-review', hazardReview_1.default);
app.use('/feedback', productFeedback_1.default);
app.use('/time-off', timeOff_1.default);
app.use('/employee-time-tracking', employeeTimeTracking_1.default);
app.use('/form-qr-codes', formQrCodes_1.default);
app.use('/qr', qrResolve_1.default);
app.use('/permissions', permissions_1.default);
app.use('/invite', invite_1.default);
app.use('/employee-documents', employeeDocuments_1.default);
app.use('/estimation-project-files', estimationProjectFiles_1.default);
app.use('/inspection-attachments', inspectionAttachments_1.default);
app.use('/frank', frank_1.default);
app.use('/form-assignments', formAssignments_1.default);
app.use('/admin', admin_1.default);
// Temporary migration route — remove after running once
app.post('/admin/migrate-to-blob', authenticate_1.authenticate, async (req, res) => {
    if (req.user.role !== 'owner') {
        return res.status(403).json({ error: 'Owner only' });
    }
    try {
        await (0, migrateFilesToBlob_1.migrateLocalFilesToBlob)();
        res.json({ success: true });
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
app.post('/admin/backfill-doc-text', authenticate_1.authenticate, async (req, res) => {
    if (req.user?.role !== 'owner') {
        return res.status(403).json({ error: 'Owner only' });
    }
    try {
        const result = await (0, backfillExtractedText_1.backfillLibraryDocumentText)();
        res.json(result);
    }
    catch (err) {
        const message = err instanceof Error ? err.message : 'Backfill failed';
        res.status(500).json({ error: message });
    }
});
app.get('/health', async (req, res) => {
    let dbStatus = 'connected';
    try {
        await Promise.race([
            prisma_1.prisma.$queryRaw `SELECT 1`,
            new Promise((_, rej) => {
                setTimeout(() => rej(new Error('database health check timed out')), 8000);
            }),
        ]);
    }
    catch {
        dbStatus = 'error';
    }
    res.status(200).json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        database: dbStatus
    });
});
// Global Error Handler must be the last middleware
app.use(errorHandler_1.errorHandler);
async function seedToolboxTalkNativeTemplate() {
    const CUSTOM_TEMPLATE_PREFIX = 'custom-form://';
    // Find the existing PDF-based toolbox talk template (whatever HR created/configured).
    const toolboxPdf = await prisma_1.prisma.pdfTemplate.findFirst({
        where: {
            isActive: true,
            OR: [
                { name: { contains: 'tool box', mode: 'insensitive' } },
                { name: { contains: 'toolbox', mode: 'insensitive' } },
            ],
        },
        select: {
            id: true,
            name: true,
            description: true,
            assignedRoles: true,
            assignedUserIds: true,
        },
    });
    if (!toolboxPdf?.name)
        return;
    const alreadyExists = await prisma_1.prisma.pdfTemplate.findFirst({
        where: {
            isActive: true,
            name: toolboxPdf.name,
            filePath: { startsWith: CUSTOM_TEMPLATE_PREFIX },
        },
        select: { id: true },
    });
    // Pick a system actor for createdById (createCustomTemplate enforces owner/hr).
    const systemOwner = await prisma_1.prisma.user.findFirst({ where: { role: 'owner' }, select: { id: true, role: true } });
    const systemHr = !systemOwner ? await prisma_1.prisma.user.findFirst({ where: { role: 'hr' }, select: { id: true, role: true } }) : null;
    const systemUser = systemOwner ?? systemHr;
    if (!systemUser?.id || !systemUser.role)
        return;
    // Native toolbox talk: screenshot -> easy-to-fill text fields + attendee name+signature pairs.
    // Note: we model the attendee table as repeated fields (name + signature) for a fixed number of slots.
    const attendeeSlots = 10;
    const fields = [
        { type: 'DATE', label: 'Date of Discussion', required: true },
        { type: 'TEXT', label: 'Title of the Topic', required: true },
        { type: 'TEXT', label: 'Control Measures / Action to be Taken / Safety Tips / Notes from Workers', required: true },
    ];
    for (let i = 1; i <= attendeeSlots; i++) {
        fields.push({ type: 'TEXT', label: `Attendee ${i} Name`, required: false });
        fields.push({ type: 'SIGNATURE', label: `Attendee ${i} Signature`, required: false });
    }
    fields.push({ type: 'TEXT', label: 'Approved by', required: false });
    fields.push({ type: 'TEXT', label: 'Job Title', required: false });
    function toSafeFieldLabel(label) {
        return String(label ?? '').trim().slice(0, 200);
    }
    function normalizeCustomFields(inputFields) {
        if (!Array.isArray(inputFields) || inputFields.length === 0)
            return [];
        return inputFields.map((f, idx) => {
            const rawType = String(f?.type ?? 'TEXT').toUpperCase();
            const type = (rawType === 'DATE' || rawType === 'SIGNATURE' || rawType === 'CHECKBOX' || rawType === 'NUMBER' ? rawType : 'TEXT');
            const page = 1;
            const x = 0.05;
            const y = Math.max(0, Math.min(0.9, 0.05 + idx * 0.055));
            const width = type === 'CHECKBOX' ? 0.06 : 0.9;
            const height = type === 'CHECKBOX' ? 0.04 : 0.05;
            return {
                type,
                label: toSafeFieldLabel(f?.label || `Field ${idx + 1}`),
                page,
                x,
                y,
                width,
                height,
                required: Boolean(f?.required),
            };
        });
    }
    if (!alreadyExists) {
        const created = await (0, pdfTemplateService_1.createCustomTemplate)(systemUser.id, systemUser.role, {
            name: toolboxPdf.name,
            description: toolboxPdf.description ?? undefined,
            assignedRoles: toolboxPdf.assignedRoles,
            assignedUserIds: toolboxPdf.assignedUserIds,
            fields,
        });
        console.log(`Seeded native toolbox talk template: ${created.id}`);
        return;
    }
    // If it exists but doesn't have enough attendee slots, update its fields in-place.
    const signatureFieldCount = await prisma_1.prisma.pdfField.count({
        where: {
            templateId: alreadyExists.id,
            type: 'SIGNATURE',
            label: { startsWith: 'Attendee ' },
        },
    });
    if (signatureFieldCount === attendeeSlots)
        return;
    await prisma_1.prisma.pdfField.deleteMany({ where: { templateId: alreadyExists.id } });
    const normalized = normalizeCustomFields(fields);
    if (normalized.length > 0) {
        await prisma_1.prisma.pdfField.createMany({
            data: normalized.map((f) => ({
                templateId: alreadyExists.id,
                type: f.type,
                label: f.label,
                page: f.page,
                x: f.x,
                y: f.y,
                width: f.width,
                height: f.height,
                required: f.required,
            })),
        });
    }
    console.log(`Updated native toolbox talk template fields (${signatureFieldCount} -> ${attendeeSlots}) for: ${alreadyExists.id}`);
}
async function seedNearMissNativeTemplate() {
    const CUSTOM_TEMPLATE_PREFIX = 'custom-form://';
    const TEMPLATE_NAME = 'Near Miss Form';
    const TEMPLATE_DESCRIPTION = 'Report a near-miss event: site, description, corrective action, and completion details. Submissions appear under Forms & Documents and Health & Safety.';
    const fields = [
        { type: 'TEXT', label: 'Site name', required: false },
        { type: 'TEXT', label: 'Reported by', required: false },
        { type: 'DATE', label: 'Report date', required: false },
        { type: 'TEXT', label: 'Description', required: true },
        { type: 'TEXT', label: 'Corrective action to be taken', required: false },
        { type: 'DATE', label: 'Date of corrective action', required: false },
        { type: 'TEXT', label: 'Report completed by', required: false },
    ];
    const alreadyExists = await prisma_1.prisma.pdfTemplate.findFirst({
        where: {
            isActive: true,
            filePath: { startsWith: CUSTOM_TEMPLATE_PREFIX },
            OR: [
                { name: TEMPLATE_NAME },
                { name: 'Near Miss Report' },
                { name: { contains: 'near miss', mode: 'insensitive' } },
            ],
        },
        select: { id: true, name: true },
    });
    const systemOwner = await prisma_1.prisma.user.findFirst({ where: { role: 'owner' }, select: { id: true, role: true } });
    const systemHr = !systemOwner ? await prisma_1.prisma.user.findFirst({ where: { role: 'hr' }, select: { id: true, role: true } }) : null;
    const systemUser = systemOwner ?? systemHr;
    if (!systemUser?.id || !systemUser.role)
        return;
    if (alreadyExists?.id) {
        await (0, pdfTemplateService_1.updateTemplate)(alreadyExists.id, systemUser.id, systemUser.role, {
            name: TEMPLATE_NAME,
            description: TEMPLATE_DESCRIPTION,
            assignedRoles: ['owner', 'hr', 'supervisor'],
            fields,
        });
        console.log(`Updated Near Miss native template: ${alreadyExists.id}`);
        return;
    }
    const created = await (0, pdfTemplateService_1.createCustomTemplate)(systemUser.id, systemUser.role, {
        name: TEMPLATE_NAME,
        description: TEMPLATE_DESCRIPTION,
        assignedRoles: ['owner', 'hr', 'supervisor'],
        fields,
    });
    console.log(`Seeded Near Miss native template: ${created.id}`);
}
async function seedWeeklyProjectInspectionNativeTemplate() {
    const CUSTOM_TEMPLATE_PREFIX = 'custom-form://';
    const weeklyPdf = await prisma_1.prisma.pdfTemplate.findFirst({
        where: {
            isActive: true,
            AND: [
                { name: { contains: 'weekly', mode: 'insensitive' } },
                { name: { contains: 'inspection', mode: 'insensitive' } },
            ],
        },
        select: {
            id: true,
            name: true,
            description: true,
            assignedRoles: true,
            assignedUserIds: true,
        },
    });
    if (!weeklyPdf?.name) {
        console.log('Weekly inspection native seed: no matching PDF template found');
        return;
    }
    const attendeeSlots = 20;
    const alreadyExists = await prisma_1.prisma.pdfTemplate.findFirst({
        where: {
            isActive: true,
            name: weeklyPdf.name,
            filePath: { startsWith: CUSTOM_TEMPLATE_PREFIX },
        },
        select: { id: true },
    });
    if (alreadyExists?.id) {
        const fieldCount = await prisma_1.prisma.pdfField.count({ where: { templateId: alreadyExists.id } });
        console.log(`Weekly inspection native seed: custom template exists (${alreadyExists.id}) with ${fieldCount} fields`);
    }
    else {
        console.log('Weekly inspection native seed: no existing custom template found');
    }
    // Checkboxes: recreated from extracted PDF lines.
    const checkboxLabels = [
        'Housekeeping',
        'Gas Canisters Closed',
        'Vehicle Storage / Condition',
        'Fire Extinguishers',
        'Site Required Postings',
        'Lunchroom / Lockers',
        'Guardrails Secured',
        'Items Stored / Stacked',
        'Electrical Cords',
        'Emergency Eyewash',
        'Job Work Order',
        'First Aid Training',
        'Access / Egress Areas',
        'Chemicals Labelled',
        'Lifting Equipment Condition',
        'First Aid Kit',
        'Safety Talks',
        'Visitors Sign-In Area',
        'Stairs / Ramps',
        'Proper Storage Location',
        'Scaffolding Components',
        'Fall Prevention Plan',
        'Daily JHA Completed',
        'Desks /Tables / Chairs',
        'Dust Control',
        'Compressed Gas Use And Storage',
        'Signal Person Where Required Conditions',
        'Emergency Contact Numbers Postings',
        'Safe Work Practices and Procedures',
        'Policy Statements (Safety, Violence and Harassment)',
        'Head Protections',
        'Flammables Fuel Storage',
        'Hoists / Cranes',
        'Hospital Map / Directions',
        'Current MSDS',
        'Form 82 (1234 Poster)',
        'Foot Protection',
        'Ventilation Where Required',
        'Rappelling Devices',
        'Electrical Panels Secured',
        'Training Records Available',
        'Workplace Inspections',
        'Eye/Face Protection',
        'Asphalt Material',
        'Welding / Cutting Equipment',
        'GFCI’s (Ground Fault)',
        'Operators Manuals',
        'MOL Orders (Copies)',
        'Hearing Protection',
        'Protective Coverings',
        'Ladders Condition and Setup',
        'Locates (Underground)',
        'Weekly Inspections',
        'Required Regulations',
        'Gloves / Protective Clothing',
        'Staging and Unloading Areas Identified',
        'Power Tools – Cords and Body',
        'Washrooms / Water Stations',
        'Site Hazard Assessment Documents Sheets',
        'Emergency Contact Numbers Postings',
        'Respiratory Protection',
        'Spill Kits Available',
        'Hand Tool Condition',
        'Alert System',
        'Progressive Discipline Form',
        'Regulation 1101',
        'Reflective Traffic Vests',
        'Guarding In Place',
        'Fuel Powered Tools',
        'Overhead Conductors',
        'Reporting Forms',
        'Orientation Guidelines',
        'Fall Protection Harness',
        'Lockout / Tag Equipment',
        'Working Platforms',
        'Spill Kits',
        'Investigation Package',
        'Snow Removal',
    ];
    // Deduplicate but keep order.
    const seen = new Set();
    const dedupedCheckboxes = checkboxLabels.filter((l) => {
        const key = l.trim();
        if (!key)
            return false;
        if (seen.has(key.toLowerCase()))
            return false;
        seen.add(key.toLowerCase());
        return true;
    });
    function encodeDropdownLabel(question, options) {
        return `[DROPDOWN]${question}::${options.join('|')}`;
    }
    const fields = [
        { type: 'TEXT', label: 'Location', required: true },
        { type: 'TEXT', label: 'Inspected By', required: true },
        { type: 'TEXT', label: 'Reviewed By', required: false },
        { type: 'TEXT', label: 'Date Time', required: true },
        ...dedupedCheckboxes.map((label) => ({ type: 'CHECKBOX', label, required: false })),
    ];
    for (let i = 1; i <= attendeeSlots; i++) {
        fields.push({ type: 'TEXT', label: `Hazard Row ${i}: Item # / Location`, required: false }, { type: 'TEXT', label: `Hazard Row ${i}: Hazards Observed`, required: false }, { type: 'TEXT', label: encodeDropdownLabel(`Hazard Row ${i}: Likelihood (A/B/C)`, ['A', 'B', 'C']), required: false }, { type: 'TEXT', label: `Hazard Row ${i}: Corrective Measures taken/suggested`, required: false }, { type: 'TEXT', label: encodeDropdownLabel(`Hazard Row ${i}: Repeat (Y/N)`, ['Y', 'N']), required: false }, { type: 'DATE', label: `Hazard Row ${i}: Date Resolved`, required: false }, { type: 'TEXT', label: `Hazard Row ${i}: Comments / Follow-Up / Site Incidents or Near Misses Reported`, required: false });
    }
    fields.push({ type: 'TEXT', label: 'Management Initials', required: false });
    // Pick a system actor for createdById (createCustomTemplate enforces owner/hr).
    const systemOwner = await prisma_1.prisma.user.findFirst({ where: { role: 'owner' }, select: { id: true, role: true } });
    const systemHr = !systemOwner ? await prisma_1.prisma.user.findFirst({ where: { role: 'hr' }, select: { id: true, role: true } }) : null;
    const systemUser = systemOwner ?? systemHr;
    if (!systemUser?.id || !systemUser.role)
        return;
    // If it exists, we keep it (so admins can fine-tune). If it has no fields, we recreate.
    if (alreadyExists?.id) {
        const fieldCount = await prisma_1.prisma.pdfField.count({ where: { templateId: alreadyExists.id } });
        const expectedCount = fields.length;
        // If it's already a real template (enough fields), keep it.
        if (fieldCount >= Math.max(10, Math.floor(expectedCount * 0.8)))
            return;
        // Otherwise, rebuild the fields in-place.
        function toSafeFieldLabel(label) {
            return String(label ?? '').trim().slice(0, 200);
        }
        function normalizeCustomFields(inputFields) {
            if (!Array.isArray(inputFields) || inputFields.length === 0)
                return [];
            return inputFields.map((f, idx) => {
                const rawType = String(f?.type ?? 'TEXT').toUpperCase();
                const type = (rawType === 'DATE' || rawType === 'SIGNATURE' || rawType === 'CHECKBOX' || rawType === 'NUMBER' ? rawType : 'TEXT');
                const page = 1;
                const x = 0.05;
                const y = Math.max(0, Math.min(0.9, 0.05 + idx * 0.055));
                const width = type === 'CHECKBOX' ? 0.06 : 0.9;
                const height = type === 'CHECKBOX' ? 0.04 : 0.05;
                return {
                    type,
                    label: toSafeFieldLabel(f?.label || `Field ${idx + 1}`),
                    page,
                    x,
                    y,
                    width,
                    height,
                    required: Boolean(f?.required),
                };
            });
        }
        const normalized = normalizeCustomFields(fields);
        if (normalized.length === 0)
            return;
        await prisma_1.prisma.pdfField.deleteMany({ where: { templateId: alreadyExists.id } });
        await prisma_1.prisma.pdfField.createMany({
            data: normalized.map((f) => ({
                templateId: alreadyExists.id,
                type: f.type,
                label: f.label,
                page: f.page,
                x: f.x,
                y: f.y,
                width: f.width,
                height: f.height,
                required: f.required,
            })),
        });
        console.log(`Weekly inspection native seed: rebuilt custom template fields (${fieldCount} -> ${normalized.length}) for ${alreadyExists.id}`);
    }
    const assignedRoles = Array.isArray(weeklyPdf.assignedRoles) && weeklyPdf.assignedRoles.length ? weeklyPdf.assignedRoles : ['labourer'];
    const assignedUserIds = Array.isArray(weeklyPdf.assignedUserIds) ? weeklyPdf.assignedUserIds : [];
    const created = await (0, pdfTemplateService_1.createCustomTemplate)(systemUser.id, systemUser.role, {
        name: weeklyPdf.name,
        description: weeklyPdf.description ?? undefined,
        assignedRoles,
        assignedUserIds,
        fields,
    });
    console.log(`Seeded native weekly project inspection template: ${created.id}`);
}
async function seedPowerElevatingWorkPlatformsTemplate() {
    const CUSTOM_TEMPLATE_PREFIX = 'custom-form://';
    const TEMPLATE_NAME = 'Power Elevating / Work Platforms';
    const LIFT_NUMBER_FIELD_LABEL = 'Lift number / ID';
    const alreadyExists = await prisma_1.prisma.pdfTemplate.findFirst({
        where: {
            isActive: true,
            name: TEMPLATE_NAME,
            filePath: { startsWith: CUSTOM_TEMPLATE_PREFIX },
        },
        select: { id: true },
    });
    if (alreadyExists?.id) {
        const hasLiftField = await prisma_1.prisma.pdfField.findFirst({
            where: { templateId: alreadyExists.id, label: LIFT_NUMBER_FIELD_LABEL },
            select: { id: true },
        });
        if (hasLiftField)
            return;
        const operatorField = await prisma_1.prisma.pdfField.findFirst({
            where: { templateId: alreadyExists.id, label: 'Operator' },
        });
        const dateField = await prisma_1.prisma.pdfField.findFirst({
            where: { templateId: alreadyExists.id, type: 'DATE', label: 'Date' },
        });
        if (!operatorField || !dateField) {
            console.warn(`Power Elevating / Work Platforms template ${alreadyExists.id}: could not add "${LIFT_NUMBER_FIELD_LABEL}" (Operator or Date field missing).`);
            return;
        }
        const y = (operatorField.y + dateField.y) / 2;
        await prisma_1.prisma.pdfField.create({
            data: {
                templateId: alreadyExists.id,
                type: 'TEXT',
                label: LIFT_NUMBER_FIELD_LABEL,
                page: operatorField.page,
                x: operatorField.x,
                y,
                width: operatorField.width,
                height: operatorField.height,
                required: false,
            },
        });
        console.log(`Power Elevating / Work Platforms template: added missing field "${LIFT_NUMBER_FIELD_LABEL}" (${alreadyExists.id})`);
        return;
    }
    // Pick a system actor for createdById (createCustomTemplate enforces owner/hr).
    const systemOwner = await prisma_1.prisma.user.findFirst({ where: { role: 'owner' }, select: { id: true, role: true } });
    const systemHr = !systemOwner ? await prisma_1.prisma.user.findFirst({ where: { role: 'hr' }, select: { id: true, role: true } }) : null;
    const systemUser = systemOwner ?? systemHr;
    if (!systemUser?.id || !systemUser.role)
        return;
    const fields = [
        { type: 'TEXT', label: '[SECTION]Details', required: false },
        { type: 'TEXT', label: 'Project/Facility', required: false },
        { type: 'TEXT', label: 'Location / Address', required: false },
        { type: 'TEXT', label: 'Unit #', required: false },
        { type: 'TEXT', label: 'Operator', required: false },
        { type: 'TEXT', label: LIFT_NUMBER_FIELD_LABEL, required: false },
        { type: 'DATE', label: 'Date', required: true },
        { type: 'TEXT', label: '[SECTION]Pre Operational Checks', required: false },
        { type: 'TEXT', label: '[SECTION]General', required: false },
        { type: 'CHECKBOX', label: 'Manufacturer operator’s manual', required: false },
        { type: 'CHECKBOX', label: 'Maintenance log', required: false },
        { type: 'CHECKBOX', label: 'Annual inspection certificate is current & dated within 12 months', required: false },
        { type: 'CHECKBOX', label: 'Operators record of training (if necessary)', required: false },
        { type: 'CHECKBOX', label: 'Placards legible & secure', required: false },
        { type: 'TEXT', label: '[SECTION]Tires', required: false },
        { type: 'CHECKBOX', label: 'Pressure', required: false },
        { type: 'CHECKBOX', label: 'Splits/cracks/treadwear', required: false },
        { type: 'TEXT', label: '[SECTION]Brakes', required: false },
        { type: 'CHECKBOX', label: 'Working efficiently', required: false },
        { type: 'CHECKBOX', label: 'Brake fluid level', required: false },
        { type: 'TEXT', label: '[SECTION]Guardrails', required: false },
        { type: 'CHECKBOX', label: 'Bent cracked or any other visual defects', required: false },
        { type: 'TEXT', label: '[SECTION]Fuel supply proper levels and secure', required: false },
        { type: 'CHECKBOX', label: 'Battery charged or propane full', required: false },
        { type: 'CHECKBOX', label: 'Fuel, water and oil levels full', required: false },
        { type: 'TEXT', label: '[SECTION]Control panel', required: false },
        { type: 'CHECKBOX', label: 'Clearly marked secure & operable', required: false },
        { type: 'TEXT', label: '[SECTION]Hydraulic lines / cylinders', required: false },
        { type: 'CHECKBOX', label: 'Leaks', required: false },
        { type: 'CHECKBOX', label: 'Couplings / connector(s) secure', required: false },
        { type: 'CHECKBOX', label: 'Guards in place', required: false },
        { type: 'TEXT', label: '[SECTION]Components', required: false },
        { type: 'CHECKBOX', label: 'Platform floor free from defects', required: false },
        { type: 'CHECKBOX', label: 'Boom, forks & attachments free from defects', required: false },
        { type: 'TEXT', label: '[SECTION]Emergency controls and safety equipment', required: false },
        { type: 'CHECKBOX', label: 'Emergency controls function correctly', required: false },
        { type: 'CHECKBOX', label: 'Safety harness in good condition', required: false },
        { type: 'TEXT', label: '[SECTION]Worker Comments or Concerns', required: false },
        { type: 'TEXT', label: 'Worker Comments or Concerns. Describe any additional information or if an issue that is not listed above.', required: false },
        { type: 'TEXT', label: '[SECTION]Corrective Actions', required: false },
        { type: 'TEXT', label: 'Corrective Actions. Note any corrective actions needed to take place to ensure the safety of the machine and the operator.', required: false },
        { type: 'TEXT', label: '[SECTION]Review Performed By', required: false },
        { type: 'TEXT', label: '[COLLECT_SIGNATURES]', required: false },
    ];
    const created = await (0, pdfTemplateService_1.createCustomTemplate)(systemUser.id, systemUser.role, {
        name: TEMPLATE_NAME,
        description: 'Power Elevating Work Platforms pre-use inspection checklist.',
        assignedRoles: ['labourer', 'supervisor'],
        fields,
    });
    console.log(`Seeded native Power Elevating / Work Platforms template: ${created.id}`);
}
async function seedEquipmentInspectionChecklistTemplate() {
    const CUSTOM_TEMPLATE_PREFIX = 'custom-form://';
    const TEMPLATE_NAME = 'Equipment Inspection Checklist';
    const TEMPLATE_DESCRIPTION = 'Pre-operational equipment inspection checklist (daily). Sections: General, Tires, Operating System, Fluids & Belts, Fuel, Steering, Lift System, Brakes, Gauges.';
    const existingTemplates = await prisma_1.prisma.pdfTemplate.findMany({
        where: {
            isActive: true,
            filePath: { startsWith: CUSTOM_TEMPLATE_PREFIX },
            OR: [
                { name: TEMPLATE_NAME },
                { name: { contains: 'equipment inspection', mode: 'insensitive' } },
            ],
        },
        select: { id: true, name: true },
    });
    const systemOwner = await prisma_1.prisma.user.findFirst({ where: { role: 'owner' }, select: { id: true, role: true } });
    const systemHr = !systemOwner ? await prisma_1.prisma.user.findFirst({ where: { role: 'hr' }, select: { id: true, role: true } }) : null;
    const systemUser = systemOwner ?? systemHr;
    if (!systemUser?.id || !systemUser.role)
        return;
    const fields = (0, equipmentInspectionChecklistFields_1.buildEquipmentInspectionChecklistFields)();
    if (existingTemplates.length > 0) {
        for (const tpl of existingTemplates) {
            await (0, pdfTemplateService_1.updateTemplate)(tpl.id, systemUser.id, systemUser.role, {
                name: TEMPLATE_NAME,
                description: TEMPLATE_DESCRIPTION,
                assignedRoles: ['labourer', 'supervisor'],
                fields,
            });
            console.log(`Updated Equipment Inspection Checklist template fields: ${tpl.id} (${tpl.name})`);
        }
        return;
    }
    const created = await (0, pdfTemplateService_1.createCustomTemplate)(systemUser.id, systemUser.role, {
        name: TEMPLATE_NAME,
        description: TEMPLATE_DESCRIPTION,
        assignedRoles: ['labourer', 'supervisor'],
        fields,
    });
    console.log(`Seeded Equipment Inspection Checklist template: ${created.id}`);
}
async function seedLegislativeComplianceEvaluationTemplate() {
    const CUSTOM_TEMPLATE_PREFIX = 'custom-form://';
    const TEMPLATE_NAME = 'Legislative Compliance Evaluation';
    const TEMPLATE_DESCRIPTION = 'Legislative compliance evaluation (Ontario). Use the downloadable checklist for full citation text. Minimum annual completion; review yearly (e.g. COR 2020 Element 13.4). Link submissions to the relevant job in Job Management.';
    const fields = (0, legislativeComplianceEvaluationFields_1.buildLegislativeComplianceEvaluationFields)();
    const existingTemplates = await prisma_1.prisma.pdfTemplate.findMany({
        where: {
            isActive: true,
            filePath: { startsWith: CUSTOM_TEMPLATE_PREFIX },
            OR: [
                { name: TEMPLATE_NAME },
                { name: 'Legislative Compliance Evaluation Form' },
                { name: { contains: 'Legislative Compliance Evaluation' } },
            ],
        },
        select: { id: true, name: true },
    });
    const systemOwner = await prisma_1.prisma.user.findFirst({ where: { role: 'owner' }, select: { id: true, role: true } });
    const systemHr = !systemOwner ? await prisma_1.prisma.user.findFirst({ where: { role: 'hr' }, select: { id: true, role: true } }) : null;
    const systemUser = systemOwner ?? systemHr;
    if (!systemUser?.id || !systemUser.role)
        return;
    if (existingTemplates.length > 0) {
        for (const tpl of existingTemplates) {
            await (0, pdfTemplateService_1.updateTemplate)(tpl.id, systemUser.id, systemUser.role, {
                // Normalize all variants so users hit one consistent template name.
                name: TEMPLATE_NAME,
                description: TEMPLATE_DESCRIPTION,
                assignedRoles: ['owner', 'hr', 'supervisor', 'labourer'],
                fields,
            });
            console.log(`Updated Legislative Compliance Evaluation template fields: ${tpl.id} (${tpl.name})`);
        }
        return;
    }
    const created = await (0, pdfTemplateService_1.createCustomTemplate)(systemUser.id, systemUser.role, {
        name: TEMPLATE_NAME,
        description: TEMPLATE_DESCRIPTION,
        assignedRoles: ['owner', 'hr', 'supervisor', 'labourer'],
        fields,
    });
    console.log(`Seeded Legislative Compliance Evaluation template: ${created.id}`);
}
async function seedCriticalTaskInventoryRiskRegisterTemplate() {
    const CUSTOM_TEMPLATE_PREFIX = 'custom-form://';
    const TEMPLATE_NAME = 'Critical Task Inventory & Risk Register';
    const alreadyExists = await prisma_1.prisma.pdfTemplate.findFirst({
        where: {
            isActive: true,
            name: TEMPLATE_NAME,
            filePath: { startsWith: CUSTOM_TEMPLATE_PREFIX },
        },
        select: { id: true },
    });
    if (alreadyExists?.id)
        return;
    const systemOwner = await prisma_1.prisma.user.findFirst({ where: { role: 'owner' }, select: { id: true, role: true } });
    const systemHr = !systemOwner ? await prisma_1.prisma.user.findFirst({ where: { role: 'hr' }, select: { id: true, role: true } }) : null;
    const systemUser = systemOwner ?? systemHr;
    if (!systemUser?.id || !systemUser.role)
        return;
    const fields = (0, criticalTaskInventoryRiskRegisterFields_1.buildCriticalTaskInventoryRiskRegisterFields)();
    const created = await (0, pdfTemplateService_1.createCustomTemplate)(systemUser.id, systemUser.role, {
        name: TEMPLATE_NAME,
        description: 'Critical task inventory and risk register. Use the downloadable PDF (V.2) for full structure and guidance. Link each submission to the relevant job in Job Management.',
        assignedRoles: ['owner', 'hr', 'supervisor', 'labourer'],
        fields,
    });
    console.log(`Seeded Critical Task Inventory & Risk Register template: ${created.id}`);
}
async function seedConfinedSpaceEntryPermitTemplate() {
    const CUSTOM_TEMPLATE_PREFIX = 'custom-form://';
    const TEMPLATE_NAME = 'Confined Space Entry Permit';
    const TEMPLATE_DESCRIPTION = 'Confined space entry permit (2026 form). Use the downloadable PDF for full layout. Link each submission to the relevant job in Job Management.';
    const existingTemplates = await prisma_1.prisma.pdfTemplate.findMany({
        where: {
            isActive: true,
            filePath: { startsWith: CUSTOM_TEMPLATE_PREFIX },
            OR: [
                { name: TEMPLATE_NAME },
                { name: { contains: 'Confined Space Entry Permit', mode: 'insensitive' } },
            ],
        },
        select: { id: true, name: true },
    });
    const systemOwner = await prisma_1.prisma.user.findFirst({ where: { role: 'owner' }, select: { id: true, role: true } });
    const systemHr = !systemOwner ? await prisma_1.prisma.user.findFirst({ where: { role: 'hr' }, select: { id: true, role: true } }) : null;
    const systemUser = systemOwner ?? systemHr;
    if (!systemUser?.id || !systemUser.role)
        return;
    const fields = (0, confinedSpaceEntryPermitFields_1.buildConfinedSpaceEntryPermitFields)();
    if (existingTemplates.length > 0) {
        for (const tpl of existingTemplates) {
            await (0, pdfTemplateService_1.updateTemplate)(tpl.id, systemUser.id, systemUser.role, {
                name: TEMPLATE_NAME,
                description: TEMPLATE_DESCRIPTION,
                assignedRoles: ['owner', 'hr', 'supervisor', 'labourer'],
                fields,
            });
            console.log(`Updated Confined Space Entry Permit template fields: ${tpl.id} (${tpl.name})`);
        }
        return;
    }
    const created = await (0, pdfTemplateService_1.createCustomTemplate)(systemUser.id, systemUser.role, {
        name: TEMPLATE_NAME,
        description: TEMPLATE_DESCRIPTION,
        assignedRoles: ['owner', 'hr', 'supervisor', 'labourer'],
        fields,
    });
    console.log(`Seeded Confined Space Entry Permit template: ${created.id}`);
}
async function seedFallArrestInspectionChecklistTemplate() {
    const CUSTOM_TEMPLATE_PREFIX = 'custom-form://';
    const TEMPLATE_NAME = 'Fall Arrest Inspection Checklist';
    const TEMPLATE_DESCRIPTION = 'Pre-use daily fall-arrest equipment inspection checklist. Complete one daily checklist section and add comments/notes.';
    const existingTemplates = await prisma_1.prisma.pdfTemplate.findMany({
        where: {
            isActive: true,
            filePath: { startsWith: CUSTOM_TEMPLATE_PREFIX },
            OR: [
                { name: TEMPLATE_NAME },
                { name: { contains: 'fall arrest', mode: 'insensitive' } },
            ],
        },
        select: { id: true, name: true },
    });
    const systemOwner = await prisma_1.prisma.user.findFirst({ where: { role: 'owner' }, select: { id: true, role: true } });
    const systemHr = !systemOwner ? await prisma_1.prisma.user.findFirst({ where: { role: 'hr' }, select: { id: true, role: true } }) : null;
    const systemUser = systemOwner ?? systemHr;
    if (!systemUser?.id || !systemUser.role)
        return;
    const fields = (0, fallArrestInspectionChecklistFields_1.buildFallArrestInspectionChecklistFields)();
    if (existingTemplates.length > 0) {
        for (const tpl of existingTemplates) {
            await (0, pdfTemplateService_1.updateTemplate)(tpl.id, systemUser.id, systemUser.role, {
                name: TEMPLATE_NAME,
                description: TEMPLATE_DESCRIPTION,
                assignedRoles: ['owner', 'hr', 'supervisor', 'labourer'],
                fields,
            });
            console.log(`Updated Fall Arrest Inspection Checklist template fields: ${tpl.id} (${tpl.name})`);
        }
        return;
    }
    const created = await (0, pdfTemplateService_1.createCustomTemplate)(systemUser.id, systemUser.role, {
        name: TEMPLATE_NAME,
        description: TEMPLATE_DESCRIPTION,
        assignedRoles: ['owner', 'hr', 'supervisor', 'labourer'],
        fields,
    });
    console.log(`Seeded Fall Arrest Inspection Checklist template: ${created.id}`);
}
async function seedWashroomInspectionChecklistTemplate() {
    const CUSTOM_TEMPLATE_PREFIX = 'custom-form://';
    const GENERIC_NAME = 'Washroom Inspection Checklist';
    const GENERIC_DESCRIPTION = 'Daily washroom inspection: choose washroom location, then Yes/No/N/A per item with notes. Defaults apply from the location you pick.';
    const systemOwner = await prisma_1.prisma.user.findFirst({ where: { role: 'owner' }, select: { id: true, role: true } });
    const systemHr = !systemOwner ? await prisma_1.prisma.user.findFirst({ where: { role: 'hr' }, select: { id: true, role: true } }) : null;
    const systemUser = systemOwner ?? systemHr;
    if (!systemUser?.id || !systemUser.role)
        return;
    const actorId = systemUser.id;
    const actorRole = systemUser.role;
    const fields = (0, washroomInspectionChecklistFields_1.buildWashroomInspectionChecklistFields)();
    const roles = ['owner', 'hr', 'supervisor', 'labourer'];
    async function upsertWashroomTemplate(name, description) {
        const existing = await prisma_1.prisma.pdfTemplate.findFirst({
            where: {
                isActive: true,
                filePath: { startsWith: CUSTOM_TEMPLATE_PREFIX },
                name,
            },
            select: { id: true },
        });
        if (existing) {
            await (0, pdfTemplateService_1.updateTemplate)(existing.id, actorId, actorRole, {
                name,
                description,
                assignedRoles: [...roles],
                fields,
            });
            console.log(`Updated washroom template: ${name} (${existing.id})`);
            return;
        }
        const created = await (0, pdfTemplateService_1.createCustomTemplate)(actorId, actorRole, {
            name,
            description,
            assignedRoles: [...roles],
            fields,
        });
        console.log(`Seeded washroom template: ${name} (${created.id})`);
    }
    await upsertWashroomTemplate(GENERIC_NAME, GENERIC_DESCRIPTION);
}
const PIPELINE_FORM_ROLES = ['labourer', 'supervisor'];
async function seedPressureTestingChecklistTemplate() {
    const CUSTOM_TEMPLATE_PREFIX = 'custom-form://';
    const TEMPLATE_NAME = 'Pressure Testing Checklist';
    const TEMPLATE_DESCRIPTION = 'Pressure test parameters, equipment gauge, environmental controls, results, and mechanic/inspector sign-off.';
    const existingTemplates = await prisma_1.prisma.pdfTemplate.findMany({
        where: {
            isActive: true,
            filePath: { startsWith: CUSTOM_TEMPLATE_PREFIX },
            OR: [
                { name: TEMPLATE_NAME },
                { name: { contains: 'pressure testing', mode: 'insensitive' } },
            ],
        },
        select: { id: true, name: true },
    });
    const systemOwner = await prisma_1.prisma.user.findFirst({ where: { role: 'owner' }, select: { id: true, role: true } });
    const systemHr = !systemOwner ? await prisma_1.prisma.user.findFirst({ where: { role: 'hr' }, select: { id: true, role: true } }) : null;
    const systemUser = systemOwner ?? systemHr;
    if (!systemUser?.id || !systemUser.role)
        return;
    const fields = (0, pipelineSafetyFormsFields_1.buildPressureTestingChecklistFields)();
    if (existingTemplates.length > 0) {
        for (const tpl of existingTemplates) {
            await (0, pdfTemplateService_1.updateTemplate)(tpl.id, systemUser.id, systemUser.role, {
                name: TEMPLATE_NAME,
                description: TEMPLATE_DESCRIPTION,
                assignedRoles: [...PIPELINE_FORM_ROLES],
                fields,
            });
            console.log(`Updated Pressure Testing Checklist template fields: ${tpl.id} (${tpl.name})`);
        }
        return;
    }
    const created = await (0, pdfTemplateService_1.createCustomTemplate)(systemUser.id, systemUser.role, {
        name: TEMPLATE_NAME,
        description: TEMPLATE_DESCRIPTION,
        assignedRoles: [...PIPELINE_FORM_ROLES],
        fields,
    });
    console.log(`Seeded Pressure Testing Checklist template: ${created.id}`);
}
async function seedActivePipelineConnectionsHydrocarbonsTemplate() {
    const CUSTOM_TEMPLATE_PREFIX = 'custom-form://';
    const TEMPLATE_NAME = 'Active Pipeline Connections — Hydrocarbons';
    const TEMPLATE_DESCRIPTION = 'Project/system details, hydrocarbon system type, composition, connection procedure (Yes/No), and sign-off.';
    const existingTemplates = await prisma_1.prisma.pdfTemplate.findMany({
        where: {
            isActive: true,
            filePath: { startsWith: CUSTOM_TEMPLATE_PREFIX },
            OR: [
                { name: TEMPLATE_NAME },
                { name: { contains: 'active pipeline', mode: 'insensitive' } },
            ],
        },
        select: { id: true, name: true },
    });
    const systemOwner = await prisma_1.prisma.user.findFirst({ where: { role: 'owner' }, select: { id: true, role: true } });
    const systemHr = !systemOwner ? await prisma_1.prisma.user.findFirst({ where: { role: 'hr' }, select: { id: true, role: true } }) : null;
    const systemUser = systemOwner ?? systemHr;
    if (!systemUser?.id || !systemUser.role)
        return;
    const fields = (0, pipelineSafetyFormsFields_1.buildActivePipelineConnectionsHydrocarbonsFields)();
    if (existingTemplates.length > 0) {
        for (const tpl of existingTemplates) {
            await (0, pdfTemplateService_1.updateTemplate)(tpl.id, systemUser.id, systemUser.role, {
                name: TEMPLATE_NAME,
                description: TEMPLATE_DESCRIPTION,
                assignedRoles: [...PIPELINE_FORM_ROLES],
                fields,
            });
            console.log(`Updated Active Pipeline Connections template fields: ${tpl.id} (${tpl.name})`);
        }
        return;
    }
    const created = await (0, pdfTemplateService_1.createCustomTemplate)(systemUser.id, systemUser.role, {
        name: TEMPLATE_NAME,
        description: TEMPLATE_DESCRIPTION,
        assignedRoles: [...PIPELINE_FORM_ROLES],
        fields,
    });
    console.log(`Seeded Active Pipeline Connections — Hydrocarbons template: ${created.id}`);
}
async function seedDrainAndVentTestFormTemplate() {
    const CUSTOM_TEMPLATE_PREFIX = 'custom-form://';
    const TEMPLATE_NAME = 'Drain and Vent Test Form';
    const TEMPLATE_DESCRIPTION = 'System description, test matrix (standing water through visual), and witnessed-by signatures.';
    const existingTemplates = await prisma_1.prisma.pdfTemplate.findMany({
        where: {
            isActive: true,
            filePath: { startsWith: CUSTOM_TEMPLATE_PREFIX },
            OR: [
                { name: TEMPLATE_NAME },
                { name: { contains: 'drain and vent', mode: 'insensitive' } },
            ],
        },
        select: { id: true, name: true },
    });
    const systemOwner = await prisma_1.prisma.user.findFirst({ where: { role: 'owner' }, select: { id: true, role: true } });
    const systemHr = !systemOwner ? await prisma_1.prisma.user.findFirst({ where: { role: 'hr' }, select: { id: true, role: true } }) : null;
    const systemUser = systemOwner ?? systemHr;
    if (!systemUser?.id || !systemUser.role)
        return;
    const fields = (0, pipelineSafetyFormsFields_1.buildDrainAndVentTestFormFields)();
    if (existingTemplates.length > 0) {
        for (const tpl of existingTemplates) {
            await (0, pdfTemplateService_1.updateTemplate)(tpl.id, systemUser.id, systemUser.role, {
                name: TEMPLATE_NAME,
                description: TEMPLATE_DESCRIPTION,
                assignedRoles: [...PIPELINE_FORM_ROLES],
                fields,
            });
            console.log(`Updated Drain and Vent Test Form template fields: ${tpl.id} (${tpl.name})`);
        }
        return;
    }
    const created = await (0, pdfTemplateService_1.createCustomTemplate)(systemUser.id, systemUser.role, {
        name: TEMPLATE_NAME,
        description: TEMPLATE_DESCRIPTION,
        assignedRoles: [...PIPELINE_FORM_ROLES],
        fields,
    });
    console.log(`Seeded Drain and Vent Test Form template: ${created.id}`);
}
async function seedNicheBufferTanksTemplate() {
    const CUSTOM_TEMPLATE_PREFIX = 'custom-form://';
    const TEMPLATE_NAME = 'Niche Buffer Tanks';
    const TEMPLATE_DESCRIPTION = 'Niche Bakery quarterly buffer tanks inspection with Add In, Location, Line, matrix, notes/comments, and sign-off.';
    const existingTemplates = await prisma_1.prisma.pdfTemplate.findMany({
        where: {
            isActive: true,
            filePath: { startsWith: CUSTOM_TEMPLATE_PREFIX },
            OR: [
                { name: TEMPLATE_NAME },
                { name: { contains: 'niche buffer tanks', mode: 'insensitive' } },
            ],
        },
        select: { id: true, name: true },
    });
    const systemOwner = await prisma_1.prisma.user.findFirst({ where: { role: 'owner' }, select: { id: true, role: true } });
    const systemHr = !systemOwner ? await prisma_1.prisma.user.findFirst({ where: { role: 'hr' }, select: { id: true, role: true } }) : null;
    const systemUser = systemOwner ?? systemHr;
    if (!systemUser?.id || !systemUser.role)
        return;
    const fields = [
        { type: 'TEXT', label: 'Add In', required: false },
        { type: 'TEXT', label: '[JOB_DROPDOWN]Location', required: false },
        { type: 'TEXT', label: 'Line', required: false },
        { type: 'TEXT', label: 'Inspection Rows (fill quarterly findings)', required: false },
        { type: 'TEXT', label: '[SECTION]Notes', required: false },
        { type: 'TEXT', label: 'Notes', required: false },
        { type: 'TEXT', label: 'Comments', required: false },
        { type: 'TEXT', label: '[SECTION]Sign-Off', required: false },
        { type: 'TEXT', label: 'Inspected By', required: false },
        { type: 'DATE', label: 'Date', required: false },
        { type: 'SIGNATURE', label: 'Signature', required: false },
    ];
    if (existingTemplates.length > 0) {
        for (const tpl of existingTemplates) {
            await (0, pdfTemplateService_1.updateTemplate)(tpl.id, systemUser.id, systemUser.role, {
                name: TEMPLATE_NAME,
                description: TEMPLATE_DESCRIPTION,
                assignedRoles: ['owner', 'hr', 'supervisor'],
                fields,
            });
            console.log(`Updated Niche Buffer Tanks template fields: ${tpl.id} (${tpl.name})`);
        }
        return;
    }
    const created = await (0, pdfTemplateService_1.createCustomTemplate)(systemUser.id, systemUser.role, {
        name: TEMPLATE_NAME,
        description: TEMPLATE_DESCRIPTION,
        assignedRoles: ['owner', 'hr', 'supervisor'],
        fields,
    });
    console.log(`Seeded Niche Buffer Tanks template: ${created.id}`);
}
async function seedNicheAirSeparatorsTemplate() {
    const CUSTOM_TEMPLATE_PREFIX = 'custom-form://';
    const TEMPLATE_NAME = 'Niche Air Separators';
    const TEMPLATE_DESCRIPTION = 'Niche Bakery quarterly air separators inspection with Add In, Location, Line, matrix, notes/comments, and sign-off.';
    const existingTemplates = await prisma_1.prisma.pdfTemplate.findMany({
        where: {
            isActive: true,
            filePath: { startsWith: CUSTOM_TEMPLATE_PREFIX },
            OR: [
                { name: TEMPLATE_NAME },
                { name: { contains: 'niche air separators', mode: 'insensitive' } },
                { name: { contains: 'niche air seporators', mode: 'insensitive' } },
            ],
        },
        select: { id: true, name: true },
    });
    const systemOwner = await prisma_1.prisma.user.findFirst({ where: { role: 'owner' }, select: { id: true, role: true } });
    const systemHr = !systemOwner ? await prisma_1.prisma.user.findFirst({ where: { role: 'hr' }, select: { id: true, role: true } }) : null;
    const systemUser = systemOwner ?? systemHr;
    if (!systemUser?.id || !systemUser.role)
        return;
    const fields = [
        { type: 'TEXT', label: 'Add In', required: false },
        { type: 'TEXT', label: '[JOB_DROPDOWN]Location', required: false },
        { type: 'TEXT', label: 'Line', required: false },
        { type: 'TEXT', label: 'Inspection Rows (fill quarterly findings)', required: false },
        { type: 'TEXT', label: '[SECTION]Notes', required: false },
        { type: 'TEXT', label: 'Notes', required: false },
        { type: 'TEXT', label: 'Comments', required: false },
        { type: 'TEXT', label: '[SECTION]Sign-Off', required: false },
        { type: 'TEXT', label: 'Inspected By', required: false },
        { type: 'DATE', label: 'Date', required: false },
        { type: 'SIGNATURE', label: 'Signature', required: false },
    ];
    if (existingTemplates.length > 0) {
        for (const tpl of existingTemplates) {
            await (0, pdfTemplateService_1.updateTemplate)(tpl.id, systemUser.id, systemUser.role, {
                name: TEMPLATE_NAME,
                description: TEMPLATE_DESCRIPTION,
                assignedRoles: ['owner', 'hr', 'supervisor'],
                fields,
            });
            console.log(`Updated Niche Air Separators template fields: ${tpl.id} (${tpl.name})`);
        }
        return;
    }
    const created = await (0, pdfTemplateService_1.createCustomTemplate)(systemUser.id, systemUser.role, {
        name: TEMPLATE_NAME,
        description: TEMPLATE_DESCRIPTION,
        assignedRoles: ['owner', 'hr', 'supervisor'],
        fields,
    });
    console.log(`Seeded Niche Air Separators template: ${created.id}`);
}
async function seedNicheExpansionTanksTemplate() {
    const CUSTOM_TEMPLATE_PREFIX = 'custom-form://';
    const TEMPLATE_NAME = 'Niche Expansion Tanks';
    const TEMPLATE_DESCRIPTION = 'Niche Bakery quarterly expansion tanks inspection with Add In, Location, Line, matrix, notes/comments, and sign-off.';
    const existingTemplates = await prisma_1.prisma.pdfTemplate.findMany({
        where: {
            isActive: true,
            filePath: { startsWith: CUSTOM_TEMPLATE_PREFIX },
            OR: [
                { name: TEMPLATE_NAME },
                { name: { contains: 'niche expansion tanks', mode: 'insensitive' } },
            ],
        },
        select: { id: true, name: true },
    });
    const systemOwner = await prisma_1.prisma.user.findFirst({ where: { role: 'owner' }, select: { id: true, role: true } });
    const systemHr = !systemOwner ? await prisma_1.prisma.user.findFirst({ where: { role: 'hr' }, select: { id: true, role: true } }) : null;
    const systemUser = systemOwner ?? systemHr;
    if (!systemUser?.id || !systemUser.role)
        return;
    const fields = [
        { type: 'TEXT', label: 'Add In', required: false },
        { type: 'TEXT', label: '[JOB_DROPDOWN]Location', required: false },
        { type: 'TEXT', label: 'Line', required: false },
        { type: 'TEXT', label: 'Inspection Rows (fill quarterly findings)', required: false },
        { type: 'TEXT', label: '[SECTION]Notes', required: false },
        { type: 'TEXT', label: 'Notes', required: false },
        { type: 'TEXT', label: 'Comments', required: false },
        { type: 'TEXT', label: '[SECTION]Sign-Off', required: false },
        { type: 'TEXT', label: 'Inspected By', required: false },
        { type: 'DATE', label: 'Date', required: false },
        { type: 'SIGNATURE', label: 'Signature', required: false },
    ];
    if (existingTemplates.length > 0) {
        for (const tpl of existingTemplates) {
            await (0, pdfTemplateService_1.updateTemplate)(tpl.id, systemUser.id, systemUser.role, {
                name: TEMPLATE_NAME,
                description: TEMPLATE_DESCRIPTION,
                assignedRoles: ['owner', 'hr', 'supervisor'],
                fields,
            });
            console.log(`Updated Niche Expansion Tanks template fields: ${tpl.id} (${tpl.name})`);
        }
        return;
    }
    const created = await (0, pdfTemplateService_1.createCustomTemplate)(systemUser.id, systemUser.role, {
        name: TEMPLATE_NAME,
        description: TEMPLATE_DESCRIPTION,
        assignedRoles: ['owner', 'hr', 'supervisor'],
        fields,
    });
    console.log(`Seeded Niche Expansion Tanks template: ${created.id}`);
}
async function seedNichePumpsTemplate() {
    const CUSTOM_TEMPLATE_PREFIX = 'custom-form://';
    const TEMPLATE_NAME = 'Niche Pumps';
    const TEMPLATE_DESCRIPTION = 'Niche Bakery quarterly pumps inspection with Add In, Location, Line, matrix, notes/comments, and sign-off.';
    const existingTemplates = await prisma_1.prisma.pdfTemplate.findMany({
        where: {
            isActive: true,
            filePath: { startsWith: CUSTOM_TEMPLATE_PREFIX },
            OR: [
                { name: TEMPLATE_NAME },
                { name: { contains: 'niche pumps', mode: 'insensitive' } },
            ],
        },
        select: { id: true, name: true },
    });
    const systemOwner = await prisma_1.prisma.user.findFirst({ where: { role: 'owner' }, select: { id: true, role: true } });
    const systemHr = !systemOwner ? await prisma_1.prisma.user.findFirst({ where: { role: 'hr' }, select: { id: true, role: true } }) : null;
    const systemUser = systemOwner ?? systemHr;
    if (!systemUser?.id || !systemUser.role)
        return;
    const fields = [
        { type: 'TEXT', label: 'Add In', required: false },
        { type: 'TEXT', label: '[JOB_DROPDOWN]Location', required: false },
        { type: 'TEXT', label: 'Line', required: false },
        { type: 'TEXT', label: 'Inspection Rows (fill quarterly findings)', required: false },
        { type: 'TEXT', label: '[SECTION]Notes', required: false },
        { type: 'TEXT', label: 'Notes', required: false },
        { type: 'TEXT', label: 'Comments', required: false },
        { type: 'TEXT', label: '[SECTION]Sign-Off', required: false },
        { type: 'TEXT', label: 'Inspected By', required: false },
        { type: 'DATE', label: 'Date', required: false },
        { type: 'SIGNATURE', label: 'Signature', required: false },
    ];
    if (existingTemplates.length > 0) {
        for (const tpl of existingTemplates) {
            await (0, pdfTemplateService_1.updateTemplate)(tpl.id, systemUser.id, systemUser.role, {
                name: TEMPLATE_NAME,
                description: TEMPLATE_DESCRIPTION,
                assignedRoles: ['owner', 'hr', 'supervisor'],
                fields,
            });
            console.log(`Updated Niche Pumps template fields: ${tpl.id} (${tpl.name})`);
        }
        return;
    }
    const created = await (0, pdfTemplateService_1.createCustomTemplate)(systemUser.id, systemUser.role, {
        name: TEMPLATE_NAME,
        description: TEMPLATE_DESCRIPTION,
        assignedRoles: ['owner', 'hr', 'supervisor'],
        fields,
    });
    console.log(`Seeded Niche Pumps template: ${created.id}`);
}
async function seedTestingVerificationProcedureDefTemplate() {
    const CUSTOM_TEMPLATE_PREFIX = 'custom-form://';
    const TEMPLATE_NAME = 'Testing and Verification Procedure DEF';
    const TEMPLATE_DESCRIPTION = 'Large multi-page DEF testing and verification checklist with component matrix, section separators, and sign-off.';
    const existingTemplates = await prisma_1.prisma.pdfTemplate.findMany({
        where: {
            isActive: true,
            filePath: { startsWith: CUSTOM_TEMPLATE_PREFIX },
            OR: [
                { name: TEMPLATE_NAME },
                { name: { contains: 'testing and verification procedure def', mode: 'insensitive' } },
            ],
        },
        select: { id: true, name: true },
    });
    const systemOwner = await prisma_1.prisma.user.findFirst({ where: { role: 'owner' }, select: { id: true, role: true } });
    const systemHr = !systemOwner ? await prisma_1.prisma.user.findFirst({ where: { role: 'hr' }, select: { id: true, role: true } }) : null;
    const systemUser = systemOwner ?? systemHr;
    if (!systemUser?.id || !systemUser.role)
        return;
    const fields = [
        { type: 'TEXT', label: '[SECTION]Header', required: false },
        { type: 'TEXT', label: '[JOB_DROPDOWN]Project/Site', required: false },
        { type: 'TEXT', label: 'Building/Location', required: false },
        { type: 'TEXT', label: 'Piping System', required: false },
        { type: 'DATE', label: 'Date', required: false },
        { type: 'TEXT', label: '[SECTION]Testing and Verification Procedure DEF', required: false },
        { type: 'TEXT', label: 'DEF Verification Matrix Checklist', required: false },
        { type: 'TEXT', label: '[SECTION]Sign-Off', required: false },
        { type: 'TEXT', label: 'Review Note', required: false },
        { type: 'TEXT', label: 'Inspected By', required: false },
        { type: 'TEXT', label: 'Completed By', required: false },
        { type: 'DATE', label: 'Completion Date', required: false },
    ];
    if (existingTemplates.length > 0) {
        for (const tpl of existingTemplates) {
            await (0, pdfTemplateService_1.updateTemplate)(tpl.id, systemUser.id, systemUser.role, {
                name: TEMPLATE_NAME,
                description: TEMPLATE_DESCRIPTION,
                assignedRoles: ['owner', 'hr', 'supervisor'],
                fields,
            });
            console.log(`Updated Testing and Verification Procedure DEF template fields: ${tpl.id} (${tpl.name})`);
        }
        return;
    }
    const created = await (0, pdfTemplateService_1.createCustomTemplate)(systemUser.id, systemUser.role, {
        name: TEMPLATE_NAME,
        description: TEMPLATE_DESCRIPTION,
        assignedRoles: ['owner', 'hr', 'supervisor'],
        fields,
    });
    console.log(`Seeded Testing and Verification Procedure DEF template: ${created.id}`);
}
async function seedInterim2PmChecklistTemplate() {
    const CUSTOM_TEMPLATE_PREFIX = 'custom-form://';
    const TEMPLATE_NAME = interim2PmChecklistFields_1.INTERIM2_PM_TEMPLATE_NAME;
    const TEMPLATE_DESCRIPTION = 'VIA RAIL TMC INTERIM 2 preventative maintenance checklist (19 pages: DEF, Sanding, and WWF systems). Site copy V1.1 — reference PDF available for download.';
    const existingTemplates = await prisma_1.prisma.pdfTemplate.findMany({
        where: {
            isActive: true,
            filePath: { startsWith: CUSTOM_TEMPLATE_PREFIX },
            OR: [
                { name: TEMPLATE_NAME },
                { name: { contains: 'interim 2 pm checklist', mode: 'insensitive' } },
            ],
        },
        select: { id: true, name: true },
    });
    const systemOwner = await prisma_1.prisma.user.findFirst({ where: { role: 'owner' }, select: { id: true, role: true } });
    const systemHr = !systemOwner ? await prisma_1.prisma.user.findFirst({ where: { role: 'hr' }, select: { id: true, role: true } }) : null;
    const systemUser = systemOwner ?? systemHr;
    if (!systemUser?.id || !systemUser.role)
        return;
    const fields = (0, interim2PmChecklistFields_1.buildInterim2PmChecklistFields)();
    if (existingTemplates.length > 0) {
        for (const tpl of existingTemplates) {
            await (0, pdfTemplateService_1.updateTemplate)(tpl.id, systemUser.id, systemUser.role, {
                name: TEMPLATE_NAME,
                description: TEMPLATE_DESCRIPTION,
                assignedRoles: ['owner', 'hr', 'supervisor', 'labourer'],
                fields,
            });
            console.log(`Updated INTERIM 2 PM Checklist template fields: ${tpl.id} (${tpl.name})`);
        }
        return;
    }
    const created = await (0, pdfTemplateService_1.createCustomTemplate)(systemUser.id, systemUser.role, {
        name: TEMPLATE_NAME,
        description: TEMPLATE_DESCRIPTION,
        assignedRoles: ['owner', 'hr', 'supervisor', 'labourer'],
        fields,
    });
    console.log(`Seeded INTERIM 2 PM Checklist template: ${created.id}`);
}
async function ensureCoreFormRoleAccess() {
    const requiredRoles = ['supervisor', 'labourer'];
    const targetTemplates = await prisma_1.prisma.pdfTemplate.findMany({
        where: {
            isActive: true,
            OR: [
                { name: { contains: 'hot work', mode: 'insensitive' } },
                { name: { contains: 'lock-out', mode: 'insensitive' } },
                { name: { contains: 'lock out', mode: 'insensitive' } },
                { name: { contains: 'lockout', mode: 'insensitive' } },
                { name: { contains: 'tag-out', mode: 'insensitive' } },
                { name: { contains: 'tag out', mode: 'insensitive' } },
                { name: { contains: 'tagout', mode: 'insensitive' } },
                { name: { contains: 'toolbox', mode: 'insensitive' } },
                { name: { contains: 'tool box', mode: 'insensitive' } },
                { name: { contains: 'fall arrest', mode: 'insensitive' } },
                { name: { contains: 'pressure testing', mode: 'insensitive' } },
                { name: { contains: 'active pipeline', mode: 'insensitive' } },
                { name: { contains: 'drain and vent', mode: 'insensitive' } },
                { name: { contains: 'niche water softener', mode: 'insensitive' } },
                { name: { contains: 'niche air seporators', mode: 'insensitive' } },
                { name: { contains: 'niche air separators', mode: 'insensitive' } },
                { name: { contains: 'niche buffer tanks', mode: 'insensitive' } },
                { name: { contains: 'niche expansion tanks', mode: 'insensitive' } },
                { name: { contains: 'niche pumps', mode: 'insensitive' } },
                { name: { contains: 'testing and verification procedure def', mode: 'insensitive' } },
                { name: { contains: 'interim 2 pm checklist', mode: 'insensitive' } },
            ],
        },
        select: { id: true, name: true, assignedRoles: true },
    });
    for (const template of targetTemplates) {
        const currentRoles = Array.isArray(template.assignedRoles)
            ? template.assignedRoles.map((r) => String(r).toLowerCase())
            : [];
        const mergedRoles = Array.from(new Set([...currentRoles, ...requiredRoles]));
        const changed = mergedRoles.length !== currentRoles.length
            || mergedRoles.some((role, idx) => role !== currentRoles[idx]);
        if (!changed)
            continue;
        await prisma_1.prisma.pdfTemplate.update({
            where: { id: template.id },
            data: { assignedRoles: mergedRoles },
        });
        console.log(`Updated template role access (${template.name}): ${mergedRoles.join(', ')}`);
    }
}
const PORT = process.env.PORT || 3000;
seedToolboxTalkNativeTemplate().catch((err) => {
    console.error('Toolbox Talk native template seed failed:', err);
});
seedNearMissNativeTemplate().catch((err) => {
    console.error('Near Miss native template seed failed:', err);
});
seedWeeklyProjectInspectionNativeTemplate().catch((err) => {
    console.error('Weekly Inspection native template seed failed:', err);
});
seedPowerElevatingWorkPlatformsTemplate().catch((err) => {
    console.error('Power Elevating / Work Platforms native template seed failed:', err);
});
seedEquipmentInspectionChecklistTemplate().catch((err) => {
    console.error('Equipment Inspection Checklist template seed failed:', err);
});
seedLegislativeComplianceEvaluationTemplate().catch((err) => {
    console.error('Legislative Compliance Evaluation template seed failed:', err);
});
seedCriticalTaskInventoryRiskRegisterTemplate().catch((err) => {
    console.error('Critical Task Inventory & Risk Register template seed failed:', err);
});
seedConfinedSpaceEntryPermitTemplate().catch((err) => {
    console.error('Confined Space Entry Permit template seed failed:', err);
});
seedFallArrestInspectionChecklistTemplate().catch((err) => {
    console.error('Fall Arrest Inspection Checklist template seed failed:', err);
});
seedWashroomInspectionChecklistTemplate().catch((err) => {
    console.error('Washroom Inspection Checklist template seed failed:', err);
});
seedPressureTestingChecklistTemplate().catch((err) => {
    console.error('Pressure Testing Checklist template seed failed:', err);
});
seedActivePipelineConnectionsHydrocarbonsTemplate().catch((err) => {
    console.error('Active Pipeline Connections — Hydrocarbons template seed failed:', err);
});
seedDrainAndVentTestFormTemplate().catch((err) => {
    console.error('Drain and Vent Test Form template seed failed:', err);
});
seedNicheBufferTanksTemplate().catch((err) => {
    console.error('Niche Buffer Tanks template seed failed:', err);
});
seedNicheAirSeparatorsTemplate().catch((err) => {
    console.error('Niche Air Separators template seed failed:', err);
});
seedNicheExpansionTanksTemplate().catch((err) => {
    console.error('Niche Expansion Tanks template seed failed:', err);
});
seedNichePumpsTemplate().catch((err) => {
    console.error('Niche Pumps template seed failed:', err);
});
seedTestingVerificationProcedureDefTemplate().catch((err) => {
    console.error('Testing and Verification Procedure DEF template seed failed:', err);
});
seedInterim2PmChecklistTemplate().catch((err) => {
    console.error('INTERIM 2 PM Checklist template seed failed:', err);
});
ensureCoreFormRoleAccess().catch((err) => {
    console.error('Core form role-access update failed:', err);
});
async function startServer() {
    if (process.env.NODE_ENV !== 'production' && process.env.SKIP_DB_STARTUP_CHECK !== '1') {
        const ms = 10000;
        try {
            await Promise.race([
                (async () => {
                    await prisma_1.prisma.$connect();
                    await prisma_1.prisma.$queryRaw `SELECT 1`;
                })(),
                new Promise((_, rej) => {
                    setTimeout(() => rej(new Error(`database not reachable within ${ms}ms`)), ms);
                }),
            ]);
        }
        catch (e) {
            console.error('\n❌ DATABASE (startup check): could not connect or run a test query in time.');
            console.error('   Set DATABASE_URL in maxim-backend/.env to a running PostgreSQL instance.');
            console.error('   Tip: append ?connect_timeout=8 to the URL so unreachable hosts fail faster.');
            console.error('   To start the API without this check: SKIP_DB_STARTUP_CHECK=1\n');
            console.error(e);
            process.exit(1);
        }
    }
    app.listen(PORT, () => {
        console.log(`🚀 Maxim Backend Server running on port ${PORT}`);
    });
    (0, notificationEmailQueue_1.startNotificationEmailWorker)();
    (0, incomingInvoiceIngestionService_1.startIncomingInvoiceWorker)();
    (0, outgoingInvoiceIngestionService_1.startOutgoingInvoiceWorker)();
    (0, outgoingInvoiceReminderService_1.startOutgoingInvoiceReminderWorker)();
    (0, expiryNotificationService_1.startExpiryNotificationWorker)();
    (0, formsApprovalDigestService_1.startFormsApprovalDigestWorker)();
    (0, nicheBakeryReminderService_1.startNicheBakeryReminderWorker)();
}
void startServer();
