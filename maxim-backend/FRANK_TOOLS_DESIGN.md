# Frank Tools Design — Domains, Tools, and Caveats

## 1. Domain inventory (from existing services)

| Domain | Service | Key list/get methods | Key fields | Filters | Frank write? |
|--------|---------|----------------------|------------|---------|--------------|
| **Employees** | userService | listAllUsersForAdmin, listUsersForAssignment | id, email, name, role, isActive, employmentStatus | role (via service gate) | No |
| **Certificates** | certificateService | listCertificates, getCertificateById | id, name, holderName, holderUserId, expirationDate, uploadedBy | — (filter in connector: status=expired/expiring/current, holderName) | No |
| **Jobs** | jobService | listJobs, getMyJobs, getJobById | id, title, siteId, siteName, status, assignedSupervisorIds, labourerCount | status, siteId; role scopes list | No |
| **Sites** | siteService | listSites, getSiteById | id, name, jobId, activeJobTitle | — | No |
| **PDF templates** | pdfTemplateService | (if exists) list/get | id, name, category | — | No |
| **PDF submissions** | pdfSubmissionService | listSubmissions, getSubmissionById | id, templateName, status, submittedBy, submittedAt | — (role-scoped in service) | No |
| **Signable submissions** | signableSubmissionService | listSignableSubmissions, listDailyForms | id, templateName, submittedBy, submittedAt, status | signableFormId; role-scoped | No |
| **Form submissions (generic)** | submissionService | listFormSubmissions | id, templateName, status, submittedBy, submittedAt, siteName | status, templateId; role-scoped | No |
| **Incidents** | incidentService | listIncidents, getIncidentById | id, title, siteId, siteName, date, status, severity, description, reportedBy | status, siteId | No |
| **Injury reports** | injuryReportService | listInjuryReports, getInjuryReportById | id, siteName, reportedBy, status, severity, description, injuredPersonName, dateOfInjury | status, jobId, subcontractorId | No |
| **Near misses** | nearMissService | listNearMisses, getNearMissById | id, siteName, reportedBy, description, status | status, siteId | No |
| **Hazards** | hazardService | listHazards, getHazardById | id, siteName, title, description, status, assignedTo, dueDate, riskLevel | status, siteId | No |
| **Safety alerts** | safetyAlertService | listAlerts, getAlertById | id, title, body, siteNames, roles, publishedAt, expiresAt, acknowledgedBy | activeOnly | No |
| **Observations** | observationService | listObservations, getObservationById | id, siteName, type, description, observedBy, observedAt | type, siteId | No |
| **Inspections** | inspectionService | listSchedules, listDue, listResults | schedule: id, title, siteName, nextDue, frequency; result: id, title, completedAt, completedBy, items | scheduleId (for results); asOf (for due) | No |
| **CAPA** | capaService | listCAPA, getCAPAById | id, actionType, title, description, assignedTo, dueDate, status, completedAt | status, sourceType | No (Frank read-only; write_record could call updateCAPA with confirmation) |
| **Compliance calendar** | complianceCalendarService | listEvents, listDue | id, type, title, dueDate, siteName, recordId | from, to, type; asOf for listDue | No |
| **HR Todos** | hrTodoService | listTodo, createTodo, updateTodo | id, title, dueDate, dueTime, completed, recurrence | dueDate, completed (list is per-user) | Yes — create/update (with confirmation) |
| **Subcontractors** | subcontractorService | listSubcontractors, getSubcontractorById | id, companyName, primaryContactName, status, insuranceExpiry; detail: certifications, jobAssignments | — | No |
| **Library documents** | libraryDocumentService | listLibraryDocuments, getLibraryDocumentById | id, name, type, siteName, date, uploadedBy, tags, visibility | — (visibility in service) | No |
| **Employee documents** | employeeDocumentService | (list by employee) | id, name, type, uploadedAt, notes | employeeId | No |
| **Audit log** | auditLogService | listAuditLogs | id, at, by, userId, action, entityType, entityId, entityLabel, linkTo | entityType, entityId, userId, from, to, limit | No (Owner/HR only in route) |
| **Notifications** | notificationService | listForUser | id, title, body, type, read, readAt, linkTo | unreadOnly, limit; always current user | No |

## 2. Filters that make sense (for tool input_schema)

- **query_people**: search (name/email), role, isActive — uses listAllUsersForAdmin (Owner/HR only); labourers/supervisors see limited data elsewhere.
- **query_certificates**: status (expired | expiring | current), holderName — listCertificates then filter in connector.
- **query_jobs**: status, siteId — listJobs(userId, role, query).
- **query_sites**: no filter — listSites().
- **query_pdf_submissions**: no extra filter — listSubmissions (role-scoped).
- **query_signable_submissions**: signableFormId — listSignableSubmissions(..., { signableFormId }).
- **query_form_submissions**: status, templateId — listFormSubmissions(..., { status, templateId }).
- **query_incidents**: status, siteId — listIncidents(role, { status, siteId }).
- **query_injury_reports**: status, jobId, subcontractorId — listInjuryReports(userId, role, query).
- **query_near_misses**: status, siteId — listNearMisses(role, query).
- **query_hazards**: status, siteId — listHazards(role, query).
- **query_safety_alerts**: activeOnly — listAlerts(role, { activeOnly }).
- **query_observations**: type, siteId — listObservations(role, query).
- **query_inspection_schedules**: asOf (for due) — listDue(role, asOf) or listSchedules(role).
- **query_inspection_results**: scheduleId — listResults(role, { scheduleId }).
- **query_capa**: status, sourceType — listCAPA(role, query).
- **query_compliance_calendar**: from, to, type — listEvents(role, query); or listDue(role, asOf).
- **query_hr_todos**: dueDate, completed — listTodo(userId, role, query).
- **query_subcontractors**: no filter — listSubcontractors(role).
- **query_library_documents**: no filter — listLibraryDocuments (visibility in service).
- **query_audit_log**: entityType, entityId, userId, from, to, limit — listAuditLogs(query); route restricts to Owner/HR.
- **query_notifications**: unreadOnly, limit — listForUser(userId, query).
- **create_hr_todo**: title, dueDate, recurrence, dueTime, linkTo — createTodo(userId, role, data). **Write. Require confirmation.**
- **update_capa_status**: id, status, completedAt — updateCAPA(id, role, data). **Write. Require confirmation.**

## 3. Schema / service caveats

- **Certificates**: listCertificates returns all; no server-side filter by expiry. Connector computes status (expired / expiring / current) from expirationDate and optionally filters by holderName.
- **Sites**: getSiteById returns openHazardsCount, recentIncidents, injuryReports as placeholders (0, [], []) — not wired to real data in the snippet seen; Frank should not rely on those for counts.
- **Inspection results**: items is JSON array (checklist items); structure may vary. completedAt/completedBy may be null in edge cases.
- **Signable submissions**: listDailyForms is per-user (assignments); listSignableSubmissions is role-scoped (supervisor sees crew only). Frank uses same userId/role from context.
- **Audit log**: Only Owner/HR can list; connector must enforce or route already does — Frank context has role, so we only call listAuditLogs when role is owner or hr.
- **HR Todos**: createTodo/updateTodo are Owner/HR only; listTodo is per userId (so Frank sees current user's todos). create_hr_todo must require explicit user confirmation before calling.
- **CAPA**: updateCAPA can set status and completedAt; Frank should only suggest updates and require confirmation.
- **Nullability**: Many optional fields (siteId, jobId, reportedAt, dueDate, etc.) — connector returns what the service returns; avoid assuming presence in prompts.

## 4. Tool names and descriptions (summary)

- **query_people** — Search employees; filter by role/active. Owner/HR only.
- **query_certificates** — List certificates; filter by status (expired/expiring/current) and holder name.
- **query_jobs** — List jobs; filter by status, siteId. Role-scoped.
- **query_sites** — List all sites with optional active job info.
- **query_pdf_submissions** — List PDF form submissions. Role-scoped.
- **query_signable_submissions** — List signable form submissions; optional signableFormId.
- **query_form_submissions** — List generic form submissions; filter by status, templateId.
- **query_incidents** — List incidents; filter by status, siteId.
- **query_injury_reports** — List injury reports; filter by status, jobId, subcontractorId.
- **query_near_misses** — List near-miss reports; filter by status, siteId.
- **query_hazards** — List hazard reports; filter by status, siteId.
- **query_safety_alerts** — List safety alerts; optional activeOnly.
- **query_observations** — List safety observations; filter by type, siteId.
- **query_inspection_schedules** — List inspection schedules or due schedules; optional asOf date.
- **query_inspection_results** — List inspection results; optional scheduleId.
- **query_capa** — List CAPA items; filter by status, sourceType.
- **query_compliance_calendar** — List compliance events or due events; filter by from, to, type.
- **query_hr_todos** — List current user's HR todos; filter by dueDate, completed.
- **query_subcontractors** — List subcontractors. Owner/HR only.
- **query_library_documents** — List library documents. Visibility by service.
- **query_audit_log** — Query audit log by entity, user, date range. Owner/HR only.
- **query_notifications** — List current user's notifications; optional unreadOnly.
- **create_hr_todo** — Create an HR todo for the current user. Requires confirmation. Owner/HR only.
- **update_capa_status** — Update a CAPA item's status/completedAt. Requires confirmation.

## 5. Frontend (SSE)

The Frank route responds with **Server-Sent Events** (SSE), not JSON. The frontend (`FrankChat.tsx`) uses `fetch()` to POST the conversation, then reads the response body stream and parses SSE lines:

- **event: text** — Append `data.text` to the current assistant message (streaming).
- **event: tool_call** — Show "Checking {name}…" (e.g. "Checking query certificates…").
- **event: tool_result** — Clear the tool indicator.
- **event: done** — Optional final `data.text`; mark message complete.
- **event: error** — Show `data.message` and stop.

The chat sends the full message history (with `role` and `content`/`text`) so Frank can chain tools and answer in one run.

## 6. Caveats (incomplete or fragile areas)

- **Certificates**: No server-side filter by expiry; connector computes status and filters in memory. `holderName` filter is partial match.
- **Sites**: `getSiteById` returns placeholder `openHazardsCount: 0`, `recentIncidents: []`, `injuryReports: []` — not wired to real counts in the snippet; Frank should not rely on those for accuracy.
- **Inspection results**: `items` is a JSON array; structure may vary. `completedAt`/`completedBy` can be null.
- **Audit log**: Only Owner/HR may call; connector returns an error for other roles.
- **HR Todos**: `createTodo` is Owner/HR only; list is always the current user's. Frank must ask for confirmation before `create_hr_todo`.
- **CAPA**: `update_capa_status` can set status/completedAt; confirm with user before calling.
- **Nullability**: Many optional fields across domains (siteId, jobId, reportedAt, dueDate, etc.); answers should not assume presence.
