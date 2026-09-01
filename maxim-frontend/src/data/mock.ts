/**
 * Empty data placeholders. All real data comes from the API.
 * This file exists only for type compatibility; no mock/demo data is used.
 */

import type {
  NotificationItem,
  FormTemplate,
  DocumentRecord,
  IncidentRecord,
  EmailThread,
  JobEntry,
  Job,
  JobAssignment,
  SubcontractorCertification,
  SubcontractorJobAssignment,
  SubcontractorPersonnel,
  SubcontractorPersonnelCertification,
  SubcontractorPersonnelJobAssignment,
  SubcontractorPersonnelCheckIn,
  Employee,
  EmergencySiteInfo,
  JobTemplate,
  InspectionResult,
  TrainingCertification,
  ScannedPdfDocument,
  SignableFormTemplate,
} from '@/types'

export const MOCK_APP_USERS: { id: string; name: string; role: string }[] = []
export const MOCK_FORM_TEMPLATES: Record<string, FormTemplate> = {}
export const MOCK_EMERGENCY_SITE_INFO: EmergencySiteInfo[] = []
export const MOCK_JOB_ENTRIES: JobEntry[] = []
export const MOCK_INCIDENTS: IncidentRecord[] = []
export const MOCK_TRAINING_CERTIFICATIONS: TrainingCertification[] = []
export const MOCK_INSPECTION_RESULTS: InspectionResult[] = []
export const MOCK_JOBS: Job[] = []
export const MOCK_JOB_TEMPLATES: JobTemplate[] = []
export const MOCK_EMAIL_THREADS: EmailThread[] = []
export const MOCK_SCANNED_PDFS: ScannedPdfDocument[] = []
export const MOCK_SIGNABLE_FORM_TEMPLATES: SignableFormTemplate[] = []
export const MOCK_SUBCONTRACTOR_JOB_ASSIGNMENTS: SubcontractorJobAssignment[] = []
export const MOCK_SUBCONTRACTOR_PERSONNEL: SubcontractorPersonnel[] = []
export const MOCK_SUBCONTRACTOR_PERSONNEL_JOB_ASSIGNMENTS: SubcontractorPersonnelJobAssignment[] = []
export const MOCK_SUBCONTRACTOR_PERSONNEL_CHECK_INS: SubcontractorPersonnelCheckIn[] = []
export const MOCK_SUBCONTRACTOR_CERTIFICATIONS: SubcontractorCertification[] = []

/** @deprecated Use API; initial state only */
export const MOCK_EMPLOYEES: Employee[] = []

// Unused exports kept for any remaining imports (can be removed when all refs are gone)
export const MOCK_NOTIFICATIONS: NotificationItem[] = []
export const MOCK_DOCUMENTS: DocumentRecord[] = []
