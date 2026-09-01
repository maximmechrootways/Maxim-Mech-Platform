export type UserRole = 'owner' | 'hr' | 'supervisor' | 'labourer'

export interface KissOptions {
  largeTouchTargets: boolean
  guidedStepMode: boolean
  simplifiedNav: boolean
  showOnlyRequiredFirst: boolean
}

export interface NotificationPreferences {
  forms_pending: boolean
  incidents: boolean
  digest: boolean
  digest_hr_owner_8am: boolean
  signatures: boolean
  incidents_site: boolean
  signature_required: boolean
  announcements: boolean
}

export interface UiPreferences {
  kissModeEnabled: boolean
  kissPresetName: string | null
  kissOptions: KissOptions
  notificationPreferences?: NotificationPreferences
}

/* ── Phase 1: Authentication & Session Management ─────────────── */

/** New role hierarchy for Phase 1 auth (viewer → editor → admin → owner) */
export type AuthRole = 'viewer' | 'editor' | 'admin' | 'owner'

/** Decoded JWT payload */
export interface JWTPayload {
  sub: string
  name: string
  email: string
  role: AuthRole
  iat: number
  exp: number
}

/** Session (cookie-based auth: no jwt in frontend; server uses HttpOnly cookies) */
export interface Session {
  id: string
  userId: string
  userName: string
  userEmail: string
  /** Current view role (for routing/UI); owner can switch this. */
  role: AuthRole
  /** Actual role from JWT; only owner can have role !== actualRole. Used so owner can switch back from labourer view. */
  actualRole?: AuthRole
  /** Not set when using HttpOnly cookie auth */
  jwt?: string
  jwtPayload?: JWTPayload
  issuedAt: string
  expiresAt: string
  ttl: number
  heartbeatLastPing: string
  heartbeatStatus: 'connected' | 'degraded' | 'disconnected'
  status: 'active' | 'expired' | 'revoked'
  hasCompletedSetup: boolean
  uiPreferences?: UiPreferences
}

/* ── End Phase 1 types ──────────────────────────────────────────── */

export interface User {
  id: string
  name: string
  email: string
  /** Current view role (for routing/UI). */
  role: UserRole
  /** Actual role from JWT; only owner has role !== actualRole. Enables owner to always switch back. */
  actualRole?: UserRole
  avatar?: string
  active: boolean
  uiPreferences?: UiPreferences
}

export interface NotificationItem {
  id: string
  title: string
  body: string
  read: boolean
  createdAt: string
  type: 'info' | 'alert' | 'reminder'
  /** Route to open when the notification is clicked (e.g. /forms/f1, /signing/sr1) */
  linkTo?: string
}

/** Compliance / audit status for H&S forms. HR has final authority for approval and archival. */
export type FormSubmissionStatus = 'draft' | 'pending_site_signatures' | 'submitted' | 'approved' | 'rejected' | 'archived'

export interface FormSubmissionAttachment {
  id: string
  name: string
  type: 'photo' | 'document'
  url?: string
  /** Inline PDF/image data URL for viewing in the app without download. */
  fileDataUrl?: string
  uploadedAt?: string
}

export interface FormSubmissionSigner {
  id: string
  name: string
  role: string
  status: 'pending' | 'signed'
  signedAt?: string
}

export interface FormAuditEvent {
  id: string
  type: 'draft_created' | 'submitted' | 'review_started' | 'approved' | 'rejected' | 'archived' | 'site_signed' | 'sent_to_hr'
  at: string
  by: string
  comment?: string
}

export interface FormSubmission {
  id: string
  templateId: string
  templateName: string
  status: FormSubmissionStatus
  submittedAt?: string
  submittedBy?: string
  reviewedAt?: string
  reviewedBy?: string
  reviewComment?: string
  siteId?: string
  siteName?: string
  /** Attached photos or documents */
  attachments?: FormSubmissionAttachment[]
  /** Who signed and who is pending; timestamps for signed */
  signatures?: FormSubmissionSigner[]
  /** Full audit trail: draft creation, submission, reviews, approvals/rejections */
  auditEvents?: FormAuditEvent[]
  /** Set by HR only when form is archived */
  archivedAt?: string
  archivedBy?: string
  /** Site meeting workflow: H&S rep fills → site personnel sign → then sent to HR */
  workflowType?: 'standard' | 'site_meeting'
  /** User IDs of site personnel who must sign (site_meeting only) */
  siteSignerIds?: string[]
  /** Signatures from site personnel: userId and signedAt */
  siteSignatures?: { userId: string; signedAt: string }[]
  /** When all site signers have signed and form was sent to HR */
  submittedToHrAt?: string
  /** Field values from form fill (e.g. risk likelihood/impact for hazards) */
  fieldValues?: Record<string, string | number | boolean>
  /** When the form was last opened (for multi-HR awareness) */
  lastOpenedAt?: string
  lastOpenedBy?: string
  /** When the form was last edited (e.g. status/review) and by whom */
  lastEditedAt?: string
  lastEditedBy?: string
}

/** Category for filtering safety/form lists. HR creates templates with these types. */
export type FormTemplateCategory = 'incident' | 'near_miss' | 'hazard' | 'site_inspection' | 'site_meeting' | 'injury' | 'other'

export interface FormTemplate {
  id: string
  name: string
  description: string
  sections: FormSection[]
  version: number
  archived: boolean
  /** Used to show this template in the right safety list (e.g. near-miss reports, hazard register). */
  category?: FormTemplateCategory
  /** Optional regulatory reference (e.g. OSHA 301, Provincial OHS s. X) */
  regulatoryRef?: string
  /** Version history for compliance (changedAt, changedBy, snapshot) */
  versionHistory?: { version: number; changedAt: string; changedBy: string; snapshot: { name: string; sections: FormSection[] } }[]
}

export interface FormSection {
  id: string
  title: string
  fields: FormField[]
}

export interface FormField {
  id: string
  type: 'text' | 'textarea' | 'checkbox' | 'photo' | 'date' | 'time'
  label: string
  required?: boolean
  value?: string | boolean
}

export interface SignatureRequestSigner {
  id: string
  name: string
  role: string
  status: 'pending' | 'signed'
  userId?: string
  signedAt?: string
}

export interface SignatureRequest {
  id: string
  documentName: string
  requiredSigners: SignatureRequestSigner[]
  dueDate: string
  remindersSent: number
}

/** Who can view: everyone, or restricted to specific roles + optional specific user IDs (e.g. submitter) */
export type DocumentVisibility = 'everyone' | 'restricted'

export interface DocumentRecord {
  id: string
  name: string
  type: string
  siteId?: string
  siteName?: string
  date: string
  uploadedBy?: string
  /** @deprecated use visibility + visibleToRoles instead */
  roleRestricted?: UserRole[]
  /** When 'everyone', all users see it (e.g. safety handbook). When 'restricted', only visibleToRoles + visibleToUserIds can see. */
  visibility?: DocumentVisibility
  /** When visibility is 'restricted', which roles can view (e.g. owner, hr). */
  visibleToRoles?: UserRole[]
  /** When visibility is 'restricted', which user IDs can view (e.g. the supervisor who submitted the form). */
  visibleToUserIds?: string[]
  /** Inline PDF data URL for viewing in the app without download (optional). */
  fileDataUrl?: string
  /** URL or path pointing to the file stored in the backend */
  filePath?: string
  /** When type is SOP: tags for filtering (site, role, hazard type) */
  tags?: string[]
  /** SOP acknowledgements: userId and date */
  acknowledgedBy?: { userId: string; acknowledgedAt: string }[]
  /** SOP version for re-acknowledgement when updated */
  version?: number
  /** When the document was last opened (for multi-HR awareness) */
  lastOpenedAt?: string
  lastOpenedBy?: string
  /** When the document was last edited and by whom */
  lastEditedAt?: string
  lastEditedBy?: string
}

export interface IncidentRecord {
  id: string
  title: string
  siteName: string
  date: string
  status: string
  severity?: 'low' | 'medium' | 'high'
  /** Classification for analytics and regulatory reporting */
  incidentType?: 'injury' | 'near-miss' | 'property-damage' | 'environmental' | 'other'
  severityLevel?: 1 | 2 | 3 | 4 | 5
  equipmentInvolved?: string
}

export interface EmailThread {
  id: string
  subject: string
  messages: { id: string; from: string; body: string; date: string; attachments?: string[] }[]
  status: 'new' | 'replied' | 'resolved'
  linkedRecordId?: string
}

export interface JobEntry {
  id: string
  source: string
  title: string
  fields: Record<string, string>
  status: 'pending' | 'approved' | 'discarded'
  emailId?: string
}

/** PDF document scanned/uploaded by HR for use as a form base */
export interface ScannedPdfDocument {
  id: string
  name: string
  uploadedAt: string
  uploadedBy: string
  /** URL or blob id for the file */
  fileUrl?: string
}

/** A field HR places on a PDF form for the user to fill (text, date, or signature). Position as % of page (0–100). */
export interface PlacedFormField {
  id: string
  type: 'text' | 'date' | 'signature' | 'checkbox'
  label: string
  required?: boolean
  /** Page number (1-based). */
  page?: number
  /** Left position as % of page width (0–100). */
  x?: number
  /** Top position as % of page height (0–100). */
  y?: number
  /** Width as % of page width (0–100). */
  width?: number
  /** Height as % of page height (0–100). */
  height?: number
}

/** HR-created form template: either from scratch or from a scanned PDF with placed fields */
export interface SignableFormTemplate {
  id: string
  name: string
  description: string
  /** Assign by role: everyone with this role gets the form */
  assignedToRoles: UserRole[]
  /** Assign to specific users (HR can assign to anybody). When set, those users get the form in addition to/instead of role-based. */
  assignedToUserIds?: string[]
  schedule: 'daily' | 'weekly' | 'monthly' | 'once'
  createdAt: string
  createdBy: string
  active: boolean
  /** If set, this form is based on a scanned PDF; HR added fields to fill */
  sourcePdfId?: string
  /** Fields HR added (for PDF-based forms). Order = display order when filling. */
  placedFields?: PlacedFormField[]
}

/** A concrete instance of a form (daily/weekly/monthly) a user must fill out and sign */
export interface DailyFormToComplete {
  id: string
  signableFormId: string
  templateName: string
  dueDate: string
  status: 'pending' | 'filled' | 'signed'
  /** When set, only this user sees this instance (form assigned to specific person). */
  assignedToUserId?: string
  /** Role that sees this instance when assignedToUserId is not set. */
  assignedToRole: UserRole
  /** Which tab to show in (daily/monthly/yearly); from template or from supervisor assignment. */
  schedule?: string
  /** If this form was passed along, the field values from the previous person */
  formDataSnapshot?: Record<string, string>
  /** The assignment ID this was passed from */
  passedFromId?: string
}

/** A submitted signable form: field values, signature, and geo-tagged */
export interface SignableFormSubmission {
  id: string
  signableFormId: string
  templateName: string
  dailyFormId: string
  /** User ID of who created/sent the form (supervisor for site_meeting) */
  submittedById?: string
  submittedBy: string
  submittedAt: string
  /** Values for each placed field (field id -> value) */
  fieldValues: Record<string, string>
  /** Signature: typed name (signature by text) */
  signatureText: string
  /** Geo at time of submission */
  geoLat?: number
  geoLng?: number
  geoAddress?: string
  /** When supervisor sends to labourers: labourers must also sign */
  workflowType?: 'standard' | 'site_meeting'
  /** User IDs of labourers who must sign (site_meeting only) */
  siteSignerIds?: string[]
  /** Signatures from labourers: userId, signedAt, optional signatureText (typed name) */
  siteSignatures?: { userId: string; signedAt: string; signatureText?: string }[]
  /** When all signers (including supervisor) have signed and form was sent to HR */
  submittedToHrAt?: string
  /** Display names for siteSignerIds (from API) */
  siteSignerNames?: Record<string, string>
}

/** Subcontractor company — HR tracks company, contact, contract, insurance, and certs */
export interface Subcontractor {
  id: string
  companyName: string
  officeContactName: string
  officeContactEmail: string
  officeContactPhone?: string
  siteContactName?: string
  siteContactEmail?: string
  siteContactPhone?: string
  status: 'active' | 'inactive'
  compliance?: { score: number; status: string }
  notes?: string
  /** Array of multiple insurance policies */
  insurances?: {
    id: string
    type: string
    policyNumber?: string
    expiresAt?: string
    filePath?: string
    originalName?: string
  }[]
  /** WSIB Injury Summary Report */
  wsibInjuryReportOptional?: boolean
  /** WSIB Clearance (insurance) — when optional, excluded from compliance */
  wsibClearanceOptional?: boolean
  /** FORM 1000 — when optional, excluded from compliance */
  form1000Optional?: boolean
  wsibInjuryReportPath?: string
  wsibInjuryReportOriginalName?: string
  /** HR Safety Agreement */
  hrSafetyAgreementPath?: string
  hrSafetyAgreementOriginalName?: string
  /** Health & Safety Manual */
  usingMaximHSManual?: boolean
  hsPdfFilePath?: string
  hsPdfOriginalName?: string
  /** FORM 1000 */
  form1000Path?: string
  form1000OriginalName?: string
  /** When the subcontractor was last opened (for multi-HR awareness) */
  lastOpenedAt?: string
  lastOpenedBy?: string
  /** When the subcontractor was last edited and by whom */
  lastEditedAt?: string
  lastEditedBy?: string
}

/** Subcontractor detail data for HR view */
export interface SubcontractorDetailData extends Omit<Subcontractor, 'lastOpenedAt' | 'lastOpenedBy' | 'lastEditedAt' | 'lastEditedBy' | 'notes'> {
  contracts: SubcontractorContract[]
  certifications: SubcontractorCertification[]
  jobAssignments: SubcontractorJobAssignment[]
  personnel: SubcontractorPersonnel[]
}

/** Certification held by a subcontractor (company-level or key person); expiration tracked */
export interface SubcontractorCertification {
  id: string
  subcontractorId: string
  name: string
  issuedAt: string
  expiresAt: string
  status: 'current' | 'expiring-soon' | 'expired'
  /** Optional PDF for audit; filename and file path */
  fileName?: string
  filePath?: string
}

/** Subcontractor assigned to a job/site */
export interface SubcontractorJobAssignment {
  id: string
  jobId: string
  subcontractorId: string
  assignedBy: string
  assignedAt: string
}

/** Multiple uploaded contracts per subcontractor */
export interface SubcontractorContract {
  id: string
  subcontractorId: string
  personnelId?: string
  startDate: string
  endDate?: string
  filePath: string
  originalName: string
  uploadedAt: string
}

/** Contractor worker (person) belonging to a subcontractor company; contractors do not log in */
export interface SubcontractorPersonnel {
  id: string
  subcontractorId: string
  name: string
  email?: string
  /** When true, shown as supervisor in contractor personnel list */
  isSupervisor?: boolean
  /** Personnel status: active, on-leave, inactive, terminated */
  status?: 'active' | 'on-leave' | 'inactive' | 'terminated'
  /** Company-level orientation location */
  orientationLocation?: string
  /** Company-level orientation completed at */
  orientationCompletedAt?: string
}

/** Certification for an individual contractor worker */
export interface SubcontractorPersonnelCertification {
  id: string
  personnelId: string
  /** Set when present on API list payload; can be derived from `personnelId` + personnel parent */
  subcontractorId?: string
  name: string
  issuedAt: string
  expiresAt: string
  status: 'current' | 'expiring-soon' | 'expired'
  /** Optional PDF for audit; filename and file path */
  fileName?: string
  filePath?: string
}

/** Contractor worker document (e.g. contract) */
export interface SubcontractorPersonnelDocument {
  id: string
  personnelId: string
  name: string
  category: string
  filePath: string
  uploadedAt: string
}

/** Contractor worker assigned to a specific job (which of their guys are on which job) */
export interface SubcontractorPersonnelJobAssignment {
  id: string
  personnelId: string
  jobId: string
  assignedAt: string
  orientationCompletedAt?: string
}

/** On-site check-in for a contractor worker (supervisor/HR marks who is on site) */
export interface SubcontractorPersonnelCheckIn {
  id: string
  personnelId: string
  jobId: string
  date: string
  checkedInAt: string | null
  checkedOutAt: string | null
}

/** Our employee — HR tracks licenses, contact, hiring, training, documents, time off */
export interface Employee {
  id: string
  firstName: string
  lastName: string
  email: string
  phone?: string
  /** Employee date of birth (YYYY-MM-DD calendar day) */
  birthday?: string
  /** Emergency contact #1 name (optional) */
  emergencyContact1Name?: string
  /** Emergency contact #1 phone (optional) */
  emergencyContact1Phone?: string
  /** Relationship to employee (e.g. spouse, parent) */
  emergencyContact1Relationship?: string
  /** Emergency contact #2 name (optional) */
  emergencyContact2Name?: string
  /** Emergency contact #2 phone (optional) */
  emergencyContact2Phone?: string
  /** Relationship to employee for contact #2 */
  emergencyContact2Relationship?: string
  /** Additional emergency notes/conditions (optional) */
  emergencyNotes?: string
  jobTitle?: string
  department?: string
  hireDate: string
  status: 'active' | 'on-leave' | 'terminated'
  /** Role from API (owner | hr | supervisor | labourer) for list filtering */
  role?: string
  /** When status is on-leave: date they went on leave (ISO date string) */
  onLeaveStartedAt?: string
  /** When status is terminated: date of termination (ISO date string) */
  terminatedAt?: string
  /** Licenses and certificates (name, expiry) */
  licenses?: { name: string; issuedAt?: string; expiresAt: string }[]
  /** Training completed (name, completedAt) */
  trainingCompleted?: { name: string; completedAt: string }[]
  /** Hiring documents (name, uploadedAt) */
  hiringDocuments?: { id: string; name: string; uploadedAt: string }[]
  /** Job assignments for labourers */
  jobAssignments?: { id: string; jobId: string; jobTitle?: string; siteName?: string }[]
  /** Job assignments for supervisors */
  jobSupervisorLinks?: { id: string; jobId: string; jobTitle?: string; siteName?: string }[]
  /** Time off / vacation / sick */
  timeOffEntries?: {
    id: string
    type: 'vacation' | 'time-off' | 'sick' | 'other'
    startDate: string
    endDate: string
    notes?: string
    compensation?: 'paid' | 'unpaid'
  }[]
  createdAt?: string
  updatedAt?: string
}

/** Job/site assignment — created by Owner or HR; supervisor and labourers assigned */
export interface Job {
  id: string
  title: string
  siteName: string
  status: 'active' | 'completed' | 'on-hold'
  /** Multiple supervisors can be assigned to a single job. */
  assignedSupervisorIds: string[]
  createdBy: string
  createdAt: string
}

/** Labourer assigned to a job (by Owner/HR or by Supervisor) */
export interface JobAssignment {
  id: string
  jobId: string
  userId: string
  assignedBy: string
  assignedAt: string
}

/** Check-in for a labourer on a job for a given day */
export interface JobCheckIn {
  id: string
  jobId: string
  userId: string
  date: string
  checkedInAt: string | null
  checkedOutAt: string | null
}

/** Injury report — HR goes in depth; links to job/site; may have WSIB/workers' comp */
/** Injury type for classification and metrics */
export type InjuryType = 'laceration' | 'fracture' | 'strain' | 'sprain' | 'burn' | 'contusion' | 'amputation' | 'puncture' | 'other'
/** Body part affected */
export type BodyPart = 'hand' | 'finger' | 'arm' | 'back' | 'shoulder' | 'head' | 'eye' | 'leg' | 'knee' | 'foot' | 'torso' | 'other'
/** Mechanism of injury (OSHA-style) */
export type InjuryMechanism = 'struck-by' | 'struck-against' | 'caught-in' | 'fall-same-level' | 'fall-elevation' | 'overexertion' | 'contact-with' | 'exposure' | 'other'

export interface InjuryReport {
  id: string
  jobId?: string
  siteName: string
  reportedBy: string
  reportedAt: string
  status: 'draft' | 'submitted' | 'under-review' | 'closed'
  severity: 'minor' | 'moderate' | 'major'
  description: string
  followUpNotes?: string
  /** Who was injured (for tracking individuals) */
  injuredPersonName?: string
  injuredPersonId?: string
  /** Classification for metrics */
  injuryType?: InjuryType
  bodyPart?: BodyPart
  mechanism?: InjuryMechanism
  /** Date injury occurred (may differ from reportedAt) */
  dateOfInjury?: string
  /** Lost time injury */
  lostTime?: boolean
  daysAwayFromWork?: number
  restrictedDutyDays?: number
  /** WSIB / workers' comp workflow */
  wsibReported?: boolean
  wsibClaimNumber?: string
  wsibReportedAt?: string
  /** Root cause analysis id if completed */
  rootCauseId?: string
  /** Optional photo (URL or data URL) of scene/injury */
  photoUrl?: string
  /** When injury involves a subcontractor worker */
  subcontractorId?: string
}

/** Near-miss report — separate from injury; track and close */
export interface NearMissReport {
  id: string
  siteName: string
  reportedBy: string
  reportedAt: string
  description: string
  status: 'open' | 'under-review' | 'closed'
  followUpNotes?: string
}

/** Risk level from likelihood × impact (1–5 each) */
export type RiskLevel = 'low' | 'medium' | 'high' | 'critical'

/** Control measure for a hazard */
export interface HazardControl {
  id: string
  description: string
  status: 'open' | 'in-progress' | 'completed'
  completedAt?: string
}

/** Hazard register entry */
export interface HazardReport {
  id: string
  siteName: string
  jobId?: string
  title: string
  description: string
  reportedBy: string
  reportedAt: string
  status: 'open' | 'in-progress' | 'closed'
  assignedTo?: string
  dueDate?: string
  closedAt?: string
  /** Risk scoring 1–5 */
  likelihood?: number
  impact?: number
  riskLevel?: RiskLevel
  recommendedControls?: HazardControl[]
}

/** Safety observation (positive or corrective) */
export interface SafetyObservation {
  id: string
  siteName: string
  type: 'positive' | 'corrective'
  description: string
  observedBy: string
  observedAt: string
  photoUrl?: string
}

/** Training or certification with expiry */
export interface TrainingCertification {
  id: string
  userId: string
  userName: string
  name: string
  type: 'first-aid' | 'whmis' | 'working-at-heights' | 'other'
  issuedAt: string
  expiresAt: string
  status: 'current' | 'expiring-soon' | 'expired'
}

/** Corrective or preventive action (CAPA) */
export interface CorrectiveAction {
  id: string
  /** Corrective = after event; preventive = to prevent recurrence */
  actionType: 'corrective' | 'preventive'
  sourceType: 'injury' | 'incident' | 'near-miss' | 'hazard'
  sourceId: string
  title: string
  description: string
  assignedTo: string
  dueDate: string
  status: 'open' | 'in-progress' | 'completed'
  completedAt?: string
}

/** Safety alert / bulletin */
export interface SafetyAlertUserAction {
  userId: string
  at: string
}

export interface SafetyAlert {
  id: string
  title: string
  body: string
  siteNames?: string[]
  roles?: UserRole[]
  publishedAt: string
  expiresAt?: string
  acknowledgedBy?: SafetyAlertUserAction[]
  readBy?: SafetyAlertUserAction[]
}

/** Emergency info per site/job */
export interface EmergencySiteInfo {
  id: string
  jobId: string
  siteName: string
  firstAiderName?: string
  firstAiderPhone?: string
  emergencyContact?: string
  meetingPoint?: string
  nearestHospital?: string
}

/** Certificate uploaded by HR with expiration; HR is notified by email when close to expiration */
export interface Certificate {
  id: string
  name: string
  /** Display name of the certificate holder */
  holderName: string
  holderUserId?: string
  /** Optional issue date (YYYY-MM-DD) */
  issueDate?: string
  /** Expiration date (YYYY-MM-DD), optional */
  expirationDate?: string
  uploadedAt: string
  uploadedBy: string
  /** Optional file name */
  fileName?: string
  /** Optional persisted backend file path (blob key) */
  filePath?: string
  /** Data URL of the attached PDF (so it can be displayed and printed) */
  fileDataUrl?: string
  /** When an expiration-reminder email was sent to HR */
  expirationReminderSentAt?: string
  /** Roles or job types this cert is required for (e.g. supervisor, first-aid) */
  requiredForRoles?: UserRole[]
}

/** Root cause analysis linked to an incident or injury */
export interface RootCauseAnalysis {
  id: string
  linkedType: 'injury' | 'incident'
  linkedId: string
  immediateCause: string
  contributingCauses: string[]
  underlyingCause?: string
  analyzedBy: string
  analyzedAt: string
}

/** Inspection checklist item */
export interface InspectionChecklistItem {
  id: string
  label: string
  result?: 'pass' | 'fail' | 'na'
  note?: string
}

/** Scheduled inspection */
export interface InspectionSchedule {
  id: string
  title: string
  siteName?: string
  checklistId: string
  frequency: 'weekly' | 'monthly' | 'quarterly'
  nextDue: string
  assignedToRole?: UserRole
}

/** Completed inspection result */
export interface InspectionResult {
  id: string
  scheduleId: string
  title: string
  siteName?: string
  completedAt: string
  completedBy: string
  items: InspectionChecklistItem[]
  submissionId?: string
}

/** Compliance calendar event (deadline, audit, renewal) */
export interface ComplianceCalendarEvent {
  id: string
  type: 'certificate_expiry' | 'inspection_due' | 'report_deadline' | 'regulatory' | 'subcontractor_cert_expiry' | 'subcontractor_insurance_expiry'
  title: string
  dueDate: string
  siteName?: string
  recordId?: string
  metadata?: Record<string, string>
}

/** HR task/todo item for daily, weekly, monthly, or one-time planning */
export type HRTodoRecurrence = 'daily' | 'weekly' | 'monthly' | 'once'

export interface HRTodoItem {
  id: string
  title: string
  recurrence: HRTodoRecurrence
  /** ISO date (YYYY-MM-DD) for due date; for weekly, typically the week start; for monthly, first of month or specific day */
  dueDate: string
  /** Optional time (HH:mm) for due time; when set, task is shown with date + time */
  dueTime?: string
  completed: boolean
  completedAt?: string
  createdAt: string
  /** Optional link to internal route (e.g. injury report, form) */
  linkTo?: string
}

/** Audit log entry for admin view */
export interface AuditLogEntry {
  id: string
  at: string
  by: string
  action: string
  entityType: 'form' | 'injury' | 'document' | 'user' | 'subcontractor' | 'capa' | 'certificate'
  entityId: string
  entityLabel?: string
  linkTo?: string
}

/** Site (location) for site detail page */
export interface Site {
  id: string
  name: string
  jobId?: string
  activeJobTitle?: string
}

/** Job template for "Create from template" */
export interface JobTemplate {
  id: string
  name: string
  description?: string
  defaultSiteName?: string
}
