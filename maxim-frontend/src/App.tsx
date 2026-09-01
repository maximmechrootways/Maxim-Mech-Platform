import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { useUser } from '@/contexts/UserContext'
import { useUiPreferences } from '@/contexts/UiPreferencesContext'
import { AppLayout } from '@/components/layout/AppLayout'
import { FrankChat } from '@/components/frank/FrankChat'
import { Login } from '@/pages/Login'
import { DashboardOwner } from '@/pages/dashboards/DashboardOwner'
import { DashboardSupervisor } from '@/pages/dashboards/DashboardSupervisor'
import { DashboardLabourer } from '@/pages/dashboards/DashboardLabourer'
import { Library } from '@/pages/library/Library'
import { LibraryUpload } from '@/pages/library/LibraryUpload'
import { LibraryDocumentUpload } from '@/pages/library/LibraryDocumentUpload'
import { SubcontractorOfflineFormUploads } from '@/pages/library/SubcontractorOfflineFormUploads'
import { FormFill } from '@/pages/forms/FormFill'
import { FormFillKiss } from '@/pages/forms/FormFillKiss'
import { DailyHazardAnalysis } from '@/pages/daily-forms/DailyHazardAnalysis'
import { FormReview } from '@/pages/forms/FormReview'
import { SigningRequest } from '@/pages/signing/SigningRequest'
import { SignatureCapture } from '@/pages/signing/SignatureCapture'
import { DocumentDetail } from '@/pages/documents/DocumentDetail'
import { GlobalSearch } from '@/pages/search/GlobalSearch'
import { SearchResultDetail } from '@/pages/search/SearchResultDetail'
import { AdminUsers } from '@/pages/admin/AdminUsers'
import { AdminTemplates } from '@/pages/admin/AdminTemplates'
import { AdminNotifications } from '@/pages/admin/AdminNotifications'
import { AdminSignableForms } from '@/pages/admin/AdminSignableForms'
import { AdminDocuments } from '@/pages/admin/AdminDocuments'
import { AdminCertificates } from '@/pages/admin/AdminCertificates'
import { FormFromPdfEditor } from '@/pages/admin/FormFromPdfEditor'
import { DailyForms } from '@/pages/daily-forms/DailyForms'
import { FillSignableForm } from '@/pages/daily-forms/FillSignableForm'
import { FillSignableFormKiss } from '@/pages/daily-forms/FillSignableFormKiss'
import { SignSignableForm } from '@/pages/daily-forms/SignSignableForm'
import { SignSequentialForm } from '@/pages/daily-forms/SignSequentialForm'
import { MyJobs } from '@/pages/jobs/MyJobs'
import { SubcontractorsList } from '@/pages/subcontractors/SubcontractorsList'
import { SubcontractorDetail } from '@/pages/subcontractors/SubcontractorDetail'
import { SubcontractorPersonnelDetail } from '@/pages/subcontractors/SubcontractorPersonnelDetail'
import { EmployeesList } from '@/pages/employees/EmployeesList'
import { EmployeeDetail } from '@/pages/employees/EmployeeDetail'
import { AddEmployee } from '@/pages/employees/AddEmployee'
import { InjuryReports } from '@/pages/injury-reports/InjuryReports'
import { HazardReviewHub } from '@/pages/hazard-review/HazardReviewHub'
import { HazardAssessmentDocument } from '@/pages/hazard-review/HazardAssessmentDocument'
import { HazardTemplateMessageBoard } from '@/pages/hazard-review/HazardTemplateMessageBoard'
import { HazardRiskRegister } from '@/pages/hazard-review/HazardRiskRegister'
import { HazardCompletedHazardsSite } from '@/pages/hazard-review/HazardCompletedHazardsSite'
import { HazardRiskAssessmentFill } from '@/pages/hazard-review/HazardRiskAssessmentFill'
import { InjuryReportNew } from '@/pages/injury-reports/InjuryReportNew'
import { InjuryReportDetail } from '@/pages/injury-reports/InjuryReportDetail'
import { InjuryAnalytics } from '@/pages/injury-reports/InjuryAnalytics'
import { RootCauseForm } from '@/pages/injury-reports/RootCauseForm'
import { SafetyHub } from '@/pages/safety/SafetyHub'
import { IncidentReportsList } from '@/pages/safety/IncidentReportsList'
import { IncidentReportNew } from '@/pages/safety/IncidentReportNew'
import { IncidentDetail } from '@/pages/safety/IncidentDetail'
import { DailyHazardAnalysisList } from '@/pages/safety/DailyHazardAnalysisList'
import { DailyHazardAnalysisDetail } from '@/pages/safety/DailyHazardAnalysisDetail'
import { HazardsList } from '@/pages/safety/HazardsList'
import { HazardDetail } from '@/pages/safety/HazardDetail'
import { NearMissList } from '@/pages/safety/NearMissList'
import { NearMissDetail } from '@/pages/safety/NearMissDetail'
import { SafetyObservationsList } from '@/pages/safety/SafetyObservationsList'
import { CorrectiveActionsList } from '@/pages/safety/CorrectiveActionsList'
import { SafetyAlertsList } from '@/pages/safety/SafetyAlertsList'
import { ScheduledInspections } from '@/pages/safety/ScheduledInspections'
import { InspectionResultDetail } from '@/pages/safety/InspectionResultDetail'
import { ComplianceCalendar } from '@/pages/safety/ComplianceCalendar'
import { RegulationsReference } from '@/pages/safety/RegulationsReference'
import { HealthSafetyManual } from '@/pages/safety/HealthSafetyManual'
import { SdsLibrary } from '@/pages/safety/SdsLibrary'
import { MeetingMinutesAgenda } from '@/pages/safety/MeetingMinutesAgenda'
import { FeedbackPage } from '@/pages/feedback/FeedbackPage'
import { SafetyAnalytics } from '@/pages/safety/SafetyAnalytics'
import { QRScanPlaceholder } from '@/pages/safety/QRScanPlaceholder'
import { ManagementReview } from '@/pages/hr/ManagementReview'
import { TimeOffPage } from '@/pages/hr/TimeOffPage'
import { MyTimeOffPage } from '@/pages/hr/MyTimeOffPage'
import { EmployeeTimeTrackingPage } from '@/pages/hr/EmployeeTimeTrackingPage'
import { AuditLog } from '@/pages/admin/AuditLog'
import { QualityFindingsPage } from '@/pages/hq/QualityFindingsPage'
import { IncomingInvoicesList } from '@/pages/invoices/IncomingInvoicesList'
import { OutgoingInvoicesList } from '@/pages/invoices/OutgoingInvoicesList'
import { IncomingInvoiceDetail } from '@/pages/invoices/IncomingInvoiceDetail'
import { OutgoingInvoiceDetail } from '@/pages/invoices/OutgoingInvoiceDetail'
import { AdminPermissions } from '@/pages/admin/AdminPermissions'
import { SessionManagement } from '@/pages/admin/SessionManagement'
import { SitesList } from '@/pages/safety/SitesList'
import { SiteDetail } from '@/pages/safety/SiteDetail'
import { ProjectDashboard } from '@/pages/safety/ProjectDashboard'
import { InviteCodes } from '@/pages/hr/InviteCodes'
import { SetupProfile } from '@/pages/SetupProfile'
import { ForgotPassword } from '@/pages/ForgotPassword'
import { ResetPassword } from '@/pages/ResetPassword'
import { QrFormRedirect } from '@/pages/forms/QrFormRedirect'
import { AdminFormQrCodes } from '@/pages/admin/AdminFormQrCodes'
import { EquipmentList } from '@/pages/equipment/EquipmentList'
import { EquipmentDetail } from '@/pages/equipment/EquipmentDetail'
import { EstimatingProjectFutureWork } from '@/pages/estimating/EstimatingProjectFutureWork'
import { EstimatingFolderPage } from '@/pages/estimating/EstimatingFolderPage'
import { PastProjectDirectory } from '@/pages/estimating/PastProjectDirectory'
import { PastProjectFolderPage } from '@/pages/estimating/PastProjectFolderPage'
import { CurrentProjectsDirectory } from '@/pages/estimating/CurrentProjectsDirectory'
import { CurrentProjectFoldersPage } from '@/pages/estimating/CurrentProjectFoldersPage'
import { LocalArchiveDirectory } from '@/pages/estimating/LocalArchiveDirectory'
import { LocalArchiveJobPage } from '@/pages/estimating/LocalArchiveJobPage'
import { LocalArchiveProjectPage } from '@/pages/estimating/LocalArchiveProjectPage'
import { CurrentProjectFolderFilesPage } from '@/pages/estimating/CurrentProjectFolderFilesPage'

function ProtectedRoute({ children, roles }: { children: React.ReactNode; roles?: string[] }) {
  const { loading } = useAuth()
  const { user } = useUser()
  if (loading) return <div className="flex min-h-screen items-center justify-center text-neutral-500">Loading…</div>
  if (!user) return <Navigate to="/login" replace />
  if (roles && !roles.includes(user.role)) return <Navigate to="/" replace />
  return <>{children}</>
}

function DashboardRouter() {
  const { user } = useUser()
  if (!user) return null
  if (user.role === 'owner') return <DashboardOwner />
  // HR landing page is Management Review (not the old At a Glance dashboard).
  if (user.role === 'hr') return <ManagementReview />
  if (user.role === 'supervisor') return <DashboardSupervisor />
  return <DashboardLabourer />
}

/** KISS is always on for supervisors and labourers (no user-facing toggle). Optional pref for other roles. */
function useKissRouteVariant() {
  const { user } = useUser()
  const { kissModeEnabled } = useUiPreferences()
  const isKissRole = user?.role === 'supervisor' || user?.role === 'labourer'
  return isKissRole || kissModeEnabled
}

function FormFillRouteGate() {
  return useKissRouteVariant() ? <FormFillKiss /> : <FormFill />
}

function DailyFormFillRouteGate() {
  return useKissRouteVariant() ? <FillSignableFormKiss /> : <FillSignableForm />
}

function DailyHazardRouteGate() {
  return <DailyHazardAnalysis />
}

export default function App() {
  return (
    <>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/setup-profile" element={<SetupProfile />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/qr/:slug" element={<QrFormRedirect />} />
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <AppLayout />
            </ProtectedRoute>
          }
        >
          <Route index element={<DashboardRouter />} />
          <Route path="library" element={<Library />} />
          <Route path="library/upload" element={<ProtectedRoute roles={['owner', 'hr']}><LibraryUpload /></ProtectedRoute>} />
          <Route path="library/upload-document" element={<ProtectedRoute roles={['owner', 'hr']}><LibraryDocumentUpload /></ProtectedRoute>} />
          <Route
            path="library/subcontractor-offline-uploads"
            element={(
              <ProtectedRoute roles={['owner', 'hr', 'supervisor']}>
                <SubcontractorOfflineFormUploads />
              </ProtectedRoute>
            )}
          />
          <Route path="library/template/:pdfId/edit" element={<ProtectedRoute roles={['owner', 'hr']}><FormFromPdfEditor /></ProtectedRoute>} />
          <Route path="forms" element={<Navigate to="/library" replace />} />
          <Route path="forms/new" element={<FormFillRouteGate />} />
          <Route path="feedback" element={<FeedbackPage />} />
          <Route path="forms/new/:templateId" element={<FormFillRouteGate />} />
          <Route path="forms/daily-hazard-analysis" element={<ProtectedRoute roles={['owner', 'hr', 'supervisor', 'labourer']}><DailyHazardRouteGate /></ProtectedRoute>} />
          <Route path="safety/daily-hazard-analysis" element={<ProtectedRoute roles={['owner', 'hr', 'supervisor']}><DailyHazardAnalysisList /></ProtectedRoute>} />
          <Route path="safety/daily-hazard-analysis/:id" element={<ProtectedRoute roles={['owner', 'hr', 'supervisor']}><DailyHazardAnalysisDetail /></ProtectedRoute>} />
          <Route path="forms/:id" element={<FormReview />} />
          <Route path="signing" element={<Navigate to="/library?view=signing" replace />} />
          <Route path="signing/:id" element={<SigningRequest />} />
          <Route path="signing/:id/sign" element={<SignatureCapture />} />
          <Route path="documents" element={<Navigate to="/library?view=documents" replace />} />
          <Route path="documents/:id" element={<DocumentDetail />} />
          <Route path="health-safety-manual" element={<HealthSafetyManual />} />
          <Route path="safety/sds" element={<SdsLibrary />} />
          <Route path="safety/meeting-minutes" element={<MeetingMinutesAgenda />} />
          <Route path="daily-forms" element={<DailyForms />} />
          <Route path="daily-forms/fill/:dailyFormId" element={<DailyFormFillRouteGate />} />
          <Route path="daily-forms/sign/:submissionId" element={<SignSignableForm />} />
          <Route path="daily-forms/sign-sequential/:assignmentId" element={<SignSequentialForm />} />
          <Route path="admin/scanned-forms" element={<Navigate to="/library?view=templates" replace />} />
          <Route path="jobs" element={<Navigate to="/sites" replace />} />
          <Route path="jobs/:id" element={<Navigate to="/sites" replace />} />
          <Route path="sites" element={<ProtectedRoute roles={['owner', 'hr', 'supervisor']}><SitesList /></ProtectedRoute>} />
          <Route path="sites/:siteId/projects/:jobId" element={<ProtectedRoute roles={['owner', 'hr', 'supervisor']}><ProjectDashboard /></ProtectedRoute>} />
          <Route path="sites/:id" element={<ProtectedRoute roles={['owner', 'hr', 'supervisor']}><SiteDetail /></ProtectedRoute>} />
          <Route path="my-jobs" element={<ProtectedRoute roles={['supervisor']}><MyJobs /></ProtectedRoute>} />
          <Route path="equipment" element={<ProtectedRoute roles={['owner', 'hr', 'supervisor']}><EquipmentList /></ProtectedRoute>} />
          <Route path="equipment/:id" element={<ProtectedRoute roles={['owner', 'hr', 'supervisor']}><EquipmentDetail /></ProtectedRoute>} />
          <Route path="subcontractors" element={<ProtectedRoute roles={['owner', 'hr']}><SubcontractorsList /></ProtectedRoute>} />
          <Route path="subcontractors/:subId/personnel/:personnelId" element={<ProtectedRoute roles={['owner', 'hr']}><SubcontractorPersonnelDetail /></ProtectedRoute>} />
          <Route path="subcontractors/:id" element={<ProtectedRoute roles={['owner', 'hr']}><SubcontractorDetail /></ProtectedRoute>} />
          <Route path="employees" element={<ProtectedRoute roles={['owner', 'hr']}><EmployeesList /></ProtectedRoute>} />
          <Route path="employees/new" element={<ProtectedRoute roles={['owner', 'hr']}><AddEmployee /></ProtectedRoute>} />
          <Route path="employees/:id" element={<ProtectedRoute roles={['owner', 'hr']}><EmployeeDetail /></ProtectedRoute>} />
          <Route path="injury-reports" element={<ProtectedRoute roles={['owner', 'hr', 'supervisor']}><InjuryReports /></ProtectedRoute>} />
          <Route path="injury-reports/new" element={<ProtectedRoute roles={['owner', 'hr', 'supervisor']}><InjuryReportNew /></ProtectedRoute>} />
          <Route path="injury-reports/analytics" element={<ProtectedRoute roles={['owner', 'hr']}><InjuryAnalytics /></ProtectedRoute>} />
          <Route path="injury-reports/:id" element={<ProtectedRoute roles={['owner', 'hr', 'supervisor']}><InjuryReportDetail /></ProtectedRoute>} />
          <Route path="injury-reports/:id/root-cause" element={<ProtectedRoute roles={['owner', 'hr', 'supervisor']}><RootCauseForm /></ProtectedRoute>} />
          <Route
            path="hazard-review/risk-register"
            element={
              <ProtectedRoute roles={['owner', 'hr']}>
                <HazardRiskRegister />
              </ProtectedRoute>
            }
          />
          <Route
            path="hazard-review/messages/:templateKey"
            element={
              <ProtectedRoute roles={['owner', 'hr', 'supervisor', 'labourer']}>
                <HazardTemplateMessageBoard />
              </ProtectedRoute>
            }
          />
          <Route
            path="hazard-review"
            element={
              <ProtectedRoute roles={['owner', 'hr', 'supervisor', 'labourer']}>
                <HazardReviewHub />
              </ProtectedRoute>
            }
          />
          <Route
            path="hazard-review/assess/:templateKey"
            element={
              <ProtectedRoute roles={['owner', 'hr', 'supervisor', 'labourer']}>
                <HazardAssessmentDocument />
              </ProtectedRoute>
            }
          />
          <Route
            path="hazard-review/critical-register/site/:siteId"
            element={
              <ProtectedRoute roles={['owner', 'hr']}>
                <HazardCompletedHazardsSite />
              </ProtectedRoute>
            }
          />
          <Route
            path="hazard-review/hra/:submissionId"
            element={
              <ProtectedRoute roles={['owner', 'hr', 'supervisor', 'labourer']}>
                <HazardRiskAssessmentFill />
              </ProtectedRoute>
            }
          />
          <Route path="safety" element={<SafetyHub />} />
          <Route path="safety/incidents" element={<IncidentReportsList />} />
          <Route path="safety/incidents/new" element={<IncidentReportNew />} />
          <Route path="safety/incidents/:id" element={<IncidentDetail />} />
          <Route path="safety/hazards" element={<HazardsList />} />
          <Route path="safety/hazards/:id" element={<HazardDetail />} />
          <Route path="safety/near-miss" element={<NearMissList />} />
          <Route path="safety/near-miss/:id" element={<NearMissDetail />} />
          <Route path="safety/observations" element={<SafetyObservationsList />} />
          <Route path="safety/training" element={<Navigate to="/certificates" replace />} />
          <Route path="safety/corrective-actions" element={<ProtectedRoute roles={['owner', 'hr']}><CorrectiveActionsList /></ProtectedRoute>} />
          <Route path="safety/alerts" element={<SafetyAlertsList />} />
          <Route path="safety/inspections" element={<ScheduledInspections />} />
          <Route path="safety/inspections/result/:id" element={<InspectionResultDetail />} />
          <Route path="safety/compliance-calendar" element={<ProtectedRoute roles={['owner', 'hr']}><ComplianceCalendar /></ProtectedRoute>} />
          <Route path="safety/regulations" element={<RegulationsReference />} />
          <Route path="safety/analytics" element={<ProtectedRoute roles={['owner', 'hr']}><SafetyAnalytics /></ProtectedRoute>} />
          <Route path="safety/qr-scan" element={<QRScanPlaceholder />} />
          <Route path="safety/sites" element={<Navigate to="/sites" replace />} />
          <Route path="safety/sites/:id" element={<Navigate to="/sites" replace />} />
          <Route path="search" element={<GlobalSearch />} />
          <Route path="search/:type/:id" element={<SearchResultDetail />} />
          <Route
            path="estimating/project-future-work"
            element={
              <ProtectedRoute roles={['owner', 'hr', 'supervisor']}>
                <EstimatingProjectFutureWork />
              </ProtectedRoute>
            }
          />
          <Route
            path="estimating/project-future-work/:folderSlug"
            element={
              <ProtectedRoute roles={['owner', 'hr', 'supervisor']}>
                <EstimatingFolderPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="estimating/current-projects"
            element={
              <ProtectedRoute roles={['owner', 'hr', 'supervisor']}>
                <CurrentProjectsDirectory />
              </ProtectedRoute>
            }
          />
          <Route
            path="estimating/current-projects/:jobId"
            element={
              <ProtectedRoute roles={['owner', 'hr', 'supervisor']}>
                <CurrentProjectFoldersPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="estimating/current-projects/:jobId/local-archive"
            element={
              <ProtectedRoute roles={['owner', 'hr', 'supervisor']}>
                <LocalArchiveJobPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="estimating/current-projects/:jobId/:folderSlug"
            element={
              <ProtectedRoute roles={['owner', 'hr', 'supervisor']}>
                <CurrentProjectFolderFilesPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="estimating/past-project-directory"
            element={
              <ProtectedRoute roles={['owner', 'hr', 'supervisor']}>
                <PastProjectDirectory />
              </ProtectedRoute>
            }
          />
          <Route
            path="estimating/past-project-directory/:folderSlug"
            element={
              <ProtectedRoute roles={['owner', 'hr', 'supervisor']}>
                <PastProjectFolderPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="estimating/past-project-directory/job/:jobId"
            element={
              <ProtectedRoute roles={['owner', 'hr', 'supervisor']}>
                <CurrentProjectFoldersPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="estimating/past-project-directory/job/:jobId/local-archive"
            element={
              <ProtectedRoute roles={['owner', 'hr', 'supervisor']}>
                <LocalArchiveJobPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="estimating/past-project-directory/job/:jobId/:folderSlug"
            element={
              <ProtectedRoute roles={['owner', 'hr', 'supervisor']}>
                <CurrentProjectFolderFilesPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="estimating/local-archive"
            element={
              <ProtectedRoute roles={['owner', 'hr', 'supervisor']}>
                <LocalArchiveDirectory />
              </ProtectedRoute>
            }
          />
          <Route
            path="estimating/local-archive/:projectName"
            element={
              <ProtectedRoute roles={['owner', 'hr', 'supervisor']}>
                <LocalArchiveProjectPage />
              </ProtectedRoute>
            }
          />
          <Route path="admin" element={<ProtectedRoute roles={['owner', 'hr']}><AdminUsers /></ProtectedRoute>} />
          <Route path="admin/users" element={<ProtectedRoute roles={['owner', 'hr']}><AdminUsers /></ProtectedRoute>} />
          <Route path="admin/templates" element={<ProtectedRoute roles={['owner', 'hr']}><AdminTemplates /></ProtectedRoute>} />
          <Route path="admin/signable-forms" element={<ProtectedRoute roles={['owner', 'hr']}><AdminSignableForms /></ProtectedRoute>} />
          <Route path="admin/documents" element={<ProtectedRoute roles={['owner', 'hr']}><AdminDocuments /></ProtectedRoute>} />
          <Route path="admin/notifications" element={<ProtectedRoute roles={['owner', 'hr']}><AdminNotifications /></ProtectedRoute>} />
          <Route path="admin/audit-log" element={<ProtectedRoute roles={['owner', 'hr']}><AuditLog /></ProtectedRoute>} />
          <Route path="hq/quality-findings" element={<ProtectedRoute roles={['owner', 'hr']}><QualityFindingsPage /></ProtectedRoute>} />
          <Route path="incoming-invoices" element={<ProtectedRoute roles={['owner', 'hr']}><IncomingInvoicesList /></ProtectedRoute>} />
          <Route path="incoming-invoices/:id" element={<ProtectedRoute roles={['owner', 'hr']}><IncomingInvoiceDetail /></ProtectedRoute>} />
          <Route path="outgoing-invoices" element={<ProtectedRoute roles={['owner', 'hr']}><OutgoingInvoicesList /></ProtectedRoute>} />
          <Route path="outgoing-invoices/:id" element={<ProtectedRoute roles={['owner', 'hr']}><OutgoingInvoiceDetail /></ProtectedRoute>} />
          <Route path="admin/permissions" element={<ProtectedRoute roles={['owner', 'hr']}><AdminPermissions /></ProtectedRoute>} />
          <Route path="admin/sessions" element={<ProtectedRoute roles={['owner', 'hr']}><SessionManagement /></ProtectedRoute>} />
          <Route path="admin/form-qr-codes" element={<ProtectedRoute roles={['owner', 'hr']}><AdminFormQrCodes /></ProtectedRoute>} />
          <Route path="certificates" element={<ProtectedRoute roles={['owner', 'hr', 'supervisor']}><AdminCertificates /></ProtectedRoute>} />
          <Route path="hr/management-review" element={<ProtectedRoute roles={['owner', 'hr']}><ManagementReview /></ProtectedRoute>} />
          <Route path="hr/time-off" element={<ProtectedRoute roles={['owner', 'hr', 'supervisor']}><TimeOffPage /></ProtectedRoute>} />
          <Route path="my-time-off" element={<MyTimeOffPage />} />
          <Route
            path="hr/time-tracking"
            element={
              <ProtectedRoute roles={['owner', 'hr', 'supervisor']}>
                <EmployeeTimeTrackingPage />
              </ProtectedRoute>
            }
          />
          <Route path="hr/invite-codes" element={<ProtectedRoute roles={['owner', 'hr']}><InviteCodes /></ProtectedRoute>} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <FrankChat />
    </>
  )
}
