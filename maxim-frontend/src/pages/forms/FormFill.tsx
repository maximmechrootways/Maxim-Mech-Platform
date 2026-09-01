import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { Link, useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { Button } from '@/components/ui/Button'
import { Card, CardDescription, CardHeader } from '@/components/ui/Card'
import { useAuth } from '@/contexts/AuthContext'
import { useUser } from '@/contexts/UserContext'
import { useEmployees } from '@/contexts/EmployeesContext'
import { api } from '@/api'
import {
  getPdfTemplate,
  fetchPdfBlob,
  fetchPdfSubmissions,
  deleteDraftPdfSubmissions,
  submitFormAssignment,
  uploadPdfSubmissionExtraPdf,
  fetchToolboxTopics,
  attachToolboxTopicToSubmission,
  type ToolboxTopicRecord,
} from '@/api/library'
import { fetchJobs, fetchMyJobs } from '@/api/jobs'
import { pdfDataUrlToImageDataUrls } from '@/utils/pdfToImages'
import SignatureModal from '@/components/pdf/SignatureModal'
import { fetchEquipmentList, linkInspectionSubmission } from '@/api/equipment'
import { quickViewBlob, downloadBlob } from '@/utils/fileActions'
import { getDhaTaskLibraryEntry } from '@/data/dhaTaskLibrary'
import { fetchDhaPresets, createDhaPreset, deleteDhaPreset, type DhaPreset } from '@/api/dhaPresets'
import {
  getWashroomSitePresetFromLocationSelection,
  getWashroomSiteTemplatePreset,
  isWashroomInspectionStyleTemplateName,
  WASHROOM_ESCALATION_DEFAULT_TEXT,
  WASHROOM_LOCATION_DROPDOWN_LABEL,
} from '@/utils/washroomTemplate'
import {
  INTERIM2_PM_PAGES,
  getInterim2PmMatrixDefaults,
  getInterim2PmDefaultRowCount,
  parseInterim2PmPageNumFromMatrixLabel,
  parseInterim2PmMatrixState,
} from '@/data/interim2PmChecklistPages'

/** Invisible overlay: transparent borders so form looks seamless */
const FIELD_BORDER: Record<string, string> = {
  TEXT: 'border-transparent',
  NUMBER: 'border-transparent',
  DATE: 'border-transparent',
  CHECKBOX: 'border-transparent',
  SIGNATURE: 'border-transparent',
}
const CUSTOM_TEMPLATE_PREFIX = 'custom-form://'
const HOT_WORK_ADDITIONAL_COMMENTS_FIELD_ID = '__hot_work_additional_comments__'
/** Must match backend DHA_USER_SAVED_DRAFT_KEY — only drafts with this flag appear in Saved DHA drafts / My Drafts. */
const DHA_USER_SAVED_DRAFT_KEY = '__dha_user_saved_draft__'

function isDhaUserSavedDraftFieldValues(fieldValues?: Record<string, unknown> | null): boolean {
  return String(fieldValues?.[DHA_USER_SAVED_DRAFT_KEY] ?? '').trim() === '1'
}

const DHA_WORKPLACE_VIOLENCE_QUESTIONS = [
  'History of threats or Violence?',
  'Near historically high crime area?',
  'Concerns voice by JHSC or workers?',
  'Workers required to work alone, late evenings or early mornings?',
  'Workers in contact with public?',
] as const

const GENERIC_LABELS = ['text', 'date', 'number', 'checkbox', 'signature']

/** API/template may use any casing; normalize for comparisons. */
function fieldTypeNorm(t: string | undefined) {
  return (t || '').toUpperCase()
}

function getMobilePlaceholder(field: { label?: string; type: string }): string {
  const raw = (field.label ?? '').trim()
  if (raw && !GENERIC_LABELS.includes(raw.toLowerCase())) return raw
  switch (fieldTypeNorm(field.type)) {
    case 'TEXT': return 'Enter your answer'
    case 'NUMBER': return 'Enter number'
    case 'DATE': return ''
    case 'SIGNATURE': return 'Tap to sign'
    default: return 'Enter value'
  }
}

function normalizeDhaLabel(raw?: string) {
  return String(raw ?? '').trim().toLowerCase().replace(/\s+/g, ' ')
}

/** Must match merge logic inside doSubmit — used so required-field validation sees DHA fallback + synthetic keys. */
function mergeDailyHazardSubmitValues(opts: {
  values: Record<string, string>
  templateFields: Array<{ id: string; label?: string; type?: string; required?: boolean }>
  dhaWeatherFallback: string
  dhaNearestHospitalFallback: string
  dhaEmergencyCoordinatorFallback: string
  dhaViolenceActionsFallback: string
  dhaViolenceAnswers: Record<number, 'Yes' | 'No' | ''>
  dhaWeatherConditionFallback: Record<string, boolean>
}): Record<string, string> {
  const submitValues: Record<string, string> = { ...opts.values }
  const allFields = opts.templateFields
  const findField = (aliases: string[], types?: string[]) =>
    allFields.find((f) => {
      const label = normalizeDhaLabel(parseCustomFieldSpec(f.label)?.label ?? f.label)
      const typeOk = !types || types.includes(fieldTypeNorm(f.type))
      if (!typeOk) return false
      return aliases.some((aliasRaw) => {
        const alias = normalizeDhaLabel(aliasRaw)
        return label === alias || label.includes(alias) || alias.includes(label)
      })
    })

  const weatherValue = String(submitValues['__dha_weather__'] ?? opts.dhaWeatherFallback ?? '').trim()
  const nearestHospitalValue = String(submitValues['__dha_nearest_hospital__'] ?? opts.dhaNearestHospitalFallback ?? '').trim()
  const emergencyCoordinatorValue = String(submitValues['__dha_emergency_coordinator__'] ?? opts.dhaEmergencyCoordinatorFallback ?? '').trim()
  const violenceActionsValue = String(submitValues['__dha_violence_actions__'] ?? opts.dhaViolenceActionsFallback ?? '').trim()

  const weatherField = findField(['weather (°c)', 'weather temp', 'temperature', 'weather'], ['TEXT', 'NUMBER'])
  const nearestHospitalField = findField(['nearest hospital', 'nearest hosptial', 'hospital name', 'hospital'], ['TEXT'])
  const emergencyCoordinatorField = findField(['emergency response coordinator', 'emergency coordinator', 'response coordinator'], ['TEXT'])
  const correctiveActionsField = findField(['corrective actions', 'violence actions'], ['TEXT'])

  if (weatherField && weatherValue && !String(submitValues[weatherField.id] ?? '').trim()) {
    submitValues[weatherField.id] = weatherValue
  }
  if (nearestHospitalField && nearestHospitalValue && !String(submitValues[nearestHospitalField.id] ?? '').trim()) {
    submitValues[nearestHospitalField.id] = nearestHospitalValue
  }
  if (emergencyCoordinatorField && emergencyCoordinatorValue && !String(submitValues[emergencyCoordinatorField.id] ?? '').trim()) {
    submitValues[emergencyCoordinatorField.id] = emergencyCoordinatorValue
  }
  if (correctiveActionsField && violenceActionsValue && !String(submitValues[correctiveActionsField.id] ?? '').trim()) {
    submitValues[correctiveActionsField.id] = violenceActionsValue
  }

  if (weatherValue) submitValues.__dha_weather__ = weatherValue
  if (nearestHospitalValue) submitValues.__dha_nearest_hospital__ = nearestHospitalValue
  if (emergencyCoordinatorValue) submitValues.__dha_emergency_coordinator__ = emergencyCoordinatorValue
  if (violenceActionsValue) submitValues.__dha_violence_actions__ = violenceActionsValue

  const checkedWeatherConditions = ['Rain', 'Snow', 'Wind', 'Lightning', 'Sun', 'Overcast']
    .filter((condition) => Boolean(opts.dhaWeatherConditionFallback[condition]))
  if (checkedWeatherConditions.length > 0) {
    submitValues.__dha_weather_conditions__ = checkedWeatherConditions.join('|')
  }

  DHA_WORKPLACE_VIOLENCE_QUESTIONS.forEach((question, idx) => {
    const answer = opts.dhaViolenceAnswers[idx]
    if (!answer) return
    const qField = findField([question], ['TEXT', 'CHECKBOX'])
    if (!qField) return
    submitValues[qField.id] = answer
    submitValues[`__dha_violence_q_${idx}__`] = answer
  })

  return submitValues
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(r.result as string)
    r.onerror = reject
    r.readAsDataURL(blob)
  })
}

function parseCustomFieldSpec(label?: string) {
  const raw = String(label ?? '').trim()
  if (!raw.startsWith('[DROPDOWN]')) return null
  const body = raw.replace(/^\[DROPDOWN\]/, '')
  const [question, optionsRaw = ''] = body.split('::')
  const options = optionsRaw
    .split('|')
    .map((item) => item.trim())
    .filter(Boolean)
  return {
    label: question?.trim() || 'Select option',
    options,
  }
}

function filterDropdownOptionsForTemplate(
  templateName: string | undefined,
  fieldLabel: string | undefined,
  options: string[]
) {
  const isIncidentReportsTemplate = /incident\s*reports\s*form/i.test(String(templateName ?? ''))
  const isEventTitleField = /^event\s*title$/i.test(String(fieldLabel ?? '').trim())
  if (!isIncidentReportsTemplate || !isEventTitleField) return options
  return options.filter((opt) => !/^near\s*[-\s]?miss$/i.test(String(opt).trim()))
}

function parseJobDropdownMarker(label?: string) {
  const raw = String(label ?? '').trim()
  if (!raw.startsWith('[JOB_DROPDOWN]')) return null
  const question = raw.replace(/^\[JOB_DROPDOWN\]/, '').trim()
  return { label: question || 'Project' }
}

function parseSectionMarker(label?: string) {
  const raw = String(label ?? '').trim()
  if (!raw.startsWith('[SECTION]')) return null
  const title = raw.replace(/^\[SECTION\]/, '').trim()
  return { title: title || 'Section' }
}

function dhaRiskScore(risk?: string) {
  const value = String(risk ?? '').trim().toLowerCase()
  if (value === 'low') return 1
  if (value === 'medium') return 2
  if (value === 'high') return 3
  if (value === 'critical') return 4
  return null
}

function dhaRiskPillClass(risk?: string) {
  const value = String(risk ?? '').trim().toLowerCase()
  if (value === 'critical') return 'bg-red-100 text-red-800 border-red-300 dark:bg-red-950/40 dark:text-red-200 dark:border-red-700'
  if (value === 'high') return 'bg-orange-100 text-orange-800 border-orange-300 dark:bg-orange-950/40 dark:text-orange-200 dark:border-orange-700'
  if (value === 'medium') return 'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-950/40 dark:text-amber-200 dark:border-amber-700'
  if (value === 'low') return 'bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-950/40 dark:text-emerald-200 dark:border-emerald-700'
  return 'bg-neutral-100 text-neutral-700 border-neutral-300 dark:bg-neutral-800 dark:text-neutral-300 dark:border-neutral-600'
}

function isCollectSignaturesMarker(label?: string) {
  return String(label ?? '').trim() === '[COLLECT_SIGNATURES]'
}

function normalizeSectionTitle(rawTitle: string) {
  const t = String(rawTitle ?? '').trim()
  if (!t) return 'Section'
  // Accept inputs like:
  // - "Section 1 — Topic & Control Measures"
  // - "SECTION 3 - HR Approvals"
  // - "Section: HR Approvals"
  // - "7) Lift System" (must not strip only the digit and leave a leading ")"
  // and render as "Section — <Title>" (no numbers).
  const withoutPrefix = t
    .replace(/^section\b/i, '')
    .replace(/^\s*[:\-–—]?\s*/, '')
    // Prefer "7) …" (numbered closing paren) before the generic "7 — …" rule.
    .replace(/^\d+\)\s*/, '')
    .replace(/^\d+\s*[:\-–—]?\s*/, '') // remove leading "1 —"
    .replace(/^\d+\s+(?=\S)/, '') // remove leading "1 "
    .replace(/^\)\s+/, '') // leftover ")" if a digit was stripped earlier
    .trim()

  return withoutPrefix ? `Section — ${withoutPrefix}` : 'Section'
}

function sectionKeyFromTitle(title: string) {
  const key = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40)
  return key || 'section'
}

/** Plain label for template field (matches render, including [DROPDOWN] unwrap). */
function getTemplateFieldPlainLabel(f: { label?: string }) {
  return String(parseCustomFieldSpec(f.label)?.label ?? f.label ?? '').trim()
}

const EQUIPMENT_HEADER_ORDER = ['shop/site', 'location/address', 'unit #', 'operator', 'date', 'hour metre', 'shift'] as const

function normalizeEquipmentHeaderKey(plain: string) {
  return plain.toLowerCase().replace(/\s+/g, ' ').replace('hour meter', 'hour metre')
}

function isEquipmentInspectionHeaderField(f: { label?: string }) {
  const key = normalizeEquipmentHeaderKey(getTemplateFieldPlainLabel(f))
  return (EQUIPMENT_HEADER_ORDER as readonly string[]).includes(key)
}

function equipmentHeaderFieldOrder(f: { label?: string }) {
  const key = normalizeEquipmentHeaderKey(getTemplateFieldPlainLabel(f))
  const idx = (EQUIPMENT_HEADER_ORDER as readonly string[]).indexOf(key)
  return idx === -1 ? 999 : idx
}

function fixEquipmentSectionTitleStr(title: string) {
  return String(title ?? '').replace(/^Section — \)\s+/i, 'Section — ')
}

function isDateTimeLabel(label?: string) {
  const l = String(label ?? '').trim().toLowerCase()
  if (!l) return false
  // Covers "Date Time", "Date/Time", "Datetime", etc.
  return l.includes('date time') || l.includes('date/time') || l.includes('datetime')
}

function isToolboxTitleLabel(label?: string) {
  return String(label ?? '').trim().toLowerCase().includes('title of the topic')
}

function isToolboxControlMeasuresLabel(label?: string) {
  const normalized = String(label ?? '').trim().toLowerCase()
  return (
    normalized.includes('control measures') ||
    normalized.includes('safety tips') ||
    normalized.includes('notes from workers')
  )
}

function buildToolboxControlMeasuresAutofill(topic: Pick<ToolboxTopicRecord, 'summary' | 'keyPoints'>) {
  const points = Array.isArray(topic.keyPoints)
    ? topic.keyPoints.map((item) => String(item ?? '').trim()).filter(Boolean)
    : []
  const parts: string[] = []
  if (topic.summary?.trim()) parts.push(topic.summary.trim())
  if (points.length > 0) {
    parts.push(['Key discussion points:', ...points.map((point, idx) => `${idx + 1}. ${point}`)].join('\n'))
  }
  return parts.join('\n\n').trim()
}

type ChecklistChoice = '' | 'standard' | 'substandard' | 'na' | 'yes' | 'no'

function normalizeChecklistChoice(value?: string): ChecklistChoice {
  const raw = String(value ?? '').trim().toLowerCase()
  if (raw === 'standard') return 'standard'
  if (raw === 'substandard') return 'substandard'
  if (raw === 'yes') return 'yes'
  if (raw === 'no') return 'no'
  if (raw === 'na' || raw === 'n/a' || raw === 'missing') return 'na'
  // Backward compatibility for existing checkbox drafts.
  if (raw === 'true') return 'standard'
  return ''
}

function normalizeWashroomChecklistChoice(value?: string): '' | 'yes' | 'no' | 'na' {
  const raw = String(value ?? '').trim().toLowerCase()
  if (raw === 'yes' || raw === 'true' || raw === 'standard') return 'yes'
  if (raw === 'no' || raw === 'false' || raw === 'substandard') return 'no'
  if (raw === 'na' || raw === 'n/a' || raw === 'missing') return 'na'
  return ''
}

function normalizeWeeklyChecklistLabel(label?: string) {
  return String(label ?? '')
    .trim()
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

const WEEKLY_CHECKLIST_CATEGORY_BY_LABEL: Record<string, number> = {
  // General Site Conditions / PPE
  'housekeeping': 0,
  'guardrails secured': 0,
  'access egress areas': 0,
  'stairs ramps': 0,
  'dust control': 0,
  'head protections': 0,
  'head protection': 0,
  'foot protection': 0,
  'eye face protection': 0,
  'hearing protection': 0,
  'gloves protective clothing': 0,
  'respiratory protection': 0,
  'reflective traffic vests': 0,
  'fall protection harness': 0,
  // Materials / Chemicals / Storage
  'gas canisters closed': 1,
  'items stored stacked': 1,
  'chemicals labelled': 1,
  'proper storage location': 1,
  'compressed gas use and storage': 1,
  'flammables fuel storage': 1,
  'ventilation where required': 1,
  'asphalt material': 1,
  'protective coverings': 1,
  'staging and unloading areas identified': 1,
  'spill kits available': 1,
  'guarding in place': 1,
  'lockout tag equipment': 1,
  // Equipment / Lifting Devices
  'vehicle storage condition': 2,
  'electrical cords': 2,
  'lifting equipment condition': 2,
  'scaffolding components': 2,
  'signal person where required conditions': 2,
  'hoists cranes': 2,
  'rappelling devices': 2,
  'welding cutting equipment': 2,
  'ladders condition and setup': 2,
  'power tools cords and body': 2,
  'hand tool condition': 2,
  'fuel powered tools': 2,
  'working platforms': 2,
  // Emergency / Response
  'fire extinguishers': 3,
  'emergency eyewash': 3,
  'first aid kit': 3,
  'fall prevention plan': 3,
  'emergency contact numbers postings': 3,
  'hospital map directions': 3,
  'electrical panels secured': 3,
  'gfcis ground fault': 3,
  'locates underground': 3,
  'washrooms water stations': 3,
  'alert system': 3,
  'overhead conductors': 3,
  'spill kits': 3,
  // Site Required Documents
  'site required postings': 4,
  'job work order': 4,
  'safety talks': 4,
  'daily jha completed': 4,
  'safe work practices and procedures': 4,
  'current msds': 4,
  'training records available': 4,
  'operators manuals': 4,
  'weekly inspections': 4,
  'site hazard assessment documents sheets': 4,
  'progressive discipline form': 4,
  'reporting forms': 4,
  'investigation package': 4,
  // Industrial And Posting
  'lunchroom lockers': 5,
  'first aid training': 5,
  'visitors sign in area': 5,
  'desks tables chairs': 5,
  'policy statements safety violence and harassment': 5,
  'form 82 1234 poster': 5,
  'workplace inspections': 5,
  'mol orders copies': 5,
  'required regulations': 5,
  'regulation 1101': 5,
  'orientation guidelines': 5,
  'snow removal': 5,
}

function getWeeklyChecklistCategoryIndex(label?: string): number | null {
  const normalized = normalizeWeeklyChecklistLabel(label)
  if (!normalized) return null
  return Object.prototype.hasOwnProperty.call(WEEKLY_CHECKLIST_CATEGORY_BY_LABEL, normalized)
    ? WEEKLY_CHECKLIST_CATEGORY_BY_LABEL[normalized]
    : null
}

/** Hot Work: "No" drives the same corrective / detail autofill as "Substandard" on other inspection forms. */
function checklistNeedsDetail(value: string | undefined, templateName?: string | null) {
  const c = normalizeChecklistChoice(value)
  if (c === 'substandard') return true
  if (/hot\s*work\s*permit/i.test(String(templateName ?? '')) && c === 'no') return true
  return false
}

function parseWeeklyHazardFieldMeta(field: { label?: string }) {
  const dropdown = parseCustomFieldSpec(field.label)
  const resolvedLabel = String(dropdown?.label ?? field.label ?? '').trim()
  const match = resolvedLabel.match(/^Hazard Row\s+(\d+):\s*(.+)$/i)
  if (!match) return null
  const row = Number(match[1])
  const suffix = match[2].trim().toLowerCase()
  if (suffix.includes('item #') || suffix.includes('item') || suffix.includes('location')) return { row, kind: 'item' as const }
  if (suffix.includes('hazards observed')) return { row, kind: 'hazards' as const }
  if (suffix.includes('likelihood')) return { row, kind: 'likelihood' as const }
  if (suffix.includes('corrective measures')) return { row, kind: 'corrective' as const }
  if (suffix.includes('repeat')) return { row, kind: 'repeat' as const }
  if (suffix.includes('date resolved')) return { row, kind: 'dateResolved' as const }
  if (suffix.includes('comments') || suffix.includes('follow-up') || suffix.includes('near miss')) return { row, kind: 'comments' as const }
  return null
}

function parseWashroomChecklistItemFieldMeta(field: { label?: string }) {
  const raw = String(field.label ?? '').trim()
  const match = raw.match(/^\[WASHROOM_ITEM\](.+?)::(.*)$/)
  if (!match) return null
  return {
    item: String(match[1] ?? '').trim(),
    description: String(match[2] ?? '').trim(),
  }
}

function parseWashroomChecklistNotesFieldMeta(field: { label?: string }) {
  const raw = String(field.label ?? '').trim()
  const match = raw.match(/^\[WASHROOM_NOTES\](.+)$/)
  if (!match) return null
  return { item: String(match[1] ?? '').trim() }
}

function isWashroomChecklistMetaLabel(label?: string) {
  const raw = String(label ?? '').trim()
  return raw.startsWith('[WASHROOM_ITEM]') || raw.startsWith('[WASHROOM_NOTES]')
}

function isWashroomTopDetailsFieldLabel(label?: string) {
  const normalized = String(label ?? '').trim().toLowerCase()
  return (
    normalized === 'date of inspection' ||
    normalized === 'time' ||
    normalized === 'facility/location' ||
    normalized === 'name of inspector' ||
    normalized === 'signature'
  )
}

function parseLotoRowValue(value: string) {
  const raw = String(value ?? '').trim()
  if (!raw) {
    return { equipment: '', location: '', energyType: '', lockRemoved: '' }
  }
  const parts = raw.split('|').map((p) => p.trim())
  return {
    equipment: parts[0] ?? '',
    location: parts[1] ?? '',
    energyType: parts[2] ?? '',
    lockRemoved: parts[3] ?? '',
  }
}

function formatLotoRowValue(row: { equipment: string; location: string; energyType: string; lockRemoved: string }) {
  const normalized = [row.equipment, row.location, row.energyType, row.lockRemoved].map((v) => String(v ?? '').trim())
  if (normalized.every((v) => !v)) return ''
  return normalized.join(' | ')
}

function parseLotoRowNumber(label?: string) {
  const m = String(label ?? '').trim().match(/^(\d+)\)\s*:?\s*$/)
  if (!m) return null
  const n = Number(m[1])
  return Number.isFinite(n) ? n : null
}

function parseNoticeOfTransmittalCell(label?: string): { row: number; column: 'quantity' | 'itemNumber' | 'description' } | null {
  const raw = String(label ?? '').trim().toLowerCase()
  const match = raw.match(/^row\s*([1-5])\s*(quantity|item number|description)$/)
  if (!match) return null
  const row = Number(match[1])
  if (!Number.isFinite(row) || row < 1 || row > 5) return null
  const token = match[2]
  const column = token === 'item number' ? 'itemNumber' : (token as 'quantity' | 'description')
  return { row, column }
}

function parseWorkLogTableCell(
  label?: string
): { row: number; column: 'trade' | 'date' | 'startTime' | 'endTime' | 'regularHours' | 'overtimeHours' | 'numberOfGuys' | 'totalHours' } | null {
  const raw = String(label ?? '').trim().toLowerCase()
  const match = raw.match(/^row\s*([1-6])\s*(trade|date|start time|end time|regular hours|overtime hours|number of guys|total hours)$/)
  if (!match) return null
  const row = Number(match[1])
  if (!Number.isFinite(row) || row < 1 || row > 6) return null
  const keyMap: Record<string, 'trade' | 'date' | 'startTime' | 'endTime' | 'regularHours' | 'overtimeHours' | 'numberOfGuys' | 'totalHours'> = {
    trade: 'trade',
    date: 'date',
    'start time': 'startTime',
    'end time': 'endTime',
    'regular hours': 'regularHours',
    'overtime hours': 'overtimeHours',
    'number of guys': 'numberOfGuys',
    'total hours': 'totalHours',
  }
  return { row, column: keyMap[match[2]] }
}

type DynamicMatrixState = {
  columns: string[]
  rows: string[][]
}

function getNicheMatrixDefaultColumns(templateName?: string): string[] {
  const name = String(templateName ?? '').toLowerCase()
  if (/niche\s*pumps/.test(name)) {
    return [
      'Equipment',
      'Add oil to bearing',
      'Clean oiler bulbs and fill with oil',
      'Confirm oil level',
      'Clean bearing bracket',
      'Change oil in hydraulic units',
      'Listen for vibration',
      'Check for oil leaks at stuffing boxes and power piston',
      'Replace guards',
      'Remove any scale and additional cleaning',
      'Replace damaged seals',
      'Replace damaged impellor',
      'Check for loose parts',
      'Comments',
    ]
  }
  if (/niche\s*expansion\s*tanks/.test(name)) {
    return [
      'Equipment',
      'Inspect charging valve',
      'Recharge pressure if needed',
      'Inspect for corrosion',
      'Inspect for leaks',
      'Replace gaskets as required',
      'Replace defects as needed',
      'Clean fittings and valves',
    ]
  }
  if (/niche\s*buffer\s*tanks/.test(name)) {
    return [
      'Equipment',
      'Inspect for corrosion',
      'Determine metal thickness',
      'Determine min. metal temp.',
      'Ensure allowable working pressure',
      'Conduct hydrostatic test',
      'Inspect for leaks',
      'Replace damaged gaskets',
      'Inspect for defects',
      'Complete notes with authorized inspector',
    ]
  }
  if (/niche\s*air\s*seporators|niche\s*air\s*separators/.test(name)) {
    return [
      'Equipment',
      'Inspect for corrosion',
      'Inspect strainer and clean as required',
      'Inspect for leaks',
      'Replace damaged gaskets',
      'Clean fittings and valves',
      'Replace defects as needed',
    ]
  }
  return ['Equipment', 'Clean salt tank', 'Test system']
}

function getNicheMatrixDefaultRowLabels(templateName?: string): string[] {
  const name = String(templateName ?? '').toLowerCase()
  if (/niche\s*pumps/.test(name)) {
    return [
      'Hot Water',
      'P1 TACO Hot Water Located in: Mech. Room',
      'P2 TACO Hot Water Located in: Mech. Room',
      'P3 TACO Hot Water Located in: Mech. Room',
      'P4 TACO Hot Water Located in: Mech. Room',
      'P5 TACO Hot Water Located in: Mech. Room',
      'P6 TACO Hot Water Located in: Mech. Room',
      'P7 TACO Hot Water Located in: Mech. Room',
      'P8 TACO Hot Water Located in: Mech. Room',
      'Chilled Water',
      'P9 TACO Chilled Water Located in: Mech. Room',
      'P10 TACO Chilled Water Located in: Mech. Room',
      'P11 TACO Chilled Water Located in: Mech. Room',
      'P12 TACO Chilled Water Located in: Mech. Room',
      'P13 TACO Chilled Water Located in: Mech. Room',
      'P14 TACO Chilled Water Located in: Mech. Room',
      'Hot Water',
      'P15 TACO Hot Water Located in: Mech. Room',
      'P16 TACO Hot Water Located in: Mech. Room',
    ]
  }
  if (/niche\s*expansion\s*tanks/.test(name)) {
    return [
      'EXP-1, TACO 22 Gal Located in: Mech. Room',
      'EXP-2, TACO 24 Gal Located in: Mech. Room',
    ]
  }
  if (/niche\s*water\s*softener/.test(name)) {
    return [
      'EWS S30BF, EXCALIBER Located in: Mech. Room',
    ]
  }
  if (/niche\s*air\s*seporators|niche\s*air\s*separators/.test(name)) {
    return [
      'AS-1, TACO Air Separator Located in: Mech. Room',
    ]
  }
  if (/niche\s*buffer\s*tanks/.test(name)) {
    return [
      'BT-1, TACO Buffer Tank Located in: Mech. Room',
      'BT-2, TACO Buffer Tank Located in: Mech. Room',
      'BT-3, TACO Buffer Tank Located in: Mech. Room',
      'BT-4, TACO Buffer Tank Located in: Mech. Room',
      'BT-5, TACO Buffer Tank Located in: Mech. Room',
      'BT-6, TACO Buffer Tank Located in: Mech. Room',
      'BT-7, TACO Buffer Tank Located in: Mech. Room',
      'BT-8, TACO Buffer Tank Located in: Mech. Room',
    ]
  }
  return []
}

function getTestingVerificationDefDefaultColumns(templateName?: string): string[] {
  const name = String(templateName ?? '').toLowerCase()
  if (!/testing\s*and\s*verification\s*procedure\s*def/.test(name)) return []
  return ['Component', 'Yes', 'No', 'mA', 'Voltage', 'Amps', 'GPM', 'PSI', 'Serial #', 'Make/Model', 'Date', 'Comments']
}

function getTestingVerificationDefDefaultRowLabels(templateName?: string): string[] {
  const name = String(templateName ?? '').toLowerCase()
  if (!/testing\s*and\s*verification\s*procedure\s*def/.test(name)) return []
  return [
    'Is the diaphragm pumps have sufficient air pressure as per the design criteria?',
    'Is the air pressure entering the pump Filtered, Regulated & Lubricated?',
    'What is the regulator pressure set to?',
    'Is the Air Solenoid NC as per the design criteria?',
    'Is the Solenoid Actuated as per the Lead-Lag Design?',
    'Is there a signal on the solenoid?',
    'Is the diaphragm moving fluid?',
    'Is the Motorized valve in NC as per the design criteria?',
    'Is a Thermal Pressure Relief Valve installed down stream of the respective pump?',
    'Is a Safety Pressure Relief valve installed on the Outflow DEF process line?',
    'Is a Safety Pressure Relief valve installed on the inflow fill process line?',
    'Is the Motorized valve actuating as per the lead-lag design?',
    'Is the respective Motorized valve, Solenoid Valve & Pump all tied into one another for lead-lag design?',
    'Pump Tag: ____PUMP-1____',
    'What is the Solenoid air pressure entering the pump?',
    'What is the Flow Rate measured at dispenser?',
    'What is the Flow Rate measured at Flow Meter in Fuel Support Building?',
    'Which Dispenser is used to measured Flow Rate?',
    'Dispenser Number, Make and Model',
    'Dispenser Serial Number',
    'Dispenser calibration date',
    'How many DEF Dispensing Nozzles are open during this test?',
    'REPEAT Number of Dispensers open:',
    'Pump Tag: ____PUMP-2____',
    'What is the Solenoid air pressure entering the pump?',
    'What is the Flow Rate measured at dispenser?',
    'What is the Flow Rate measured at Flow Meter in Fuel Support Building?',
    'Which Dispenser is used to measured Flow Rate?',
    'Dispenser Number, Make and Model',
    'Dispenser Serial Number',
    'Dispenser calibration date',
    'How many DEF Dispensing Nozzles are open during this test?',
    'REPEAT Number of Dispensers open:',
    'MOTORIZED VALVE TAG: ____MV-1____',
    'Is there a Signal coming from the Motorized Valve?',
    'What is the Voltage?',
    'Does this Signal Represent Open or Closed?',
    'Is the Valve Visually Opened or Closed?',
    'MOTORIZED VALVE TAG: ____MV-2____',
    'Is there a Signal coming from the Motorized Valve?',
    'What is the Voltage?',
    'Does this Signal Represent Open or Closed?',
    'Is the Valve Opened or closed?',
    'SOLENOID VALVE TAG: ____SV-1____',
    'Is there a Signal coming from the Motorized Valve?',
    'What is the Voltage?',
    'Does this Signal Represent Open or Closed?',
    'Is the Valve Opened or closed?',
    'SOLENOID VALVE TAG: ____SV-2____',
    'Is there a Signal coming from the Motorized Valve?',
    'What is the Voltage?',
    'Does this Signal Represent Open or Closed?',
    'Is the Valve Opened or closed?',
    'Temperature Sensor Tag:',
    'Is there a mA signal from the Temperature Sensor?',
    'What is the Signal?',
    'What is the Temperature from the sensor?',
    'What is the Actual temperature measured from Thermometer?',
    'Measurement device Make and Model',
    'Measurement device Serial Number',
    'Measurement device calibration date',
    'Temperature Sensor Tag:',
    'Is there a signal from the Temperature Sensor?',
    'What is the Signal?',
    'What is the Temperature from the sensor?',
    'What is the actual temperature measured from Thermometer?',
    'Measurement device Make and Model',
    'Measurement device Serial Number',
    'Measurement device calibration date',
    'Pressure Sensor Tag:',
    'Is there a signal from the Pressure Sensor?',
    'What is the Signal? (mA)',
    'What is the Pressure from the sensor?',
    'What is the actual Pressure measured from nearest Pressure Gauge?',
    'Measurement device Make and Model',
    'Measurement device Serial Number',
    'Measurement device calibration date',
    'Is this inflow or outflow DEF Line?',
    'Pressure Sensor Tag:',
    'Is there a signal from the Pressure Sensor?',
    'What is the Signal?',
    'What is the Pressure from the sensor?',
    'What is the actual Pressure measured from nearest Pressure Gauge?',
    'Measurement device Make and Model',
    'Measurement device Serial Number',
    'Measurement device calibration date',
    'Is this inflow or outflow DEF Line?',
    'Differential Pressure Sensor Tag:',
    'Is there a signal from the Differential Pressure Sensor?',
    'What is the Signal?',
    'What is the Pressure from the sensor?',
    'What is the actual Pressure measured from nearest Pressure Gauge?',
    'Measurement device Make and Model',
    'Measurement device Serial Number',
    'Measurement device calibration date',
    'What is the associated Filter housing tag',
    'Differential Pressure Sensor Tag:',
    'What is the Signal',
    'What is the Pressure from the sensor?',
    'What is the actual Pressure measured from nearest Pressure Gauge?',
    'Measurement device Make and Model',
    'Measurement device Serial Number',
    'Measurement device calibration date',
    'What is the associated Filter housing tag',
    'Flow Meter Tag:',
    'What is the signal coming back from the flow meter?',
    'What is the GPM associated with this Dispenser?',
    'What is the flow Rate measured from Dispenser?',
    'Does this signal represent the same flow rate as measured at Dispenser?',
    'Measurement device Make and Model',
    'Measurement device Serial Number',
    'Measurement device calibration date',
    'What is the flow GPM',
    'How many Nozzles are activated?',
    'Flow Meter Tag:',
    'What is the signal coming back from the flow meter?',
    'What is the GPM associated with this Dispenser?',
    'What is the actual flow Rate measured from Dispenser?',
    'Does this signal represent the same flow rate as measured at Dispenser?',
    'Measurement device Make and Model',
    'Measurement device Serial Number',
    'Measurement device calibration date',
    'What is the flow GPM',
    'How many Nozzles are activated?',
    'Outgoing Flow Meter Test: Min & Max Conditions',
    'Test 1: 1 Dispenser Test:',
    'DEF Dispenser TAG',
    'Flow Rate from FSB Flow meter',
    'FSB Flow meter TAG',
    'Flow Rate from Dispenser',
    'Pump Moving Fluid? TAG',
    'E-Stop Function?',
    'Test 2: 4 Dispenser Test:',
    'DEF Dispenser TAG',
    'Flow Rate from FSB Flow meter',
    'FSB Flow meter TAG',
    'Flow Rate from Dispenser',
    'Pump Moving Fluid? TAG',
    'E-Stop Function?',
    'Incoming Flow Meter Test:',
    'Flow rate from External Test Pump',
    'Flow Rate from Flow meter',
    'External Test Pump Make and Model',
    'External Test Pump Serial Number',
    'External Test Pump calibration date',
    'Tank #1:',
    'Level Sensor:',
    'Is there a signal from Tank Level Sensor?',
    'What is the Sensor TAG',
    'What is the Signal?',
    'What is the actual height of the tank',
    'What is the signal height of the tank liquid?',
    '4 Float:',
    'Is there a signal from 4 float Sensor?',
    'What is the Sensor TAG?',
    'What is the Signal for LOW LOW?',
    'What is the Signal for LOW?',
    'What is the Signal for HIGH?',
    'What is the Signal for CRITICAL HIGH?',
    'What is the signal height of the tank liquid?',
    'Does the Motorized Valve on inlet close when Critical High Is reached?',
    'Tank Temperature Sensor:',
    'Is the Tank Heating element ON?',
    'What is the Heating Element FLA?',
    'What is the temperature sensor signal?',
    'What is the temperature of the fluid from the sensor?',
    'What is the Actual temperature of the fluid from the Thermometer?',
    'Thermometer Make and Model',
    'Thermometer Serial Number',
    'Thermometer calibration date',
    'Tank #2:',
    'Level Sensor:',
    'Is there a signal from Tank Level Sensor?',
    'What is the Sensor TAG',
    'What is the Signal?',
    'What is the actual height of the tank',
    'What is the signal height of the tank liquid?',
    '4 Float:',
    'Is there a signal from 4 float Sensor?',
    'What is the Sensor TAG?',
    'What is the Signal for LOW LOW?',
    'What is the Signal for LOW?',
    'What is the Signal for HIGH?',
    'What is the Signal for CRITICAL HIGH?',
    'What is the signal height of the tank liquid?',
    'Does the Motorized Valve on inlet close when Critical High Is reached?',
    'Tank Temperature Sensor:',
    'Is the Tank Heating element ON?',
    'What is the Heating Element FLA?',
    'What is the temperature sensor signal?',
    'What is the temperature of the fluid from the sensor?',
    'What is the Actual temperature of the fluid from the Thermometer?',
    'Thermometer Make and Model',
    'Thermometer Serial Number',
    'Thermometer calibration date',
  ]
}

function createDefaultDynamicMatrixState(defaultColumns?: string[], defaultRowLabels?: string[]): DynamicMatrixState {
  const columns = (defaultColumns && defaultColumns.length > 0)
    ? defaultColumns
    : getNicheMatrixDefaultColumns()
  const rowCount = Math.max(4, defaultRowLabels?.length ?? 0)
  const rows = Array.from({ length: rowCount }, (_, rowIdx) => {
    const base = Array.from({ length: columns.length }, () => '')
    if (defaultRowLabels && defaultRowLabels[rowIdx] && columns.length > 0) {
      base[0] = defaultRowLabels[rowIdx]
    }
    return base
  })
  return { columns, rows }
}

function parseDynamicMatrixState(raw: string | undefined, defaultColumns?: string[], defaultRowLabels?: string[]): DynamicMatrixState {
  if (!raw?.trim()) return createDefaultDynamicMatrixState(defaultColumns, defaultRowLabels)
  try {
    const parsed = JSON.parse(raw) as Partial<DynamicMatrixState>
    const columns = Array.isArray(parsed?.columns)
      ? parsed.columns.map((item) => String(item ?? '').trim() || 'Column')
      : []
    const baseline = createDefaultDynamicMatrixState(defaultColumns, defaultRowLabels)
    const baselineColumns = baseline.columns
    const normalizedColumns = columns.length > 0 ? columns : baselineColumns
    const hasGenericHeaders = normalizedColumns.some((col) => /^column(\s+\d+)?$/i.test(col.trim()))
    const hasBlankHeaders = normalizedColumns.some((col) => !col.trim())
    const effectiveColumns = (hasGenericHeaders || hasBlankHeaders) ? baselineColumns : normalizedColumns
    const rows = Array.isArray(parsed?.rows)
      ? parsed.rows.map((row) => {
          const cells = Array.isArray(row) ? row.map((cell) => String(cell ?? '')) : []
          if (cells.length < effectiveColumns.length) {
            return [...cells, ...Array.from({ length: effectiveColumns.length - cells.length }, () => '')]
          }
          return cells.slice(0, effectiveColumns.length)
        })
      : []
    let normalizedRows = rows.length > 0
      ? rows
      : Array.from({ length: 4 }, () => Array.from({ length: effectiveColumns.length }, () => ''))
    if (defaultRowLabels && defaultRowLabels.length > 0 && effectiveColumns.length > 0) {
      normalizedRows = normalizedRows.map((row, idx) => {
        if (idx >= defaultRowLabels.length) return row
        const firstCell = String(row[0] ?? '').trim()
        if (firstCell) return row
        return [defaultRowLabels[idx], ...row.slice(1)]
      })
    }
    return { columns: effectiveColumns, rows: normalizedRows }
  } catch {
    return createDefaultDynamicMatrixState(defaultColumns, defaultRowLabels)
  }
}

export function FormFill({ forceKissMode = false }: { forceKissMode?: boolean } = {}) {
  const { templateId } = useParams<{ templateId: string }>()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const isKissMode = forceKissMode || searchParams.get('kiss') === '1'
  const assignmentId = searchParams.get('assignmentId')
  const jobIdFromUrl = searchParams.get('jobId')
  const draftIdFromUrl = searchParams.get('draftId')
  const forceNewDraftFromUrl = searchParams.get('new') === '1'
  const { session } = useAuth()
  const { user } = useUser()
  const { employees } = useEmployees()
  const isAuthenticated = !!session

  const [template, setTemplate] = useState<Awaited<ReturnType<typeof getPdfTemplate>>>(null)
  const [submissionId, setSubmissionId] = useState<string | null>(null)
  const [submissionStatus, setSubmissionStatus] = useState<string | null>(null)
  const [resubmissionReason, setResubmissionReason] = useState<string | null>(null)
  const [toolboxExtraPdfBlobPath, setToolboxExtraPdfBlobPath] = useState<string | null>(null)
  const [toolboxExtraPdfOriginalName, setToolboxExtraPdfOriginalName] = useState<string | null>(null)
  const [toolboxExtraPdfFile, setToolboxExtraPdfFile] = useState<File | null>(null)
  const [toolboxExtraPdfUploading, setToolboxExtraPdfUploading] = useState(false)
  const [toolboxExtraPdfRemoving, setToolboxExtraPdfRemoving] = useState(false)
  const [toolboxExtraPdfError, setToolboxExtraPdfError] = useState<string | null>(null)
  const [toolboxExtraPdfEmbedUrl, setToolboxExtraPdfEmbedUrl] = useState<string | null>(null)
  const [toolboxExtraPdfEmbedLoading, setToolboxExtraPdfEmbedLoading] = useState(false)
  const [toolboxExtraPdfEmbedError, setToolboxExtraPdfEmbedError] = useState<string | null>(null)
  const [toolboxTopics, setToolboxTopics] = useState<ToolboxTopicRecord[]>([])
  const [toolboxTopicsLoading, setToolboxTopicsLoading] = useState(false)
  const [toolboxTopicsError, setToolboxTopicsError] = useState<string | null>(null)
  const [toolboxTopicSearch, setToolboxTopicSearch] = useState('')
  const [selectedToolboxTopicId, setSelectedToolboxTopicId] = useState<string>('')
  const [toolboxTopicAttachBusy, setToolboxTopicAttachBusy] = useState(false)
  const [signatureSaveError, setSignatureSaveError] = useState<string | null>(null)
  const [clearAllBusy, setClearAllBusy] = useState(false)
  const [values, setValues] = useState<Record<string, string>>({})
  const [pageImages, setPageImages] = useState<string[]>([])
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState({ width: 0, height: 0 })
  const [sigField, setSigField] = useState<{
    id: string
    label?: string
    nameFieldId?: string
    /** Hot Work on-device: typed print name before opening the signature pad */
    hotWorkPrintName?: string
  } | null>(null)
  const [loadedSignatures, setLoadedSignatures] = useState<
    Array<{ fieldId?: string | null; signedAt?: string; imageData?: string; signerId?: string; signerName?: string; signerRole?: string }>
  >([])
  const [errors, setErrors] = useState<string[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [loading, setLoading] = useState(true)
  const [pdfError, setPdfError] = useState<string | null>(null)
  const [customTitle, setCustomTitle] = useState('')
  const [submitModalOpen, setSubmitModalOpen] = useState(false)
  const [equipmentLinkModalOpen, setEquipmentLinkModalOpen] = useState(false)
  const [equipmentList, setEquipmentList] = useState<any[]>([])
  const [selectedEquipmentId, setSelectedEquipmentId] = useState('')
  const [equipmentLinkLoading, setEquipmentLinkLoading] = useState(false)
  const signerOptions = useMemo(
    () =>
      (employees ?? [])
        .map((e: any) => ({ id: e.id, name: `${e.firstName ?? ''} ${e.lastName ?? ''}`.trim() }))
        .filter((e: any) => e.id && e.name)
        .sort((a: any, b: any) => a.name.localeCompare(b.name)),
    [employees]
  )
  const dhaSupervisorOptions = useMemo(
    () =>
      (employees ?? [])
        .filter((e: any) => {
          const role = String(e?.role ?? '').trim().toLowerCase()
          return role === 'supervisor' || role === 'hr' || role === 'owner'
        })
        .map((e: any) => ({ id: e.id, name: `${e.firstName ?? ''} ${e.lastName ?? ''}`.trim() }))
        .filter((e: any) => e.id && e.name)
        .sort((a: any, b: any) => a.name.localeCompare(b.name)),
    [employees]
  )
  const [selectedSignerIds, setSelectedSignerIds] = useState<string[]>([])
  /** Hot Work: map signature field id → labourer user id to notify for that line */
  const [hotWorkRemoteSignerByFieldId, setHotWorkRemoteSignerByFieldId] = useState<Record<string, string>>({})
  /** Hot Work: print name typed before signing on this device (like DHA visitor / worker name) */
  const [hotWorkPrintNameByFieldId, setHotWorkPrintNameByFieldId] = useState<Record<string, string>>({})
  const [toolboxSigningWorkerId, setToolboxSigningWorkerId] = useState('')
  const [toolboxVisitorName, setToolboxVisitorName] = useState('')
  const [collectSigningWorkerId, setCollectSigningWorkerId] = useState('')
  const [collectVisitorName, setCollectVisitorName] = useState('')
  const [collectSignerType, setCollectSignerType] = useState<'worker' | 'visitor'>('worker')
  const [collectBusy, setCollectBusy] = useState(false)
  const isCustomTemplate = Boolean(template?.filePath?.startsWith(CUSTOM_TEMPLATE_PREFIX))

  /** PDF templates in KISS mode: signature fields get the multi-signer + draw flow (not the flat text list). */
  const kissPdfSignatureFields = useMemo(() => {
    if (!template?.fields || isCustomTemplate || !isKissMode) return []
    return template.fields.filter((f) => fieldTypeNorm(f.type) === 'SIGNATURE')
  }, [template?.fields, isCustomTemplate, isKissMode])

  // Custom Form special signature logic
  const [signingWorkerId, setSigningWorkerId] = useState<string>('')
  const [isSigningWorker, setIsSigningWorker] = useState(false)

  const autosaveRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const titleAutosaveRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const toolboxExtraPdfInputRef = useRef<HTMLInputElement | null>(null)
  const toolboxTopicAttachRequestSeqRef = useRef(0)

  const [jobOptions, setJobOptions] = useState<{ id: string; label: string }[]>([])
  const [selectedJobId, setSelectedJobId] = useState(() => jobIdFromUrl ?? '')
  const [dhaProjectFallback, setDhaProjectFallback] = useState('')
  const [dhaWeatherFallback, setDhaWeatherFallback] = useState('')
  const [dhaNearestHospitalFallback, setDhaNearestHospitalFallback] = useState('')
  const [dhaEmergencyCoordinatorFallback, setDhaEmergencyCoordinatorFallback] = useState('')
  const [dhaWeatherConditionFallback, setDhaWeatherConditionFallback] = useState<Record<string, boolean>>({})
  const [dhaExternalHazardFallback, setDhaExternalHazardFallback] = useState<Record<string, boolean>>({})
  const [dhaToolsConditionFallback, setDhaToolsConditionFallback] = useState('')
  const [dhaAdditionalCommentsFallback, setDhaAdditionalCommentsFallback] = useState('')
  const [dhaCustomJhaRows, setDhaCustomJhaRows] = useState<Array<{ id: string; job: string; hazards: string; controls: string; riskBefore: string; riskAfter: string }>>([])
  const [dhaViolenceAnswers, setDhaViolenceAnswers] = useState<Record<number, 'Yes' | 'No' | ''>>({})
  const [dhaViolenceActionsFallback, setDhaViolenceActionsFallback] = useState('')
  const [dhaPresets, setDhaPresets] = useState<DhaPreset[]>([])
  const [selectedDhaPresetId, setSelectedDhaPresetId] = useState('')
  const [showSaveDhaPresetModal, setShowSaveDhaPresetModal] = useState(false)
  const [dhaPresetName, setDhaPresetName] = useState('')
  const [savingDhaPreset, setSavingDhaPreset] = useState(false)
  const [dhaSavedDrafts, setDhaSavedDrafts] = useState<
    Array<{ id: string; title?: string; templateName?: string; createdAt?: string; jobId?: string }>
  >([])
  const [dhaSavedDraftsLoading, setDhaSavedDraftsLoading] = useState(false)
  const [deletingDraftId, setDeletingDraftId] = useState<string | null>(null)
  const [dhaSavedToList, setDhaSavedToList] = useState(false)
  const [dhaSaveDraftMessage, setDhaSaveDraftMessage] = useState<string | null>(null)
  const [dhaSaveDraftBusy, setDhaSaveDraftBusy] = useState(false)
  const isDailyHazardTemplateName = /daily\s*hazard|daily\s*jha/i.test(String(template?.name ?? ''))
  const isHotWorkPermitTemplate = /hot\s*work\s*permit/i.test(String(template?.name ?? ''))
  const hotWorkSignatureFields = useMemo(() => {
    if (!isHotWorkPermitTemplate || !template?.fields) return []
    return template.fields
      .filter((f) => fieldTypeNorm(f.type) === 'SIGNATURE')
      .sort((a, b) => (a.page ?? 1) - (b.page ?? 1) || (a.y ?? 0) - (b.y ?? 0) || (a.x ?? 0) - (b.x ?? 0))
  }, [isHotWorkPermitTemplate, template?.fields])

  useEffect(() => {
    setSelectedJobId(jobIdFromUrl ?? '')
  }, [jobIdFromUrl])

  useEffect(() => {
    if (!isAuthenticated || !user?.role) return
    const load =
      user.role === 'supervisor'
        ? fetchMyJobs().then((list) =>
            list.map((j) => ({ id: j.id, label: `${j.title}${j.siteName ? ` · ${j.siteName}` : ''}` }))
          )
        : fetchJobs().then((list) =>
            list.map((j) => ({ id: j.id, label: `${j.title}${j.siteName ? ` · ${j.siteName}` : ''}` }))
          )
    load.then(setJobOptions).catch(() => setJobOptions([]))
  }, [isAuthenticated, user?.role])

  useEffect(() => {
    if (!isDailyHazardTemplateName || !isAuthenticated) return
    fetchDhaPresets().then(setDhaPresets).catch(() => setDhaPresets([]))
  }, [isDailyHazardTemplateName, isAuthenticated])

  const refreshDhaSavedDrafts = useCallback(async () => {
    if (!templateId || !isAuthenticated || !user?.id) return
    setDhaSavedDraftsLoading(true)
    try {
      const list = await fetchPdfSubmissions({ status: 'DRAFT' })
      setDhaSavedDrafts(
        list
          .filter(
            (s) =>
              s.templateId === templateId &&
              s.submittedById === user.id &&
              s.userSavedDraft !== false
          )
          .sort((a, b) => {
            const at = Date.parse(String(a.createdAt ?? '')) || 0
            const bt = Date.parse(String(b.createdAt ?? '')) || 0
            return bt - at
          })
          .map((s) => ({
            id: s.id,
            title: s.title,
            templateName: s.templateName,
            createdAt: s.createdAt,
            jobId: s.jobId,
          }))
      )
    } catch {
      setDhaSavedDrafts([])
    } finally {
      setDhaSavedDraftsLoading(false)
    }
  }, [templateId, isAuthenticated, user?.id])

  useEffect(() => {
    if (!isDailyHazardTemplateName) return
    void refreshDhaSavedDrafts()
  }, [isDailyHazardTemplateName, refreshDhaSavedDrafts, submissionId])

  const applyLoadedSubmission = useCallback(
    (sub: {
      id: string
      title?: string | null
      status?: string
      fieldValues?: any
      extraPdfBlobPath?: string | null
      extraPdfOriginalName?: string | null
      selectedToolboxTopicId?: string | null
      resubmissionReason?: string | null
    }, defaultTemplateTitle?: string) => {
      setSubmissionId(sub.id)
      const savedTitle = String(sub.title ?? '').trim()
      if (savedTitle) setCustomTitle(savedTitle)
      else if (defaultTemplateTitle) setCustomTitle(defaultTemplateTitle)
      setSubmissionStatus(sub.status ?? null)
      setResubmissionReason(sub.resubmissionReason ?? null)
      setToolboxExtraPdfBlobPath(sub.extraPdfBlobPath ?? null)
      setToolboxExtraPdfOriginalName(sub.extraPdfOriginalName ?? null)
      setSelectedToolboxTopicId(sub.selectedToolboxTopicId ?? '')
      if (defaultTemplateTitle && /daily\s*hazard|daily\s*jha/i.test(defaultTemplateTitle)) {
        setDhaSavedToList(isDhaUserSavedDraftFieldValues(sub.fieldValues))
      }
      if (sub.fieldValues) {
        const initial = { ...sub.fieldValues }
        delete initial.__signatures__
        setValues(initial)
        setLoadedSignatures(sub.fieldValues.__signatures__ || [])
        if (typeof sub.fieldValues.__dha_weather__ === 'string') setDhaWeatherFallback(sub.fieldValues.__dha_weather__)
        if (typeof sub.fieldValues.__dha_nearest_hospital__ === 'string') {
          setDhaNearestHospitalFallback(sub.fieldValues.__dha_nearest_hospital__)
        }
        if (typeof sub.fieldValues.__dha_emergency_coordinator__ === 'string') {
          setDhaEmergencyCoordinatorFallback(sub.fieldValues.__dha_emergency_coordinator__)
        }
        if (typeof sub.fieldValues.__dha_violence_actions__ === 'string') {
          setDhaViolenceActionsFallback(sub.fieldValues.__dha_violence_actions__)
        }
        if (typeof sub.fieldValues.__dha_weather_conditions__ === 'string') {
          const tokens = String(sub.fieldValues.__dha_weather_conditions__)
            .split('|')
            .map((s: string) => s.trim())
            .filter(Boolean)
          setDhaWeatherConditionFallback(tokens.reduce((acc: Record<string, boolean>, t: string) => ({ ...acc, [t]: true }), {}))
        }
        const loadedViolence: Record<number, 'Yes' | 'No' | ''> = {}
        DHA_WORKPLACE_VIOLENCE_QUESTIONS.forEach((_, idx) => {
          const v = String(sub.fieldValues[`__dha_violence_q_${idx}__`] ?? '')
            .trim()
            .toLowerCase()
          loadedViolence[idx] = v === 'yes' ? 'Yes' : v === 'no' ? 'No' : ''
        })
        if (Object.values(loadedViolence).some(Boolean)) setDhaViolenceAnswers(loadedViolence)
        const savedJobId =
          typeof sub.fieldValues.__jobId__ === 'string' ? sub.fieldValues.__jobId__.trim() : ''
        if (savedJobId && !jobIdFromUrl) setSelectedJobId(savedJobId)
      } else {
        setValues({})
        setLoadedSignatures([])
      }
    },
    [jobIdFromUrl]
  )

  const resetFormForFreshDraft = useCallback(() => {
    setValues({})
    setLoadedSignatures([])
    setDhaProjectFallback('')
    setDhaWeatherFallback('')
    setDhaNearestHospitalFallback('')
    setDhaEmergencyCoordinatorFallback('')
    setDhaWeatherConditionFallback({})
    setDhaExternalHazardFallback({})
    setDhaToolsConditionFallback('')
    setDhaAdditionalCommentsFallback('')
    setDhaCustomJhaRows([])
    setDhaViolenceAnswers({})
    setDhaViolenceActionsFallback('')
    setHotWorkRemoteSignerByFieldId({})
    setHotWorkPrintNameByFieldId({})
    setSelectedSignerIds([])
    setErrors([])
    setCustomTitle('')
    setToolboxExtraPdfBlobPath(null)
    setToolboxExtraPdfOriginalName(null)
    setSelectedToolboxTopicId('')
  }, [])

  // Load template + create or resume draft submission
  useEffect(() => {
    if (!templateId || !isAuthenticated) return
    setLoading(true)
    setPdfError(null)
    const jobPayload = (jobIdFromUrl ?? selectedJobId).trim() ? (jobIdFromUrl ?? selectedJobId).trim() : undefined
    const openDraftId = forceNewDraftFromUrl ? undefined : draftIdFromUrl || undefined

    getPdfTemplate(templateId)
      .then(async (tmpl) => {
        if (!tmpl) throw new Error('Template not found')
        setTemplate(tmpl)
        const isDhaTemplate = /daily\s*hazard|daily\s*jha/i.test(String(tmpl.name ?? ''))
        const reuseDraft = openDraftId ? true : !isDhaTemplate
        const { data: sub } = await api.post<{
          id: string
          title?: string | null
          status?: string
          fieldValues?: any
          extraPdfBlobPath?: string | null
          extraPdfOriginalName?: string | null
          selectedToolboxTopicId?: string | null
          resubmissionReason?: string | null
        }>('/pdf-submissions', {
          templateId,
          jobId: jobPayload,
          reuseDraft,
          draftId: openDraftId,
        })
        applyLoadedSubmission(sub, isDhaTemplate ? String(tmpl.name ?? '').trim() : undefined)
        setLoading(false)
      })
      .catch((err) => {
        console.error('FormFill load error:', err)
        setPdfError(err?.message ?? 'Failed to load form')
        setLoading(false)
      })
  }, [templateId, isAuthenticated, draftIdFromUrl, jobIdFromUrl, forceNewDraftFromUrl, applyLoadedSubmission])

  // Keep linked job on the current draft without recreating the submission (DHA supports multiple drafts).
  useEffect(() => {
    if (!submissionId || submissionStatus !== 'DRAFT') return
    const jobId = selectedJobId.trim()
    api
      .patch(`/pdf-submissions/${submissionId}/values`, {
        values: [{ fieldId: '__jobId__', value: jobId }],
      })
      .catch((err) => console.error('Failed to update linked job on draft:', err))
  }, [selectedJobId, submissionId, submissionStatus])

  useEffect(() => {
    if (!submissionId || submissionStatus !== 'DRAFT' || !isDailyHazardTemplateName) return
    if (titleAutosaveRef.current) clearTimeout(titleAutosaveRef.current)
    titleAutosaveRef.current = setTimeout(() => {
      const title = customTitle.trim() || String(template?.name ?? '').trim()
      if (!title) return
      api
        .patch(`/pdf-submissions/${submissionId}/title`, { title })
        .then(() => refreshDhaSavedDrafts())
        .catch((err) => console.error('Draft title autosave error:', err))
    }, 800)
    return () => {
      if (titleAutosaveRef.current) clearTimeout(titleAutosaveRef.current)
    }
  }, [
    customTitle,
    submissionId,
    submissionStatus,
    isDailyHazardTemplateName,
    template?.name,
    refreshDhaSavedDrafts,
  ])

  const handleSaveDhaDraftToList = useCallback(async () => {
    if (!submissionId || !template) return
    setDhaSaveDraftBusy(true)
    setDhaSaveDraftMessage(null)
    try {
      const submitValues = mergeDailyHazardSubmitValues({
        values,
        templateFields: template.fields ?? [],
        dhaWeatherFallback,
        dhaNearestHospitalFallback,
        dhaEmergencyCoordinatorFallback,
        dhaViolenceActionsFallback,
        dhaViolenceAnswers,
        dhaWeatherConditionFallback,
      })
      const valArray = Object.entries(submitValues)
        .filter(([, v]) => v != null && String(v).trim() !== '')
        .map(([fieldId, value]) => ({ fieldId, value: String(value) }))
      valArray.push({ fieldId: DHA_USER_SAVED_DRAFT_KEY, value: '1' })
      await api.patch(`/pdf-submissions/${submissionId}/values`, { values: valArray })
      const title = customTitle.trim() || String(template.name ?? '').trim()
      if (title) await api.patch(`/pdf-submissions/${submissionId}/title`, { title })
      setDhaSavedToList(true)
      setDhaSaveDraftMessage('Draft saved. It will appear in Saved DHA drafts and My Drafts.')
      void refreshDhaSavedDrafts()
    } catch (err: any) {
      setDhaSaveDraftMessage(err?.response?.data?.error ?? err?.message ?? 'Failed to save draft.')
    } finally {
      setDhaSaveDraftBusy(false)
    }
  }, [
    submissionId,
    template,
    values,
    customTitle,
    dhaWeatherFallback,
    dhaNearestHospitalFallback,
    dhaEmergencyCoordinatorFallback,
    dhaViolenceActionsFallback,
    dhaViolenceAnswers,
    dhaWeatherConditionFallback,
    refreshDhaSavedDrafts,
  ])

  const handleDeleteDhaDraft = useCallback(
    async (draftId: string, draftLabel: string, isCurrent: boolean) => {
      if (!window.confirm(`Delete draft "${draftLabel}"? This cannot be undone.`)) return
      setDeletingDraftId(draftId)
      try {
        await deleteDraftPdfSubmissions([draftId])
        if (isCurrent) {
          navigate('/library')
        } else {
          void refreshDhaSavedDrafts()
        }
      } catch (err: any) {
        alert(err?.response?.data?.error ?? err?.message ?? 'Failed to delete draft.')
      } finally {
        setDeletingDraftId(null)
      }
    },
    [navigate, refreshDhaSavedDrafts]
  )

  const handleDeleteCurrentDraft = useCallback(async () => {
    if (!submissionId || submissionStatus !== 'DRAFT') return
    const label =
      customTitle.trim() || template?.name || 'this draft'
    if (isDailyHazardTemplateName) {
      await handleDeleteDhaDraft(submissionId, label, true)
      return
    }
    if (!window.confirm(`Delete draft "${label}"? This cannot be undone.`)) return
    setDeletingDraftId(submissionId)
    try {
      await deleteDraftPdfSubmissions([submissionId])
      navigate('/library')
    } catch (err: any) {
      alert(err?.response?.data?.error ?? err?.message ?? 'Failed to delete draft.')
    } finally {
      setDeletingDraftId(null)
    }
  }, [
    submissionId,
    submissionStatus,
    customTitle,
    template?.name,
    isDailyHazardTemplateName,
    handleDeleteDhaDraft,
    navigate,
  ])

  const handleStartNewDhaDraft = useCallback(async () => {
    if (!templateId || !isAuthenticated || !isDailyHazardTemplateName) return
    const unsavedNote = dhaSavedToList
      ? 'Your current draft stays in Saved DHA drafts.'
      : 'Any work on this form that you have not saved as a draft will be discarded.'
    const ok = window.confirm(`Start a new Daily Hazard Analysis? ${unsavedNote}`)
    if (!ok) return
    setLoading(true)
    setPdfError(null)
    try {
      if (submissionId && !dhaSavedToList) {
        await deleteDraftPdfSubmissions([submissionId]).catch(() => {})
      }
      const jobPayload = selectedJobId.trim() ? selectedJobId.trim() : undefined
      const defaultTitle = String(template?.name ?? '').trim() || 'Daily Hazard Analysis'
      const { data: sub } = await api.post<{
        id: string
        title?: string | null
        status?: string
        fieldValues?: any
        extraPdfBlobPath?: string | null
        extraPdfOriginalName?: string | null
        selectedToolboxTopicId?: string | null
        resubmissionReason?: string | null
      }>('/pdf-submissions', { templateId, jobId: jobPayload, reuseDraft: false })
      resetFormForFreshDraft()
      setCustomTitle(defaultTitle)
      setDhaSavedToList(false)
      setDhaSaveDraftMessage(null)
      applyLoadedSubmission(sub, defaultTitle)
      await api.patch(`/pdf-submissions/${sub.id}/title`, { title: defaultTitle }).catch(() => {})
      const params = new URLSearchParams()
      if (selectedJobId.trim()) params.set('jobId', selectedJobId.trim())
      const qs = params.toString()
      navigate(qs ? `/forms/new/${templateId}?${qs}` : `/forms/new/${templateId}`, { replace: true })
      void refreshDhaSavedDrafts()
    } catch (err: any) {
      setPdfError(err?.response?.data?.error ?? err?.message ?? 'Failed to start a new draft')
    } finally {
      setLoading(false)
    }
  }, [
    templateId,
    template?.name,
    isAuthenticated,
    isDailyHazardTemplateName,
    selectedJobId,
    submissionId,
    dhaSavedToList,
    resetFormForFreshDraft,
    applyLoadedSubmission,
    navigate,
    refreshDhaSavedDrafts,
  ])

  // Load PDF pages when template has filePath
  useEffect(() => {
    if (!template?.filePath || isCustomTemplate) return
    fetchPdfBlob(template.filePath)
      .then(blobToDataUrl)
      .then((dataUrl) => pdfDataUrlToImageDataUrls(dataUrl))
      .then(setPageImages)
      .catch(() => setPageImages([]))
  }, [template?.filePath, isCustomTemplate])

  // Report page size from first page image
  useEffect(() => {
    if (!containerRef.current || !pageImages[currentPage - 1]) return
    const img = new Image()
    img.onload = () => setPageSize({ width: img.naturalWidth, height: img.naturalHeight })
    img.src = pageImages[currentPage - 1]
  }, [pageImages, currentPage])

  useEffect(() => {
    if (!toolboxExtraPdfBlobPath) {
      setToolboxExtraPdfEmbedUrl(null)
      setToolboxExtraPdfEmbedLoading(false)
      setToolboxExtraPdfEmbedError(null)
      return
    }

    let cancelled = false
    let objectUrl: string | null = null
    setToolboxExtraPdfEmbedLoading(true)
    setToolboxExtraPdfEmbedError(null)

    fetchPdfBlob(toolboxExtraPdfBlobPath)
      .then((blob) => {
        if (cancelled) return
        objectUrl = URL.createObjectURL(blob)
        setToolboxExtraPdfEmbedUrl(objectUrl)
      })
      .catch((err: any) => {
        if (cancelled) return
        setToolboxExtraPdfEmbedUrl(null)
        setToolboxExtraPdfEmbedError(err?.response?.data?.error ?? err?.message ?? 'Could not load inline PDF preview.')
      })
      .finally(() => {
        if (!cancelled) setToolboxExtraPdfEmbedLoading(false)
      })

    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [toolboxExtraPdfBlobPath])

  const toolboxTitleFieldId = useMemo(() => {
    const field = (template?.fields ?? []).find((f) => isToolboxTitleLabel(parseCustomFieldSpec(f.label)?.label ?? f.label))
    return field?.id ?? ''
  }, [template?.fields])

  const toolboxControlMeasuresFieldId = useMemo(() => {
    const field = (template?.fields ?? []).find((f) =>
      isToolboxControlMeasuresLabel(parseCustomFieldSpec(f.label)?.label ?? f.label)
    )
    return field?.id ?? ''
  }, [template?.fields])

  const hasToolboxTopicAutofillFields = Boolean(toolboxTitleFieldId && toolboxControlMeasuresFieldId)

  useEffect(() => {
    if (!hasToolboxTopicAutofillFields) return
    let cancelled = false
    setToolboxTopicsLoading(true)
    setToolboxTopicsError(null)

    const timer = setTimeout(() => {
      fetchToolboxTopics({ search: toolboxTopicSearch.trim() || undefined, limit: 200 })
        .then((result) => {
          if (cancelled) return
          setToolboxTopics(result.items)
        })
        .catch((err: any) => {
          if (cancelled) return
          setToolboxTopicsError(err?.response?.data?.error ?? err?.message ?? 'Could not load toolbox topics.')
          setToolboxTopics([])
        })
        .finally(() => {
          if (!cancelled) setToolboxTopicsLoading(false)
        })
    }, 250)

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [hasToolboxTopicAutofillFields, toolboxTopicSearch])

  const scheduleAutosave = useCallback(
    (newValues: Record<string, string>) => {
      if (!submissionId || !isAuthenticated) return
      if (autosaveRef.current) clearTimeout(autosaveRef.current)
      autosaveRef.current = setTimeout(() => {
        const valArray = Object.entries(newValues)
          .filter(([, v]) => v !== '')
          .map(([fieldId, value]) => ({ fieldId, value }))
        if (valArray.length === 0) return
        api.patch(`/pdf-submissions/${submissionId}/values`, { values: valArray }).catch((err) =>
          console.error('Autosave error:', err)
        )
      }, 800)
    },
    [submissionId, isAuthenticated]
  )

  const handleValueChange = useCallback(
    (fieldId: string, value: string) => {
      setValues((prev) => {
        const updated = { ...prev, [fieldId]: value }
        scheduleAutosave(updated)
        return updated
      })
    },
    [scheduleAutosave]
  )

  const washroomLocationFieldId = useMemo(() => {
    if (!template?.fields?.length || !isWashroomInspectionStyleTemplateName(template.name)) return ''
    const found = template.fields.find(
      (x) => String(parseCustomFieldSpec(x.label)?.label ?? '').trim() === WASHROOM_LOCATION_DROPDOWN_LABEL
    )
    return found?.id ?? ''
  }, [template?.fields, template?.name])

  const washroomPresetPrevLocRef = useRef<string | undefined>(undefined)

  useEffect(() => {
    washroomPresetPrevLocRef.current = undefined
  }, [templateId, submissionId])

  // Washroom: defaults from location dropdown (or legacy template name if no dropdown).
  useEffect(() => {
    if (loading || !template?.fields?.length || !submissionId) return
    if (submissionStatus !== 'DRAFT') return
    if (!isWashroomInspectionStyleTemplateName(template.name)) return

    const fields = template.fields
    const itemFields = fields.filter((f) => parseWashroomChecklistItemFieldMeta(f))
    if (itemFields.length === 0) return

    const escalationField = fields.find((f) => {
      const l = String(parseCustomFieldSpec(f.label)?.label ?? f.label ?? '').trim().toLowerCase()
      return l.includes('concerns/observations') && l.includes('escalat')
    })

    const feminineItem = 'Feminine Products disposal or bags'
    const applyPreset = (base: Record<string, string>, kind: 'peter_or_shop' | 'main_office') => {
      const next = { ...base }
      for (const f of itemFields) {
        const meta = parseWashroomChecklistItemFieldMeta(f)
        if (!meta) continue
        if (kind === 'peter_or_shop') {
          next[f.id] = meta.item === feminineItem ? 'na' : 'yes'
        } else {
          next[f.id] = 'yes'
        }
      }
      if (escalationField?.id && !String(next[escalationField.id] ?? '').trim()) {
        next[escalationField.id] = WASHROOM_ESCALATION_DEFAULT_TEXT
      }
      return next
    }

    const allChoicesEmpty = itemFields.every((f) => normalizeWashroomChecklistChoice(values[f.id]) === '')

    if (washroomLocationFieldId) {
      const loc = String(values[washroomLocationFieldId] ?? '').trim()
      const prev = washroomPresetPrevLocRef.current

      if (!loc) {
        setValues((prevVals) => {
          const next = applyPreset({ ...prevVals, [washroomLocationFieldId]: 'Peter Washroom' }, 'peter_or_shop')
          scheduleAutosave(next)
          return next
        })
        washroomPresetPrevLocRef.current = 'Peter Washroom'
        return
      }

      const presetKind = getWashroomSitePresetFromLocationSelection(loc)
      if (!presetKind) {
        washroomPresetPrevLocRef.current = loc
        return
      }

      const locationChanged = prev !== undefined && prev !== loc
      const initialApply = prev === undefined
      if (!locationChanged && !(initialApply && allChoicesEmpty)) {
        washroomPresetPrevLocRef.current = loc
        return
      }

      setValues((prevVals) => {
        const next = applyPreset(prevVals, presetKind)
        scheduleAutosave(next)
        return next
      })
      washroomPresetPrevLocRef.current = loc
      return
    }

    const presetKind = getWashroomSiteTemplatePreset(template.name)
    if (!presetKind) return
    if (itemFields.some((f) => normalizeWashroomChecklistChoice(values[f.id]) !== '')) return

    const next = applyPreset(values, presetKind)
    setValues(next)
    scheduleAutosave(next)
  }, [
    loading,
    template?.fields,
    template?.name,
    submissionId,
    submissionStatus,
    washroomLocationFieldId,
    values,
    scheduleAutosave,
  ])

  useEffect(() => {
    if (loading || !template?.fields?.length || !submissionId) return
    if (submissionStatus !== 'DRAFT') return
    if (!/interim\s*2\s*pm\s*checklist/i.test(String(template.name ?? ''))) return

    const defaults: Record<string, string> = {
      'project/site': 'VIA RAIL - TMC - INTERIM 2',
      'building/location': 'FUEL SUPPORT BUILDING &/OR FUELING CANOPY',
      version: '1.1',
      'date modified': '03-31-2026',
      'review note':
        'Note: This filled out checklist has been reviewed. Its completion is approved as noted:',
    }

    setValues((prev) => {
      const next = { ...prev }
      let changed = false
      for (const field of template.fields ?? []) {
        const label = String(parseCustomFieldSpec(field.label)?.label ?? field.label ?? '')
          .trim()
          .toLowerCase()
        const defaultVal = defaults[label]
        if (defaultVal && !String(next[field.id] ?? '').trim()) {
          next[field.id] = defaultVal
          changed = true
        }
        const pageNum = parseInterim2PmPageNumFromMatrixLabel(field.label)
        if (pageNum != null && !String(next[field.id] ?? '').trim()) {
          const matrixDefaults = getInterim2PmMatrixDefaults(pageNum)
          if (matrixDefaults) {
            next[field.id] = JSON.stringify(matrixDefaults)
            changed = true
          }
        }
      }
      if (changed) scheduleAutosave(next)
      return changed ? next : prev
    })
  }, [loading, template?.fields, template?.name, submissionId, submissionStatus, scheduleAutosave])

  // If the draft submission ID becomes stale (e.g. backend restart / reconnect),
  // backend calls can return 404 "Submission not found". In that case we recreate/reuse
  // the draft for the current template and retry once.
  const refreshDraftSubmission = useCallback(async () => {
    if (!templateId || !isAuthenticated) return null
    const jobPayload = selectedJobId.trim() ? selectedJobId.trim() : undefined
    const { data: sub } = await api.post<{
      id: string
      status?: string
      fieldValues?: any
      extraPdfBlobPath?: string | null
      extraPdfOriginalName?: string | null
      selectedToolboxTopicId?: string | null
      resubmissionReason?: string | null
    }>('/pdf-submissions', { templateId, jobId: jobPayload, reuseDraft: false, draftId: draftIdFromUrl || undefined })

    setSubmissionId(sub.id)
    setSubmissionStatus(sub.status ?? null)
    setResubmissionReason(sub.resubmissionReason ?? null)
    setToolboxExtraPdfBlobPath(sub.extraPdfBlobPath ?? null)
    setToolboxExtraPdfOriginalName(sub.extraPdfOriginalName ?? null)
    setSelectedToolboxTopicId(sub.selectedToolboxTopicId ?? '')
    if (sub.fieldValues) {
      const initial = { ...sub.fieldValues }
      delete initial.__signatures__
      setValues(initial)
      setLoadedSignatures(sub.fieldValues.__signatures__ || [])
    }
    return sub.id
  }, [templateId, isAuthenticated, selectedJobId, draftIdFromUrl])

  const formatRequestError = useCallback((err: any) => {
    const status = err?.response?.status
    const data = err?.response?.data
    const dataError = data?.error ?? data?.message
    let dataStr = typeof data === 'string' ? data : dataError ?? (data ? JSON.stringify(data) : null)
    if (dataStr && dataStr.length > 300) dataStr = `${dataStr.slice(0, 300)}...`
    if (status) return `${status}${dataStr ? `: ${dataStr}` : ''}`
    return dataStr || err?.message || 'Request failed'
  }, [])

  const selectedToolboxTopic = useMemo(
    () => toolboxTopics.find((topic) => topic.id === selectedToolboxTopicId) ?? null,
    [toolboxTopics, selectedToolboxTopicId]
  )

  const handleToolboxTopicSelect = useCallback(
    async (topicId: string) => {
      setSelectedToolboxTopicId(topicId)
      if (!topicId) return
      if (!submissionId || !toolboxTitleFieldId || !toolboxControlMeasuresFieldId) return

      const topic = toolboxTopics.find((item) => item.id === topicId)
      if (!topic) return

      const nextTitle = topic.topicTitle.trim()
      const nextControl = buildToolboxControlMeasuresAutofill(topic)
      const currentTitle = String(values[toolboxTitleFieldId] ?? '').trim()
      const currentControl = String(values[toolboxControlMeasuresFieldId] ?? '').trim()
      const hasManualContent =
        (currentTitle && currentTitle !== nextTitle) ||
        (currentControl && currentControl !== nextControl)

      if (hasManualContent) {
        const shouldOverwrite = window.confirm(
          'This will overwrite the current topic title and control measures text. Continue?'
        )
        if (!shouldOverwrite) return
      }

      const updatedValues = {
        ...values,
        [toolboxTitleFieldId]: nextTitle,
        [toolboxControlMeasuresFieldId]: nextControl,
      }
      setValues(updatedValues)
      scheduleAutosave(updatedValues)

      setToolboxTopicAttachBusy(true)
      setToolboxExtraPdfError(null)
      const requestSeq = toolboxTopicAttachRequestSeqRef.current + 1
      toolboxTopicAttachRequestSeqRef.current = requestSeq

      try {
        const attachWithSubmission = async (activeSubmissionId: string) => {
          return attachToolboxTopicToSubmission(activeSubmissionId, topicId)
        }

        let result
        try {
          result = await attachWithSubmission(submissionId)
        } catch (err: any) {
          if (err?.response?.status !== 404) throw err
          const newId = await refreshDraftSubmission()
          if (!newId) throw err
          result = await attachWithSubmission(newId)
        }

        // Ignore stale responses if user rapidly switches topics.
        if (requestSeq !== toolboxTopicAttachRequestSeqRef.current) return

        setToolboxExtraPdfBlobPath(result.extraPdfBlobPath)
        setToolboxExtraPdfOriginalName(result.extraPdfOriginalName)
      } catch (err: any) {
        if (requestSeq !== toolboxTopicAttachRequestSeqRef.current) return
        setToolboxExtraPdfError(formatRequestError(err))
      } finally {
        if (requestSeq === toolboxTopicAttachRequestSeqRef.current) {
          setToolboxTopicAttachBusy(false)
        }
      }
    },
    [
      submissionId,
      toolboxTitleFieldId,
      toolboxControlMeasuresFieldId,
      toolboxTopics,
      values,
      scheduleAutosave,
      refreshDraftSubmission,
      formatRequestError,
    ]
  )

  const toolboxSigningOptions = employees
    .map((e: any) => ({ id: e.id, name: `${e.firstName} ${e.lastName}`.trim() }))
    .filter((e: any) => e.id && e.name)

  const getAttendeeSlot = (label?: string) => {
    const m = String(label ?? '').match(/attendee\s*(\d+)\s*(name|signature)/i)
    if (!m) return null
    return { num: Number(m[1]), kind: String(m[2]).toLowerCase() }
  }

  const findNextToolboxSignatureField = (sectionFields: typeof customFields) => {
    const sigs = sectionFields
      .filter((f) => (f.type || '').toUpperCase() === 'SIGNATURE')
      .sort((a, b) => {
        const sa = getAttendeeSlot(a.label)?.num ?? 0
        const sb = getAttendeeSlot(b.label)?.num ?? 0
        return sa - sb
      })
    return sigs.find((f) => !values[f.id]) ?? null
  }

  const handleCollectSignatureSave = useCallback(
    async (imageData: string) => {
      if (!submissionId) return
      if (!imageData) return
      setSignatureSaveError(null)
      setCollectBusy(true)

      const selected = toolboxSigningOptions.find((w: any) => w.id === collectSigningWorkerId)
      const workerSignerName =
        selected?.name ||
        (collectSigningWorkerId === user?.id ? (user?.name ?? 'Worker') : 'Worker')
      const signerName =
        collectSignerType === 'visitor' ? collectVisitorName.trim() : workerSignerName

      if (!signerName) {
        setSignatureSaveError('Enter visitor name before adding a visitor signature.')
        setCollectBusy(false)
        return
      }

      const payload: any = {
        signerRole: 'Collected',
        imageData,
        signerName,
      }
      if (collectSignerType === 'worker' && collectSigningWorkerId) payload.signerUserId = collectSigningWorkerId

      const saveForSubmission = async (id: string) => {
        const { data } = await api.post(`/pdf-submissions/${id}/signatures`, payload)
        return data as { signerRole?: string; imageData?: string; fieldId?: string | null; signedAt?: string; signerName?: string }
      }

      try {
        const saved = await saveForSubmission(submissionId)

        // Append using server-returned signedAt so deletes match.
        setLoadedSignatures((prev) => [
          ...prev,
          {
            fieldId: saved?.fieldId ?? null,
            imageData: saved?.imageData ?? imageData,
            signerName: saved?.signerName ?? signerName,
            signerRole: saved?.signerRole ?? 'Collected',
            signedAt: saved?.signedAt ?? new Date().toISOString(),
          },
        ])
      } catch (err: any) {
        if (err?.response?.status === 404) {
          try {
            const newId = await refreshDraftSubmission()
            if (newId) {
              const saved = await saveForSubmission(newId)
              setLoadedSignatures((prev) => [
                ...prev,
                {
                  fieldId: saved?.fieldId ?? null,
                  imageData: saved?.imageData ?? imageData,
                  signerName: saved?.signerName ?? signerName,
                  signerRole: saved?.signerRole ?? 'Collected',
                  signedAt: saved?.signedAt ?? new Date().toISOString(),
                },
              ])
            }
            else throw err
          } catch (refreshErr: any) {
            setSignatureSaveError(formatRequestError(refreshErr))
            setCollectBusy(false)
            return
          }
        } else {
          setSignatureSaveError(formatRequestError(err))
          setCollectBusy(false)
          return
        }
      }

      setCollectBusy(false)
      setSigField(null)
      setCollectSigningWorkerId('')
      setCollectVisitorName('')
      setCollectSignerType('worker')
    },
    [
      submissionId,
      collectSigningWorkerId,
      collectVisitorName,
      collectSignerType,
      toolboxSigningOptions,
      user?.id,
      user?.name,
      refreshDraftSubmission,
      formatRequestError,
    ]
  )

  const handleDeleteCollectedSignature = useCallback(
    async (sig: { signedAt?: string; imageData?: string }) => {
      if (!submissionId) return
      const ok = window.confirm('Remove this signature?')
      if (!ok) return
      try {
        await api.delete(`/pdf-submissions/${submissionId}/signatures`, {
          data: {
            signedAt: sig.signedAt,
            imageData: sig.imageData,
          },
        })
        setLoadedSignatures((prev) =>
          prev.filter((s) => !(String(s.signedAt ?? '') === String(sig.signedAt ?? '') && String(s.imageData ?? '') === String(sig.imageData ?? '')))
        )
      } catch (err: any) {
        alert(formatRequestError(err))
      }
    },
    [submissionId, formatRequestError]
  )

  const handleSignatureSave = useCallback(
    async (imageData: string, signerNameFromModal?: string) => {
      if (!sigField || !submissionId) return
      setSignatureSaveError(null)

      // Special case: marker-based "Collect Signatures" widget uses a synthetic field id.
      if (sigField.id === '__collect_signatures__') {
        await handleCollectSignatureSave(imageData)
        return
      }

      handleValueChange(sigField.id, imageData)

      // Worker acknowledgement: set associated name field securely via state property
      if (sigField.nameFieldId && sigField.label) {
        handleValueChange(sigField.nameFieldId, sigField.label)
        if (toolboxVisitorName.trim() && sigField.label === toolboxVisitorName.trim()) {
          setToolboxVisitorName('')
        }
      }

      // Toolbox talks attendee signing: auto-fill matching "Attendee N Name".
      const slot = getAttendeeSlot(sigField.label)
      if (slot && slot.kind === 'signature') {
        const visitorName = toolboxVisitorName.trim()
        const selected = toolboxSigningWorkerId
          ? toolboxSigningOptions.find((w: any) => w.id === toolboxSigningWorkerId)
          : null
        const selectedName =
          visitorName ||
          selected?.name ||
          (toolboxSigningWorkerId === user?.id ? (user?.name ?? '') : '') ||
          signerNameFromModal?.trim() ||
          ''
        if (selectedName) {
          const nameField = (template?.fields ?? []).find((f) => {
            const s = getAttendeeSlot(f.label)
            return s && s.num === slot.num && s.kind === 'name'
          })
          if (nameField?.id) handleValueChange(nameField.id, selectedName)
        }
        if (visitorName) setToolboxVisitorName('')
      }

      const effectiveFieldId = sigField.id

      const kissPdfMultiSign =
        !!signingWorkerId &&
        !toolboxSigningWorkerId &&
        kissPdfSignatureFields.some((f) => f.id === effectiveFieldId)

      const isHotWorkTemplateSig =
        isHotWorkPermitTemplate &&
        effectiveFieldId &&
        hotWorkSignatureFields.some((f) => f.id === effectiveFieldId)

      const hotWorkSignerName =
        (sigField.hotWorkPrintName && String(sigField.hotWorkPrintName).trim()) ||
        (signerNameFromModal && String(signerNameFromModal).trim()) ||
        ''

      const payload: Record<string, unknown> = {
        signerRole: sigField.nameFieldId ? 'Worker' : (user?.role ?? 'Worker'),
        imageData,
        fieldId: effectiveFieldId,
        ...(toolboxSigningWorkerId ? { signerUserId: toolboxSigningWorkerId } : {}),
        ...(kissPdfMultiSign
          ? {
              signerUserId: signingWorkerId === 'self' ? user?.id : signingWorkerId,
              signerName: sigField.label?.trim() || undefined,
            }
          : {}),
        ...(isHotWorkTemplateSig && hotWorkSignerName ? { signerName: hotWorkSignerName } : {}),
      }

      const saveForSubmission = async (id: string) => {
        const { data } = await api.post<{
          signerName?: string
          signedAt?: string
          fieldId?: string | null
          imageData?: string
        }>(`/pdf-submissions/${id}/signatures`, payload)
        return data
      }

      try {
        const saved = await saveForSubmission(submissionId)
        if (kissPdfMultiSign) {
          setLoadedSignatures((prev) => [
            ...prev.filter((s) => s.fieldId !== effectiveFieldId),
            {
              fieldId: effectiveFieldId,
              imageData: saved?.imageData ?? imageData,
              signerName: saved?.signerName ?? sigField.label,
              signedAt: saved?.signedAt ?? new Date().toISOString(),
            },
          ])
        }
      } catch (err: any) {
        // Retry once if the draft submission no longer exists.
        if (err?.response?.status === 404) {
          try {
            const newId = await refreshDraftSubmission()
            if (newId) {
              const saved = await saveForSubmission(newId)
              if (kissPdfMultiSign) {
                setLoadedSignatures((prev) => [
                  ...prev.filter((s) => s.fieldId !== effectiveFieldId),
                  {
                    fieldId: effectiveFieldId,
                    imageData: saved?.imageData ?? imageData,
                    signerName: saved?.signerName ?? sigField.label,
                    signedAt: saved?.signedAt ?? new Date().toISOString(),
                  },
                ])
              }
            } else {
              setSignatureSaveError(formatRequestError(err))
              return
            }
          } catch (refreshErr: any) {
            setSignatureSaveError(formatRequestError(refreshErr))
            return
          }
        } else {
          console.error('Signature save error:', err)
          setSignatureSaveError(formatRequestError(err))
          return
        }
      }

      // Only clear the modal after the backend save succeeded.
      setSignatureSaveError(null)
      setSigField(null)
      setIsSigningWorker(false)
      setSigningWorkerId('')
      setToolboxSigningWorkerId('')
      if (isHotWorkPermitTemplate && effectiveFieldId) {
        setHotWorkRemoteSignerByFieldId((prev) => {
          const next = { ...prev }
          delete next[effectiveFieldId]
          return next
        })
        setHotWorkPrintNameByFieldId((prev) => {
          const next = { ...prev }
          delete next[effectiveFieldId]
          return next
        })
      }
    },
    [
      sigField,
      submissionId,
      user?.role,
      user?.id,
      user?.name,
      signingWorkerId,
      kissPdfSignatureFields,
      handleValueChange,
      toolboxSigningWorkerId,
      toolboxVisitorName,
      toolboxSigningOptions,
      template?.fields,
      handleCollectSignatureSave,
      refreshDraftSubmission,
      formatRequestError,
      isHotWorkPermitTemplate,
      hotWorkSignatureFields,
    ]
  )

  const doSubmit = useCallback(
    async (signerUserIds?: string[], signerFieldAssignments?: { labourerUserId: string; fieldId: string }[]) => {
      if (!template || !submissionId) return
      setSubmitting(true)
      try {
        const submitValues: Record<string, string> =
          isDailyHazardTemplateName
            ? mergeDailyHazardSubmitValues({
              values,
              templateFields: template.fields ?? [],
              dhaWeatherFallback,
              dhaNearestHospitalFallback,
              dhaEmergencyCoordinatorFallback,
              dhaViolenceActionsFallback,
              dhaViolenceAnswers,
              dhaWeatherConditionFallback,
            })
            : { ...values }

        const valArray = Object.entries(submitValues)
          .filter(([, v]) => v !== '')
          .map(([fieldId, value]) => ({ fieldId, value }))
        if (valArray.length > 0) {
          await api.patch(`/pdf-submissions/${submissionId}/values`, { values: valArray })
        }
        await api.post(`/pdf-submissions/${submissionId}/submit`, {
          title: customTitle.trim() || undefined,
          signerUserIds:
            signerFieldAssignments && signerFieldAssignments.length > 0
              ? undefined
              : signerUserIds?.length
                ? signerUserIds
                : undefined,
          signerFieldAssignments:
            signerFieldAssignments && signerFieldAssignments.length > 0 ? signerFieldAssignments : undefined,
        })
        setSubmissionStatus(
          signerFieldAssignments?.length || signerUserIds?.length ? 'AWAITING_SIGNATURES' : 'SUBMITTED'
        )
        if (assignmentId) {
          await submitFormAssignment(assignmentId, submissionId).catch(() => { })
        }

        // Equipment forms: offer to link the submission to an equipment record
        const isEquipmentForm = /equipment/i.test(template.name ?? '')
        if (isEquipmentForm) {
          try {
            const eqList = await fetchEquipmentList()
            if (eqList.length > 0) {
              setEquipmentList(eqList)
              setSelectedEquipmentId(eqList[0].id)
              setEquipmentLinkModalOpen(true)
              return // don't navigate yet
            }
          } catch { /* fall through */ }
        }
        navigate(`/forms/${submissionId}`)
      } catch (err: any) {
        setErrors([`Submission failed: ${err?.message ?? 'Unknown error'}`])
        setSubmitting(false)
      }
    },
    [
      template,
      submissionId,
      values,
      customTitle,
      assignmentId,
      navigate,
      isDailyHazardTemplateName,
      dhaWeatherFallback,
      dhaNearestHospitalFallback,
      dhaEmergencyCoordinatorFallback,
      dhaViolenceActionsFallback,
      dhaViolenceAnswers,
      dhaWeatherConditionFallback,
    ]
  )

  const handleSubmit = useCallback(() => {
    if (!template || !submissionId) return
    const effectiveValues =
      isDailyHazardTemplateName
        ? mergeDailyHazardSubmitValues({
          values,
          templateFields: template.fields ?? [],
          dhaWeatherFallback,
          dhaNearestHospitalFallback,
          dhaEmergencyCoordinatorFallback,
          dhaViolenceActionsFallback,
          dhaViolenceAnswers,
          dhaWeatherConditionFallback,
        })
        : values
    const missing = (template.fields ?? [])
      .filter((f) => f.required)
      .filter((f) => !parseSectionMarker(f.label))
      .filter((f) => !isCollectSignaturesMarker(f.label))
      .filter((f) => {
        const val = effectiveValues[f.id]
        return val == null || String(val).trim() === ''
      })
      .map((f) => parseCustomFieldSpec(f.label)?.label ?? f.label ?? f.id)
    if (missing.length > 0) {
      setErrors(missing)
      window.scrollTo({ top: 0, behavior: 'smooth' })
      return
    }
    setErrors([])
    setSelectedSignerIds([])
    setSubmitModalOpen(true)
  }, [
    template,
    submissionId,
    values,
    isDailyHazardTemplateName,
    dhaWeatherFallback,
    dhaNearestHospitalFallback,
    dhaEmergencyCoordinatorFallback,
    dhaViolenceActionsFallback,
    dhaViolenceAnswers,
    dhaWeatherConditionFallback,
  ])

  const handleToolboxExtraQuickView = useCallback(async () => {
    if (!toolboxExtraPdfBlobPath) return
    try {
      const blob = await fetchPdfBlob(toolboxExtraPdfBlobPath)
      quickViewBlob(blob)
    } catch (err: any) {
      alert(err?.response?.data?.error ?? err?.message ?? 'Failed to quick view PDF.')
    }
  }, [toolboxExtraPdfBlobPath])

  const handleToolboxExtraDownload = useCallback(async () => {
    if (!toolboxExtraPdfBlobPath) return
    try {
      const blob = await fetchPdfBlob(toolboxExtraPdfBlobPath)
      const rawName = (toolboxExtraPdfOriginalName ?? '').trim() || 'toolbox-talk-attachment.pdf'
      const fileName = rawName.toLowerCase().endsWith('.pdf') ? rawName : `${rawName}.pdf`
      downloadBlob(blob, fileName)
    } catch (err: any) {
      alert(err?.response?.data?.error ?? err?.message ?? 'Failed to download PDF.')
    }
  }, [toolboxExtraPdfBlobPath, toolboxExtraPdfOriginalName])

  const handleToolboxExtraUpload = useCallback(async () => {
    if (!submissionId || !toolboxExtraPdfFile) return
    setToolboxExtraPdfUploading(true)
    setToolboxExtraPdfError(null)
    try {
      try {
        const result = await uploadPdfSubmissionExtraPdf(submissionId, toolboxExtraPdfFile)
        setToolboxExtraPdfBlobPath(result.extraPdfBlobPath)
        setToolboxExtraPdfOriginalName(result.extraPdfOriginalName)
        setToolboxExtraPdfFile(null)
      } catch (err: any) {
        // Retry once if the backend says the draft submission no longer exists.
        if (err?.response?.status === 404) {
          const newId = await refreshDraftSubmission()
          if (!newId) throw err
          const result = await uploadPdfSubmissionExtraPdf(newId, toolboxExtraPdfFile)
          setToolboxExtraPdfBlobPath(result.extraPdfBlobPath)
          setToolboxExtraPdfOriginalName(result.extraPdfOriginalName)
          setToolboxExtraPdfFile(null)
        } else {
          throw err
        }
      }
    } catch (err: any) {
      setToolboxExtraPdfError(formatRequestError(err))
    } finally {
      setToolboxExtraPdfUploading(false)
    }
  }, [submissionId, toolboxExtraPdfFile, refreshDraftSubmission, formatRequestError])

  const handleToolboxExtraRemove = useCallback(async () => {
    if (!submissionId || !toolboxExtraPdfBlobPath) return
    setToolboxExtraPdfRemoving(true)
    setToolboxExtraPdfError(null)
    try {
      await api.delete(`/pdf-submissions/${submissionId}/extra-pdf`)
      setToolboxExtraPdfBlobPath(null)
      setToolboxExtraPdfOriginalName(null)
      setSelectedToolboxTopicId('')
      setToolboxExtraPdfFile(null)
      if (toolboxExtraPdfInputRef.current) toolboxExtraPdfInputRef.current.value = ''
    } catch (err: any) {
      setToolboxExtraPdfError(formatRequestError(err))
    } finally {
      setToolboxExtraPdfRemoving(false)
    }
  }, [submissionId, toolboxExtraPdfBlobPath, formatRequestError])

  const handleClearAll = useCallback(async () => {
    if (!submissionId) return
    const ok = window.confirm('Clear all saved data for this form?')
    if (!ok) return

    // Cancel any pending autosave updates while we reset state.
    if (autosaveRef.current) clearTimeout(autosaveRef.current)

    setClearAllBusy(true)
    setToolboxExtraPdfError(null)
    setSignatureSaveError(null)
    setErrors([])

    try {
      await api.post(`/pdf-submissions/${submissionId}/clear`)

      // Reset local form state. DRAFT clearing removes saved field values/signatures.
      setValues({})
      setSigField(null)
      setIsSigningWorker(false)
      setSigningWorkerId('')
      setToolboxSigningWorkerId('')
      setSelectedSignerIds([])

      setToolboxExtraPdfBlobPath(null)
      setToolboxExtraPdfOriginalName(null)
      setSelectedToolboxTopicId('')
      setToolboxExtraPdfFile(null)
      if (toolboxExtraPdfInputRef.current) toolboxExtraPdfInputRef.current.value = ''
      setDhaSavedToList(false)
      setDhaSaveDraftMessage(null)
      if (isDailyHazardTemplateName) void refreshDhaSavedDrafts()
    } catch (err: any) {
      setErrors([formatRequestError(err)])
    } finally {
      setClearAllBusy(false)
    }
  }, [submissionId, formatRequestError, isDailyHazardTemplateName, refreshDhaSavedDrafts])

  // Signer selection is available for all roles; list comes from EmployeesContext.

  const handleModalSubmit = useCallback(() => {
    if (isHotWorkPermitTemplate) {
      const pendingEmpty = hotWorkSignatureFields.filter((f) => {
        const v = values[f.id]
        return v == null || String(v).trim() === '' || !String(v).startsWith('data:image/')
      })
      const assignments: { fieldId: string; labourerUserId: string }[] = []
      const usedLabourerIds = new Set<string>()
      for (const f of pendingEmpty) {
        const rid = (hotWorkRemoteSignerByFieldId[f.id] ?? '').trim()
        if (!rid) continue
        if (usedLabourerIds.has(rid)) {
          setErrors([
            `Each signer can only cover one signature line. ${signerOptions.find((m: any) => m.id === rid)?.name ?? 'A worker'} is assigned more than once — change a line dropdown or your selections below.`,
          ])
          window.scrollTo({ top: 0, behavior: 'smooth' })
          return
        }
        assignments.push({ fieldId: f.id, labourerUserId: rid })
        usedLabourerIds.add(rid)
      }
      const orderedOpen = pendingEmpty.filter((f) => !assignments.some((a) => a.fieldId === f.id))
      const pool = selectedSignerIds.filter((id) => id && String(id).trim() && !usedLabourerIds.has(id))
      let pi = 0
      for (const f of orderedOpen) {
        if (pi >= pool.length) break
        const labourerUserId = pool[pi++]!
        assignments.push({ fieldId: f.id, labourerUserId })
        usedLabourerIds.add(labourerUserId)
      }
      const uncovered = pendingEmpty.filter((f) => !assignments.some((a) => a.fieldId === f.id))
      if (uncovered.length > 0) {
        const uf = uncovered[0]!
        const label = parseCustomFieldSpec(uf.label)?.label ?? uf.label ?? 'Signature'
        setErrors([
          `${uncovered.length} signature line(s) still need a signer. Use each line’s “send for signature” dropdown on the form, or select people below in order (first selected signs the first open line, top to bottom). Next open line: “${label}”.`,
        ])
        window.scrollTo({ top: 0, behavior: 'smooth' })
        return
      }
      setErrors([])
      setSubmitModalOpen(false)
      void doSubmit(undefined, assignments.length > 0 ? assignments : undefined)
      return
    }
    setSubmitModalOpen(false)
    void doSubmit(selectedSignerIds.length > 0 ? selectedSignerIds : undefined)
  }, [
    doSubmit,
    selectedSignerIds,
    isHotWorkPermitTemplate,
    hotWorkSignatureFields,
    values,
    hotWorkRemoteSignerByFieldId,
    signerOptions,
  ])

  const isLotoTemplate = /lock\s*out|tag\s*out|loto/i.test(template?.name ?? '')
  const visibleFieldIdsForCounter = useMemo(() => {
    const ids = new Set<string>()
    for (const field of template?.fields ?? []) {
      if (isLotoTemplate) {
        if (isCollectSignaturesMarker(field.label)) continue
        const rowNum = parseLotoRowNumber(field.label)
        if (rowNum != null && rowNum > 6) continue
      }
      ids.add(field.id)
    }
    return ids
  }, [template?.fields, isLotoTemplate])

  const filledVisibleFieldCount = useMemo(
    () =>
      Object.entries(values).filter(
        ([fieldId, value]) =>
          visibleFieldIdsForCounter.has(fieldId) &&
          String(value ?? '').trim() !== ''
      ).length,
    [values, visibleFieldIdsForCounter]
  )

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto py-12 text-center text-neutral-500 dark:text-neutral-400">
        Loading form…
      </div>
    )
  }

  if (pdfError || !template) {
    return (
      <Card padding="lg" className="max-w-md mx-auto text-center">
        <h2 className="font-display font-semibold text-lg text-neutral-900 dark:text-white">Failed to Load Form</h2>
        <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-1">{pdfError}</p>
        <Button className="mt-4" onClick={() => navigate('/library')}>
          Back to library
        </Button>
      </Card>
    )
  }

  const pageCount = isCustomTemplate ? 1 : (template.pageCount ?? (pageImages.length || 1))
  const pageFields = (template.fields ?? []).filter((f) => (f.page ?? 1) === currentPage)
  const allCustomFields = (template.fields ?? [])
    .filter((f): f is NonNullable<typeof template.fields>[number] => Boolean(f && f.id && f.type))
    .slice()
    .sort((a, b) => (a.y ?? 0) - (b.y ?? 0) || (a.x ?? 0) - (b.x ?? 0))

  // Find "Attendee <N> Name/Signature" grouped correctly
  const attendeePairs = new Map<number, { nameField?: any; sigField?: any }>()
  for (const f of allCustomFields) {
    const matchName = f.label?.match(/^Attendee\s+(\d+)\s+Name$/i)
    if (matchName) {
      const idx = parseInt(matchName[1], 10)
      if (!attendeePairs.has(idx)) attendeePairs.set(idx, {})
      attendeePairs.get(idx)!.nameField = f
      continue
    }
    const matchSig = f.label?.match(/^Attendee\s+(\d+)\s+Signature$/i)
    if (matchSig) {
      const idx = parseInt(matchSig[1], 10)
      if (!attendeePairs.has(idx)) attendeePairs.set(idx, {})
      attendeePairs.get(idx)!.sigField = f
      continue
    }
  }

  // Filter out the paired attendee fields from the general render pass
  const pairedFieldIds = new Set<string>()
  const attendeeSlots = Array.from(attendeePairs.entries())
    .filter(([_, pair]) => pair.nameField && pair.sigField)
    .sort(([a], [b]) => a - b)
    .map(([_, pair]) => {
      pairedFieldIds.add(pair.nameField.id)
      pairedFieldIds.add(pair.sigField.id)
      return pair
    })

  const customFields = allCustomFields.filter((f) => !pairedFieldIds.has(f.id) && !parseSectionMarker(f.label))

  const currentImage = pageImages[currentPage - 1]

  type Section = {
    key: string
    title: string
    fields: typeof customFields
  }

  const sections = (() => {
    try {
      // Template-authored sections: any [SECTION] markers define the section headers.
      const hasSectionMarkers = allCustomFields.some((f) => Boolean(parseSectionMarker(f.label)))
      if (hasSectionMarkers) {
        const built: Section[] = []
        let current: Section | null = null

        const ensureCurrent = (title?: string) => {
          if (current) return
          const t = normalizeSectionTitle(title ?? 'Details')
          const forcedKey =
            t.toLowerCase().includes('attendee') ? 'toolbox_attendees'
              : t.toLowerCase().includes('approval') ? 'toolbox_approvals'
                : t.toLowerCase().includes('management') ? 'weekly_management'
                  : t.toLowerCase().includes('washroom inspection checklist') ? 'washroom_items'
                  : sectionKeyFromTitle(t)
          current = { key: forcedKey, title: t, fields: [] }
          built.push(current)
        }

        for (const f of allCustomFields) {
          if (!f || !f.id || !f.type) continue
          if (pairedFieldIds.has(f.id)) continue
          const marker = parseSectionMarker(f.label)
          if (marker) {
            current = null
            ensureCurrent(marker.title)
            continue
          }
          // Keep washroom metadata fields out of generic "Details" sections.
          // They should always render inside the dedicated washroom checklist table.
          if (isWashroomChecklistMetaLabel(f.label)) {
            let washroomSection = built.find((s) => s.key === 'washroom_items')
            if (!washroomSection) {
              washroomSection = {
                key: 'washroom_items',
                title: 'Section — Washroom Inspection Checklist',
                fields: [],
              }
              built.unshift(washroomSection)
            }
            washroomSection.fields.push(f as any)
            continue
          }
          ensureCurrent()
          current!.fields.push(f as any)
        }

        return built.map((s) => ({ ...s, fields: s.fields.filter((f) => !parseSectionMarker((f as any).label)) }))
      }

      const fieldToSectionKey = (field: { label?: string; type: string }) => {
        const dropdown = parseCustomFieldSpec(field.label)
        const rawLabel = String(dropdown?.label ?? field.label ?? '').trim()
        const l = rawLabel.toLowerCase()

        // Toolbox Talk (native seeder)
        if (/^attendee\s*\d+\s*name$/i.test(rawLabel) || /^attendee\s*\d+\s*signature$/i.test(rawLabel)) return 'toolbox_attendees'
        if (l.includes('date of discussion') || l.includes('title of the topic') || l.includes('control measures') || l.includes('safety tips') || l.includes('notes from workers')) return 'toolbox_topic'
        if (l.includes('approved by') || l.includes('job title')) return 'toolbox_approvals'

        // Weekly Project Inspection (native seeder)
        if (l === 'location' || l === 'inspected by' || l === 'reviewed by' || l === 'date time') return 'weekly_details'
        if (l.startsWith('hazard row')) return 'weekly_hazard_table'
        if (l.includes('management initials')) return 'weekly_management'
        if (isWashroomChecklistMetaLabel(rawLabel)) return 'washroom_items'
        if (fieldTypeNorm(field.type) === 'CHECKBOX') return 'weekly_checklist'

        // Generic fallbacks (best-effort grouping)
        if (fieldTypeNorm(field.type) === 'SIGNATURE') return 'signatures'
        if (fieldTypeNorm(field.type) === 'CHECKBOX') return 'checklist'
        if (fieldTypeNorm(field.type) === 'DATE') return 'dates'
        return 'details'
      }

      const sectionTitles: Record<string, string> = {
        toolbox_topic: 'Section — Topic & Control Measures',
        toolbox_attendees: 'Section — Attendees',
        toolbox_approvals: 'Section — HR Approvals',
        weekly_details: 'Section — Inspection Details',
        weekly_checklist: 'Section — Inspection Checklist',
        weekly_hazard_table: 'Section — Hazard Table',
        weekly_management: 'Section — Management Sign-off',
        washroom_items: 'Section — Washroom Inspection Checklist',
        signatures: 'Section — Signatures Collected',
        checklist: 'Section — Checklist',
        dates: 'Section — Dates',
        details: 'Section — Details',
      }

      const order: string[] = []
      const map: Record<string, { key: string; title: string; fields: typeof customFields }> = {}

      for (const f of customFields) {
        if (!f || !f.id || !f.type) continue
        const key = fieldToSectionKey(f)
        if (!map[key]) {
          order.push(key)
          map[key] = { key, title: sectionTitles[key] ?? 'Section', fields: [] }
        }
        map[key].fields.push(f)
      }

      return order.map((k) => map[k])
    } catch (err) {
      console.error('Form section build failed:', err)
      return [{ key: 'details', title: 'Section — Details', fields: customFields }]
    }
  })()

  const applySubstandardAutofill = (draftValues: Record<string, string>) => {
    const next = { ...draftValues }
    const selectedSubstandardItems = allCustomFields
      .filter((f) => fieldTypeNorm(f.type) === 'CHECKBOX' && checklistNeedsDetail(next[f.id], template?.name))
      .map((f) => String(f.label ?? '').trim())
      .filter(Boolean)

    // Weekly inspection: push selected substandard checklist items into
    // "Hazard Row N: Item # / Location" slots for detail capture below.
    const hazardItemFields = allCustomFields
      .filter((f) => /^Hazard Row\s+\d+:\s*Item #\s*\/\s*Location$/i.test(String(f.label ?? '').trim()))
      .sort((a, b) => {
        const ai = Number((String(a.label ?? '').match(/^Hazard Row\s+(\d+)/i) ?? [])[1] ?? 0)
        const bi = Number((String(b.label ?? '').match(/^Hazard Row\s+(\d+)/i) ?? [])[1] ?? 0)
        return ai - bi
      })

    if (hazardItemFields.length > 0) {
      hazardItemFields.forEach((field, idx) => {
        next[field.id] = selectedSubstandardItems[idx] ?? ''
      })
    }

    // Power/Equipment/Hot Work style forms often have one corrective-actions box below checklists.
    // Prefill with selected items while keeping this block clearly identifiable/editable.
    const correctiveField = allCustomFields.find(
      (f) =>
        fieldTypeNorm(f.type) === 'TEXT' &&
        /^Corrective Actions\b/i.test(String(f.label ?? '').trim())
    )
    if (correctiveField?.id) {
      const existing = String(next[correctiveField.id] ?? '')
      const prefix = /hot\s*work\s*permit/i.test(String(template?.name ?? '')) ? 'Items marked No:' : 'Substandard items:'
      const canReplace = !existing.trim() || existing.startsWith('Substandard items:') || existing.startsWith('Items marked No:')
      if (canReplace) {
        next[correctiveField.id] = selectedSubstandardItems.length
          ? `${prefix}\n${selectedSubstandardItems.map((item, i) => `${i + 1}. ${item}`).join('\n')}\n\nDetails:`
          : ''
      }
    }

    // Hot Work: the "Section — Additional Comments" textarea is a synthetic field; prefill it when Substandard/No is chosen.
    if (/hot\s*work\s*permit/i.test(String(template?.name ?? ''))) {
      const existingExtra = String(next[HOT_WORK_ADDITIONAL_COMMENTS_FIELD_ID] ?? '')
      const canReplaceExtra =
        !existingExtra.trim() ||
        existingExtra.startsWith('Substandard items:') ||
        existingExtra.startsWith('Items marked No:')
      if (canReplaceExtra) {
        const prefix = 'Items marked No:'
        next[HOT_WORK_ADDITIONAL_COMMENTS_FIELD_ID] = selectedSubstandardItems.length
          ? `${prefix}\n${selectedSubstandardItems.map((item, i) => `${i + 1}. ${item}`).join('\n')}\n\nDetails:`
          : ''
      }
    }

    // Equipment Inspection: prefill the comments block that appears before operator sign-off.
    const isEquipmentInspectionForm = /equipment\s*inspection/i.test(String(template?.name ?? ''))
    if (isEquipmentInspectionForm) {
      const operatorSignoffIdx = allCustomFields.findIndex((f) => {
        const l = String(f.label ?? '').toLowerCase()
        return (
          l.includes('operator sign-off') ||
          l.includes('operator sign off') ||
          l.includes("operator's initials") ||
          l.includes('operator initials') ||
          l.includes('operator signature')
        )
      })

      const precedingTextField =
        operatorSignoffIdx > 0
          ? [...allCustomFields.slice(0, operatorSignoffIdx)]
              .reverse()
              .find((f) => {
                if (fieldTypeNorm(f.type) !== 'TEXT') return false
                if (parseSectionMarker(f.label)) return false
                if (isCollectSignaturesMarker(f.label)) return false
                if (parseCustomFieldSpec(f.label)) return false
                if (parseJobDropdownMarker(f.label)) return false
                const label = String(f.label ?? '').toLowerCase()
                if (label.includes('corrective actions')) return false
                return true
              })
          : undefined

      const commentsField =
        precedingTextField ??
        allCustomFields.find(
          (f) =>
            fieldTypeNorm(f.type) === 'TEXT' &&
            /worker comments|comments or concerns|operator comments|comments|remarks|notes|defects?/i.test(
              String(f.label ?? '').trim()
            )
        )
      if (commentsField?.id) {
        const existing = String(next[commentsField.id] ?? '')
        const canReplace =
          !existing.trim() ||
          existing.startsWith('Substandard items:') ||
          existing.startsWith('Items marked No:')
        if (canReplace) {
          next[commentsField.id] = selectedSubstandardItems.length
            ? `Substandard items:\n${selectedSubstandardItems.map((item, i) => `${i + 1}. ${item}`).join('\n')}\n\nComments:`
            : ''
        }
      }
    }

    return next
  }

  const handleChecklistChoiceChange = (fieldId: string, option: Exclude<ChecklistChoice, ''>) => {
    setValues((prev) => {
      const currentChoice = normalizeChecklistChoice(prev[fieldId])
      const nextChoice: ChecklistChoice = currentChoice === option ? '' : option
      const updated = applySubstandardAutofill({ ...prev, [fieldId]: nextChoice })
      scheduleAutosave(updated)
      return updated
    })
  }

  const isLegislativeComplianceTemplate = /legislative compliance evaluation/i.test(template.name ?? '')
  const isCriticalTaskRiskRegisterTemplate = /critical task inventory/i.test(template.name ?? '') && /risk register/i.test(template.name ?? '')
  const isConfinedSpaceEntryPermitTemplate = /confined\s+space\s+entry\s+permit/i.test(template.name ?? '')
  const isEquipmentInspectionTemplate = /equipment\s*inspection/i.test(template.name ?? '')
  const isWashroomInspectionTemplate = isWashroomInspectionStyleTemplateName(template.name)
  const isDailyHazardTemplate = /daily\s*hazard|daily\s*jha/i.test(String(template.name ?? ''))
  const dhaGeneralActivities = [
    'CONCRETE FORMING & POURING',
    'CONFINED SPACE',
    'CRANE USE HOISTING AND RIGGING',
    'DEMOLITION',
    'DRYWALL INSTALLATION/FINISHING',
    'ELECTRICAL WORK',
    'EQUIPMENT/TOOL USE',
    'EXCAVATION & TRENCHING',
    'FLOORING INSTALLATION',
    'HARDWARE INSTALLATION',
    'HAZARDOUS ENERGY CONTROL (LOTO)',
    'HOT-WORK',
    'HOUSEKEEPING',
    'HVAC WORK',
    'MANUAL MATERIAL STORAGE & HANDLING',
    'PAINTING',
    'PLUMBING WORK',
    'SPRINKLER WORK',
    'TRUCK LOADING & UNLOADING',
    'WORK PLATFORM USE (LADDER/SCAFFOLD)',
    'WORKING AT HEIGHTS',
  ]
  const dhaSpecificHazards = [
    'ADJACENT PUBLIC AREAS',
    'COLD STRESS',
    'DAMAGED EQUIPMENT',
    'DESIGNATED SUBSTANCES',
    'DUSTS MISTS FUMES',
    'FALLS',
    'HAZARDOUS ENERGY',
    'HAZARDOUS MATERIALS/CHEMICALS',
    'HEAT STRESS',
    'LACK OF SUBCONTRACTOR PROCEDURES',
    'LACK OF TRAINING',
    'NOISE',
    'POOR LIGHTING',
    'RESPIRATORY HAZARDS',
    'SITE VISIBILITY (HILL BEND NIGHT WORK)',
    'SLIPS TRIPS',
    'UNDERGROUND UTILITIES',
  ]
  const dhaStandardSiteControls = [
    'ADEQUATE DRINKING WATER AVAILABLE',
    'DUST CONTROL MEASURES',
    'EMERGENCY RESPONSE PROCEDURES',
    'EQUIPMENT/TOOL INSPECTIONS',
    'FALL PREVENTION PLAN',
    'HAZARDOUS ENERGY CONTROL (LOTO)',
    'HOUSEKEEPING',
    '(M)SDS AVAILABLE',
    'MECHANICAL VENTILATION',
    'NATURAL VENTILATION',
    'NOISE MONITORING',
    'PERSONAL PROTECTIVE EQUIPMENT',
    'SAFE ACCESS/EGRESS TO WORK AREAS',
    'SIGNAL PERSONS AVAILABLE',
    'SUBCONTRACTOR PROCEDURES IN PLACE',
    'TEMPORARY LIGHTING',
    'TRAFFIC MANAGEMENT PLAN',
    'TRAINING CERTIFICATIONS',
    'UTILITY LOCATES',
  ]
  const dhaExternalHazards = [
    'INCLEMENT WEATHER',
    'HIGH WINDS',
    'TRAFFIC',
    'NEIGHBOURING CONSTRUCTION',
    'PUBLIC ACCESS',
    'PUBLIC PROTECTION IN PLACE',
    'OVERHEAD HAZARDS',
  ]
  const dhaPpeItems = [
    { label: 'HEAD PROTECTION', icon: '⛑️' },
    { label: 'FOOT PROTECTION', icon: '🥾' },
    { label: 'EYE PROTECTION', icon: '🥽' },
    { label: 'ARC FLASH', icon: '⚡' },
    { label: 'HEARING PROTECTION', icon: '🎧' },
    { label: 'FALL PROTECTION', icon: '🪢' },
    { label: 'HAND PROTECTION', icon: '🧤' },
    { label: 'SKIN PROTECTION', icon: '🧴' },
    { label: 'RESPIRATORY PROTECTION', icon: '😷' },
    { label: 'HI-VIS PROTECTION', icon: '🦺' },
  ]
  const isDhaGeneralActivityLabel = (raw?: string) =>
    dhaGeneralActivities.some((item) => normalizeDhaLabel(item) === normalizeDhaLabel(raw))
  const isDhaSpecificHazardLabel = (raw?: string) =>
    dhaSpecificHazards.some((item) => normalizeDhaLabel(item) === normalizeDhaLabel(raw))
  const isDhaStandardSiteControlLabel = (raw?: string) =>
    dhaStandardSiteControls.some((item) => normalizeDhaLabel(item) === normalizeDhaLabel(raw))
  const isDhaExternalHazardLabel = (raw?: string) =>
    dhaExternalHazards.some((item) => normalizeDhaLabel(item) === normalizeDhaLabel(raw))
  const isDhaPpeLabel = (raw?: string) =>
    dhaPpeItems.some((item) => normalizeDhaLabel(item.label) === normalizeDhaLabel(raw))
  const isDhaGeneralInfoFieldLabel = (raw?: string) => {
    const label = normalizeDhaLabel(raw)
    return (
      label === 'date' ||
      label.includes('muster point') ||
      label === 'supervisor' ||
      label.includes('job number') ||
      label.startsWith('weather') ||
      label.includes('nearest hospital') ||
      label.includes('emergency response coordinator') ||
      label.includes('rain') ||
      label.includes('snow') ||
      label.includes('wind') ||
      label.includes('lightning') ||
      label === 'sun' ||
      label.includes('overcast') ||
      label.includes('project')
    )
  }
  const dhaFieldByLabel = (() => {
    const map = new Map<string, any>()
    for (const field of template?.fields ?? []) {
      const resolved = parseCustomFieldSpec(field.label)?.label ?? field.label
      map.set(normalizeDhaLabel(resolved), field as any)
    }
    return map
  })()

  const applyDhaPreset = (preset: DhaPreset) => {
    const data = (preset.data ?? {}) as any
    const setCheckboxGroup = (labels: string[], selected: string[] = []) => {
      const selectedSet = new Set(selected.map((v) => normalizeDhaLabel(v)))
      for (const label of labels) {
        const field = dhaFieldByLabel.get(normalizeDhaLabel(label))
        if (!field || fieldTypeNorm(field.type) !== 'CHECKBOX') continue
        handleValueChange(field.id, selectedSet.has(normalizeDhaLabel(label)) ? 'true' : 'false')
      }
    }

    setCheckboxGroup(dhaGeneralActivities, Array.isArray(data.activities) ? data.activities : [])
    setCheckboxGroup(dhaSpecificHazards, Array.isArray(data.hazards) ? data.hazards : [])
    setCheckboxGroup(dhaStandardSiteControls, Array.isArray(data.controls) ? data.controls : [])
    setCheckboxGroup(dhaExternalHazards, Array.isArray(data.externalHazards) ? data.externalHazards : [])
    setCheckboxGroup(dhaPpeItems.map((i) => i.label), Array.isArray(data.ppe) ? data.ppe : [])

    const setTextField = (labelParts: string[], fallbackSetter: (v: string) => void, value?: string) => {
      const target = String(value ?? '')
      const field = Array.from(dhaFieldByLabel.entries()).find(([label]) =>
        labelParts.every((part) => label.includes(normalizeDhaLabel(part)))
      )?.[1]
      if (field) {
        handleValueChange(field.id, target)
      } else {
        fallbackSetter(target)
      }
    }

    setTextField(['tools', 'replaced'], setDhaToolsConditionFallback, data.toolsReplaced)
    setTextField(['additional', 'comments'], setDhaAdditionalCommentsFallback, data.additionalComments)
    setTextField(['corrective', 'actions'], setDhaViolenceActionsFallback, data.violenceActions)

    if (data.violenceAnswers && typeof data.violenceAnswers === 'object') {
      setDhaViolenceAnswers(data.violenceAnswers)
    }

    if (Array.isArray(data.jhaRows)) {
      const rows = data.jhaRows.map((r: any) => ({
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        job: String(r.job ?? ''),
        hazards: String(r.hazard ?? ''),
        controls: String(r.control ?? ''),
        riskBefore: String(r.riskBeforeControls ?? r.riskRatingRequired ?? ''),
        riskAfter: String(r.riskAfterControls ?? ''),
      }))
      setDhaCustomJhaRows(rows)
    }
  }

  const handleLoadDhaPreset = (presetId: string) => {
    setSelectedDhaPresetId(presetId)
    if (!presetId) return
    const preset = dhaPresets.find((p) => p.id === presetId)
    if (!preset) return
    applyDhaPreset(preset)
  }

  const handleSaveDhaPreset = async () => {
    if (!dhaPresetName.trim()) return
    setSavingDhaPreset(true)
    try {
      const selectedFromValues = (labels: string[]) =>
        labels.filter((label) => {
          const field = dhaFieldByLabel.get(normalizeDhaLabel(label))
          if (!field) return false
          return values[field.id] === 'true'
        })
      const getText = (labelParts: string[], fallback: string) => {
        const field = Array.from(dhaFieldByLabel.entries()).find(([label]) =>
          labelParts.every((part) => label.includes(normalizeDhaLabel(part)))
        )?.[1]
        return field ? String(values[field.id] ?? '') : fallback
      }
      const payload: any = {
        activities: selectedFromValues(dhaGeneralActivities),
        hazards: selectedFromValues(dhaSpecificHazards),
        controls: selectedFromValues(dhaStandardSiteControls),
        externalHazards: selectedFromValues(dhaExternalHazards),
        ppe: selectedFromValues(dhaPpeItems.map((i) => i.label)),
        toolsReplaced: getText(['tools', 'replaced'], dhaToolsConditionFallback),
        additionalComments: getText(['additional', 'comments'], dhaAdditionalCommentsFallback),
        jhaRows: dhaCustomJhaRows.map((r) => ({
          job: r.job,
          hazard: r.hazards,
          control: r.controls,
          riskBeforeControls: r.riskBefore,
          riskAfterControls: r.riskAfter,
          riskRatingRequired: r.riskBefore,
        })),
        violenceAnswers: dhaViolenceAnswers,
        violenceActions: getText(['corrective', 'actions'], dhaViolenceActionsFallback),
      }
      await createDhaPreset(dhaPresetName.trim(), payload)
      const updated = await fetchDhaPresets()
      setDhaPresets(updated)
      setShowSaveDhaPresetModal(false)
      setDhaPresetName('')
    } finally {
      setSavingDhaPreset(false)
    }
  }

  const handleDeleteDhaPreset = async (presetId: string) => {
    const preset = dhaPresets.find((p) => p.id === presetId)
    if (!preset) return
    if (!window.confirm(`Delete preset "${preset.name}"?`)) return
    await deleteDhaPreset(presetId)
    const updated = await fetchDhaPresets()
    setDhaPresets(updated)
    if (selectedDhaPresetId === presetId) setSelectedDhaPresetId('')
  }
  const isIncidentReportsTemplate = /incident\s*reports\s*form/i.test(template.name ?? '')
  const isNoticeOfTransmittalTemplate = /notice\s*of\s*transmittal/i.test(template.name ?? '')
  const isWorkLogTemplate = /^work\s*log$/i.test(String(template.name ?? '').trim())
  const isNicheWaterSoftenerTemplate = /niche\s*water\s*softener/i.test(String(template.name ?? ''))
  const isNicheAirSeporatorsTemplate = /niche\s*air\s*seporators|niche\s*air\s*separators/i.test(String(template.name ?? ''))
  const isNicheBufferTanksTemplate = /niche\s*buffer\s*tanks/i.test(String(template.name ?? ''))
  const isNicheExpansionTanksTemplate = /niche\s*expansion\s*tanks/i.test(String(template.name ?? ''))
  const isNichePumpsTemplate = /niche\s*pumps/i.test(String(template.name ?? ''))
  const isTestingVerificationDefTemplate = /testing\s*and\s*verification\s*procedure\s*def/i.test(String(template.name ?? ''))
  const isInterim2PmChecklistTemplate = /interim\s*2\s*pm\s*checklist/i.test(String(template.name ?? ''))
  const isNicheQuarterlyTemplate =
    isNicheWaterSoftenerTemplate ||
    isNicheAirSeporatorsTemplate ||
    isNicheBufferTanksTemplate ||
    isNicheExpansionTanksTemplate ||
    isNichePumpsTemplate
  const isUndergroundPipingInspectionTemplate = /underground\s*piping\s*inspection/i.test(template.name ?? '')
  const isStandardsChecklistTemplate =
    /weekly\s*project\s*inspection/i.test(template.name ?? '') ||
    /hot\s*work\s*permit/i.test(template.name ?? '') ||
    /fall\s*arrest\s*inspection(\s*checklist)?/i.test(template.name ?? '') ||
    /power\s*(and|&|\/)?\s*elevating/i.test(template.name ?? '') ||
    /equipment\s*inspection/i.test(template.name ?? '')
  const visibleSections = (() => {
    let workingSections = sections

    if (isWashroomInspectionTemplate) {
      const signoffOrder: Record<string, number> = {
        'date of inspection': 1,
        'time': 2,
        'facility/location': 3,
        'name of inspector': 4,
        'signature': 5,
      }

      const signoffFields = sections
        .flatMap((section) => section.fields)
        .filter((field) => {
          const fieldLabel = parseCustomFieldSpec(field.label)?.label ?? field.label
          return isWashroomTopDetailsFieldLabel(fieldLabel)
        })
        .sort((a, b) => {
          const al = String(parseCustomFieldSpec(a.label)?.label ?? a.label ?? '').trim().toLowerCase()
          const bl = String(parseCustomFieldSpec(b.label)?.label ?? b.label ?? '').trim().toLowerCase()
          return (signoffOrder[al] ?? 999) - (signoffOrder[bl] ?? 999)
        })

      const filtered = sections
        .map((section) => {
          const titleLower = String(section.title ?? '').toLowerCase()
          if (titleLower.includes('header') || titleLower.includes('details')) return null
          const remainingFields = section.fields.filter((field) => {
            const fieldLabel = parseCustomFieldSpec(field.label)?.label ?? field.label
            return !isWashroomTopDetailsFieldLabel(fieldLabel)
          })
          if (remainingFields.length === 0) return null
          return { ...section, fields: remainingFields }
        })
        .filter(Boolean) as typeof sections

      if (signoffFields.length > 0) {
        filtered.push({
          key: 'washroom_signoff',
          title: 'Section — Inspection Sign-off',
          fields: signoffFields as any,
        })
      }

      workingSections = filtered
    }

    if (isIncidentReportsTemplate) {
      const normalizedLabel = (f: { label?: string }) =>
        String(parseCustomFieldSpec(f.label)?.label ?? f.label ?? '')
          .trim()
          .toLowerCase()
          .replace(/\s+/g, ' ')
      const normalizedSectionTitle = (s: { title?: string }) =>
        String(s.title ?? '')
          .trim()
          .toLowerCase()
          .replace(/\s+/g, ' ')
      const labelEquals = (f: { label?: string }, expected: string) => normalizedLabel(f) === expected
      const valueForLabel = (expected: string) => {
        const field = allCustomFields.find((f) => labelEquals(f, expected))
        return field?.id ? String(values[field.id] ?? '').trim().toLowerCase() : ''
      }

      const severityChoice = valueForLabel('severity')
      const noInjurySelected = severityChoice === 'no injury'
      const firstAidGivenChoice = valueForLabel('was first aid treatment given?')
      const firstAidGivenNo = firstAidGivenChoice === 'no'
      const takenToHospitalChoice = valueForLabel('was the injured person taken to hospital?')
      const takenToHospitalNo = takenToHospitalChoice === 'no'
      const treatedByPhysicianChoice = valueForLabel('was the person treated by a physician?')
      const treatedByPhysicianNo = treatedByPhysicianChoice === 'no'
      const lostTimeChoice = valueForLabel('miss work time due to incident?')
      const noLostTimeSelected =
        lostTimeChoice.includes('returned to regular duties with no lost time') ||
        lostTimeChoice.includes('returned to modified duties with no lost time')

      workingSections = workingSections
        .map((section) => {
          const sectionTitle = normalizedSectionTitle(section)
          const isBodyPartsSection = sectionTitle.includes('body parts injured')
          const isInjuryCaseSection = sectionTitle.includes('to be completed in case of injury/illness')
          const isFirstAidSection = sectionTitle.includes('details of first aid treatment given')
          const isProfessionalMedicalSection = sectionTitle.includes('professional medical treatment')

          const filteredFields = section.fields.filter((field) => {
            const label = normalizedLabel(field)

            const isHospitalQuestion = label === 'was the injured person taken to hospital?'
            const isFirstAidQuestion = label === 'was first aid treatment given?'

            const isFirstAidDetailField =
              label.includes('name of first aid attendant')

            const isProfessionalMedicalDetailField =
              label.includes('name of hospital') ||
              label.includes('hospital address') ||
              label.includes('mode of transportation') ||
              label.includes('was the person treated by a physician?') ||
              label.includes('name of physician') ||
              label.includes('treatment or care received')
            const isPhysicianFollowupField =
              label.includes('name of physician') ||
              label.includes('treatment or care received')
            const isLostTimeQuestion = label.includes('miss work time due to incident?')
            const isLostTimeFollowupField =
              label.includes('how many days of work did you or the injured person miss?') ||
              label.includes('when did you or the injured person first return to work')

            const isInjuryCaseField =
              label.includes('name of the injured person') ||
              label.includes('status of injured person') ||
              label.includes('injured person phone number') ||
              label.includes('injured job title')

            const isBodyPartField = isBodyPartsSection && fieldTypeNorm(field.type) === 'CHECKBOX'

            // Severity = No Injury should hide all injury-only fields/sections.
            if (noInjurySelected) {
              if (isBodyPartsSection || isInjuryCaseSection || isFirstAidSection || isProfessionalMedicalSection) return false
              if (isBodyPartField || isInjuryCaseField || isFirstAidQuestion || isFirstAidDetailField || isHospitalQuestion || isProfessionalMedicalDetailField) return false
            }

            // If first aid question is "No", keep only the question.
            if (firstAidGivenNo && isFirstAidSection && isFirstAidDetailField) return false

            // If hospital question is "No", keep only hospital yes/no question.
            if (takenToHospitalNo && isProfessionalMedicalSection && isProfessionalMedicalDetailField) return false

            // If physician question is "No", keep physician question but hide physician follow-up details.
            if (treatedByPhysicianNo && isProfessionalMedicalSection && isPhysicianFollowupField) return false

            // If no lost time was selected, keep only the lost-time question.
            if (noLostTimeSelected && isLostTimeFollowupField) return false
            if (noLostTimeSelected && isLostTimeQuestion) return true

            return true
          })

          if (filteredFields.length === 0) return null
          return { ...section, fields: filteredFields as any }
        })
        .filter(Boolean) as typeof sections
    }

    if (isEquipmentInspectionTemplate) {
      const headerIds = new Set<string>()
      for (const s of workingSections) {
        for (const f of s.fields) {
          if (isEquipmentInspectionHeaderField(f)) headerIds.add(f.id)
        }
      }
      const withFixedTitles = (list: typeof workingSections) =>
        list.map((s) => ({ ...s, title: fixEquipmentSectionTitleStr(s.title) }))

      if (headerIds.size > 0) {
        const headerFields = workingSections
          .flatMap((s) => s.fields)
          .filter((f) => headerIds.has(f.id))
          .sort((a, b) => equipmentHeaderFieldOrder(a) - equipmentHeaderFieldOrder(b))
        const remaining = withFixedTitles(
          workingSections
            .map((s) => ({ ...s, fields: s.fields.filter((f) => !headerIds.has(f.id)) }))
            .filter((s) => s.fields.length > 0)
        )
        workingSections = [
          { key: 'equipment_site_operator', title: 'Section — Site & operator details', fields: headerFields as any },
          ...remaining,
        ]
      } else {
        workingSections = withFixedTitles(workingSections)
      }
    }

    if (isLotoTemplate) {
      workingSections = workingSections
        .map((section) => {
          const filteredFields = section.fields.filter((field) => {
            if (isCollectSignaturesMarker(field.label)) return false
            const rowNum = parseLotoRowNumber(field.label)
            if (rowNum != null && rowNum > 6) return false
            return true
          })
          if (filteredFields.length === 0) return null
          return { ...section, fields: filteredFields }
        })
        .filter(Boolean) as typeof sections
    }

    if (isNoticeOfTransmittalTemplate) {
      const labelNorm = (f: { label?: string }) =>
        String(parseCustomFieldSpec(f.label)?.label ?? f.label ?? '').trim().toLowerCase()
      const allFields = workingSections.flatMap((s) => s.fields)
      const topOrder: Record<string, number> = { date: 1, to: 2, project: 3, re: 4 }
      const receiptOrder: Record<string, number> = { 'received by': 1, 'received date': 2, date: 3 }

      const topFields = allFields
        .filter((f) => labelNorm(f) in topOrder)
        .sort((a, b) => (topOrder[labelNorm(a)] ?? 999) - (topOrder[labelNorm(b)] ?? 999))
      const tableFields = allFields
        .filter((f) => parseNoticeOfTransmittalCell(parseCustomFieldSpec(f.label)?.label ?? f.label) != null)
        .sort((a, b) => {
          const aa = parseNoticeOfTransmittalCell(parseCustomFieldSpec(a.label)?.label ?? a.label)
          const bb = parseNoticeOfTransmittalCell(parseCustomFieldSpec(b.label)?.label ?? b.label)
          if (!aa || !bb) return 0
          const colOrder = { quantity: 1, itemNumber: 2, description: 3 }
          return aa.row - bb.row || colOrder[aa.column] - colOrder[bb.column]
        })
      const receiptFields = allFields
        .filter((f) => labelNorm(f) in receiptOrder && !(labelNorm(f) in topOrder))
        .sort((a, b) => (receiptOrder[labelNorm(a)] ?? 999) - (receiptOrder[labelNorm(b)] ?? 999))

      const used = new Set<string>([...topFields, ...tableFields, ...receiptFields].map((f) => f.id))
      const remaining = workingSections
        .map((s) => ({ ...s, fields: s.fields.filter((f) => !used.has(f.id)) }))
        .filter((s) => s.fields.length > 0)

      const rebuilt: typeof workingSections = []
      if (topFields.length > 0) rebuilt.push({ key: 'notice_transmittal_details', title: 'Section — Notice Details', fields: topFields as any })
      if (tableFields.length > 0) rebuilt.push({ key: 'notice_transmittal_items', title: 'Section — Itemized Transmittal', fields: tableFields as any })
      rebuilt.push(...remaining)
      if (receiptFields.length > 0) rebuilt.push({ key: 'notice_transmittal_receipt', title: 'Section — Receipt', fields: receiptFields as any })
      workingSections = rebuilt
    }

    if (isWorkLogTemplate) {
      const labelNorm = (f: { label?: string }) =>
        String(parseCustomFieldSpec(f.label)?.label ?? f.label ?? '').trim().toLowerCase()
      const allFields = workingSections.flatMap((s) => s.fields)

      const locationField = allFields.find((f) => parseJobDropdownMarker(parseCustomFieldSpec(f.label)?.label ?? f.label))
      const siteLocationField = allFields.find((f) => labelNorm(f) === 'site location')
      const workDescriptionField = allFields.find((f) => labelNorm(f) === 'work description')
      const tableFields = allFields
        .filter((f) => parseWorkLogTableCell(parseCustomFieldSpec(f.label)?.label ?? f.label) != null)
        .sort((a, b) => {
          const aa = parseWorkLogTableCell(parseCustomFieldSpec(a.label)?.label ?? a.label)
          const bb = parseWorkLogTableCell(parseCustomFieldSpec(b.label)?.label ?? b.label)
          if (!aa || !bb) return 0
          const colOrder = {
            trade: 1,
            date: 2,
            startTime: 3,
            endTime: 4,
            regularHours: 5,
            overtimeHours: 6,
            numberOfGuys: 7,
            totalHours: 8,
          }
          return aa.row - bb.row || colOrder[aa.column] - colOrder[bb.column]
        })
      const totalsFields = allFields
        .filter((f) =>
          [
            'totals trade',
            'totals date',
            'totals start time',
            'totals end time',
            'totals regular hours',
            'totals overtime hours',
            'totals number of guys',
            'totals total hours',
          ].includes(labelNorm(f))
        )
      const buttconFields = allFields.filter((f) =>
        [
          'buttcon company name',
          'buttcon supervisor name',
          'buttcon supervisor signature',
          'buttcon date',
        ].includes(labelNorm(f))
      )
      const maximFields = allFields.filter((f) =>
        ['maxim supervisor name', 'maxim supervisor signature', 'maxim date'].includes(labelNorm(f))
      )

      const topFields = [locationField, siteLocationField, workDescriptionField].filter(Boolean) as typeof allFields
      const used = new Set<string>([...topFields, ...tableFields, ...totalsFields, ...buttconFields, ...maximFields].map((f) => f.id))
      const remaining = workingSections
        .map((s) => ({ ...s, fields: s.fields.filter((f) => !used.has(f.id)) }))
        .filter((s) => s.fields.length > 0)

      const rebuilt: typeof workingSections = []
      if (topFields.length > 0) rebuilt.push({ key: 'work_log_details', title: 'Section — Work Log Details', fields: topFields as any })
      if (tableFields.length > 0 || totalsFields.length > 0) {
        rebuilt.push({ key: 'work_log_table', title: 'Section — Work Log Entries', fields: [...tableFields, ...totalsFields] as any })
      }
      rebuilt.push(...remaining)
      rebuilt.push({ key: 'work_log_signatures', title: 'Section — Signatures', fields: [...buttconFields, ...maximFields] as any })
      workingSections = rebuilt
    }

    if (isNicheQuarterlyTemplate) {
      const labelNorm = (f: { label?: string }) =>
        String(parseCustomFieldSpec(f.label)?.label ?? f.label ?? '').trim().toLowerCase()
      const allFields = workingSections.flatMap((s) => s.fields)
      const topFields = allFields.filter((f) => {
        if (parseJobDropdownMarker(parseCustomFieldSpec(f.label)?.label ?? f.label)) return true
        return ['add in', 'location', 'line'].includes(labelNorm(f))
      })
      const matrixField = allFields.find((f) => labelNorm(f) === 'inspection rows (fill quarterly findings)')
      const notesFields = allFields.filter((f) => ['notes', 'comments'].includes(labelNorm(f)))
      const signoffFields = allFields.filter((f) => ['inspected by', 'date', 'signature'].includes(labelNorm(f)))

      const used = new Set<string>([...topFields, ...(matrixField ? [matrixField] : []), ...notesFields, ...signoffFields].map((f) => f.id))
      const remaining = workingSections
        .map((s) => ({ ...s, fields: s.fields.filter((f) => !used.has(f.id)) }))
        .filter((s) => s.fields.length > 0)

      const rebuilt: typeof workingSections = []
      if (topFields.length > 0) rebuilt.push({ key: 'niche_water_softener_details', title: 'Section — Niche Details', fields: topFields as any })
      if (matrixField) rebuilt.push({ key: 'niche_water_softener_matrix', title: 'Section — Inspection Matrix', fields: [matrixField] as any })
      rebuilt.push(...remaining)
      if (notesFields.length > 0) rebuilt.push({ key: 'niche_water_softener_notes', title: 'Section — Notes', fields: notesFields as any })
      if (signoffFields.length > 0) rebuilt.push({ key: 'niche_water_softener_signoff', title: 'Section — Sign-Off', fields: signoffFields as any })
      workingSections = rebuilt
    }

    if (isTestingVerificationDefTemplate) {
      const labelNorm = (f: { label?: string }) =>
        String(parseCustomFieldSpec(f.label)?.label ?? f.label ?? '').trim().toLowerCase()
      const allFields = workingSections.flatMap((s) => s.fields)
      const topFields = allFields.filter((f) =>
        parseJobDropdownMarker(parseCustomFieldSpec(f.label)?.label ?? f.label)
        || ['project/site', 'building/location', 'piping system', 'date'].includes(labelNorm(f))
      )
      const matrixField = allFields.find((f) => labelNorm(f) === 'def verification matrix checklist')
      const noteFields = allFields.filter((f) => ['review note'].includes(labelNorm(f)))
      const signoffFields = allFields.filter((f) => ['inspected by', 'completed by', 'completion date'].includes(labelNorm(f)))

      const used = new Set<string>([...topFields, ...(matrixField ? [matrixField] : []), ...noteFields, ...signoffFields].map((f) => f.id))
      const remaining = workingSections
        .map((s) => ({ ...s, fields: s.fields.filter((f) => !used.has(f.id)) }))
        .filter((s) => s.fields.length > 0)
      const rebuilt: typeof workingSections = []
      if (topFields.length > 0) rebuilt.push({ key: 'def_details', title: 'Section — Header', fields: topFields as any })
      if (matrixField) rebuilt.push({ key: 'def_matrix', title: 'Section — Testing and Verification Procedure DEF', fields: [matrixField] as any })
      rebuilt.push(...remaining)
      if (noteFields.length > 0) rebuilt.push({ key: 'def_notes', title: 'Section — Notes', fields: noteFields as any })
      if (signoffFields.length > 0) rebuilt.push({ key: 'def_signoff', title: 'Section — Sign-Off', fields: signoffFields as any })
      workingSections = rebuilt
    }

    if (isInterim2PmChecklistTemplate) {
      const labelNorm = (f: { label?: string }) =>
        String(parseCustomFieldSpec(f.label)?.label ?? f.label ?? '').trim().toLowerCase()
      const allFields = workingSections.flatMap((s) => s.fields)
      const topFields = allFields.filter((f) =>
        parseJobDropdownMarker(parseCustomFieldSpec(f.label)?.label ?? f.label)
        || ['building/location', 'version', 'date modified', 'date'].includes(labelNorm(f))
      )
      const matrixFields = allFields.filter((f) => parseInterim2PmPageNumFromMatrixLabel(f.label) != null)
      const noteFields = allFields.filter((f) => labelNorm(f) === 'review note')
      const signoffFields = allFields.filter((f) =>
        ['inspected by', 'completed by', 'completion date'].includes(labelNorm(f))
      )

      const used = new Set<string>([
        ...topFields,
        ...matrixFields,
        ...noteFields,
        ...signoffFields,
      ].map((f) => f.id))
      const rebuilt: typeof workingSections = []
      if (topFields.length > 0) {
        rebuilt.push({ key: 'interim2_header', title: 'Section — Header', fields: topFields as any })
      }
      for (const page of INTERIM2_PM_PAGES) {
        const matrixField = matrixFields.find((f) => parseInterim2PmPageNumFromMatrixLabel(f.label) === page.pageNum)
        if (matrixField) {
          rebuilt.push({
            key: `interim2_pm_page_${page.pageNum}`,
            title: `Page ${page.pageNum} — ${page.title}`,
            fields: [matrixField] as any,
          })
        }
      }
      if (noteFields.length > 0) {
        rebuilt.push({ key: 'interim2_notes', title: 'Section — Review Note', fields: noteFields as any })
      }
      if (signoffFields.length > 0) {
        rebuilt.push({ key: 'interim2_signoff', title: 'Section — Sign-Off', fields: signoffFields as any })
      }
      const remaining = workingSections
        .map((s) => ({ ...s, fields: s.fields.filter((f) => !used.has(f.id)) }))
        .filter((s) => s.fields.length > 0)
      rebuilt.push(...remaining)
      workingSections = rebuilt
    }

    return workingSections
  })()

  return (
    <div className="max-w-4xl space-y-4 animate-fade-in">
      {submissionStatus === 'RESUBMIT_REQUIRED' && resubmissionReason && (
        <Card padding="md" className="no-print border-red-200 dark:border-red-800 bg-red-50/50 dark:bg-red-950/20">
          <p className="font-medium text-red-800 dark:text-red-200">Resubmission required</p>
          <p className="text-sm text-red-700 dark:text-red-200 mt-1 whitespace-pre-wrap">{resubmissionReason}</p>
        </Card>
      )}
      <div className="no-print flex flex-wrap items-center justify-between gap-4">
        <div>
          <button
            type="button"
            className="text-sm text-neutral-500 dark:text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-300 mb-1 flex items-center gap-1"
            onClick={() => navigate('/library')}
          >
            ← Back to library
          </button>
          <h1 className="font-display font-bold text-xl text-neutral-900 dark:text-white">{template.name}</h1>
          <p className="text-sm text-neutral-500 dark:text-neutral-400">
            Fill in all required fields marked with * then click Submit.
          </p>
          <div className="mt-2">
            <label htmlFor="form-custom-title" className="block text-xs font-medium text-neutral-500 dark:text-neutral-400 mb-0.5">
              {isDailyHazardTemplateName ? 'Form title (saved with this draft)' : 'Form Title for HR Filtering (Optional)'}
            </label>
            <input
              id="form-custom-title"
              type="text"
              value={customTitle}
              onChange={(e) => setCustomTitle(e.target.value)}
              placeholder={template.name}
              className="w-full max-w-md min-h-[36px] px-3 rounded-lg border border-neutral-200 dark:border-neutral-600 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white text-sm"
            />
          </div>
          {jobOptions.length > 0 && (
            <div className="mt-3 max-w-md">
              <label htmlFor="form-linked-job" className="block text-xs font-medium text-neutral-500 dark:text-neutral-400 mb-0.5">
                Linked job (Job Management)
              </label>
              <select
                id="form-linked-job"
                value={selectedJobId}
                onChange={(e) => setSelectedJobId(e.target.value)}
                className="w-full min-h-[36px] px-3 rounded-lg border border-neutral-200 dark:border-neutral-600 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white text-sm"
                aria-label="Link submission to a job"
              >
                <option value="">No job linked</option>
                {jobOptions.map((j) => (
                  <option key={j.id} value={j.id}>
                    {j.label}
                  </option>
                ))}
              </select>
              <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
                {isDailyHazardTemplateName
                  ? 'Tie this DHA to a job for traceability. Each new DHA you start is a separate draft — use My Drafts to reopen earlier ones.'
                  : 'Tie this submission to a job for traceability. Changing the job loads the draft for that job (or starts a new one).'}
              </p>
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          {isDailyHazardTemplateName && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => void handleStartNewDhaDraft()}
              disabled={submitting || loading || clearAllBusy || Boolean(deletingDraftId)}
            >
              Start new DHA
            </Button>
          )}
          {submissionStatus === 'DRAFT' && submissionId && (
            <Button
              variant="outline"
              size="sm"
              className="text-red-600 border-red-200 hover:bg-red-50 dark:text-red-400 dark:border-red-800 dark:hover:bg-red-950/40"
              onClick={() => void handleDeleteCurrentDraft()}
              disabled={submitting || loading || clearAllBusy || deletingDraftId === submissionId}
            >
              {deletingDraftId === submissionId ? 'Deleting…' : 'Delete draft'}
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={handleClearAll}
            disabled={submitting || clearAllBusy || toolboxExtraPdfUploading || toolboxExtraPdfRemoving}
          >
            {clearAllBusy ? 'Clearing…' : 'Clear All'}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              if (isDailyHazardTemplateName) void handleSaveDhaDraftToList()
              else navigate('/library')
            }}
            disabled={submitting || dhaSaveDraftBusy}
          >
            {dhaSaveDraftBusy ? 'Saving…' : 'Save draft'}
          </Button>
          <Button size="sm" onClick={handleSubmit} disabled={submitting}>
            {submitting ? 'Submitting…' : 'Submit form'}
          </Button>
        </div>
      </div>

      {isDailyHazardTemplateName && (
        <Card padding="md" className="no-print border-brand-200 dark:border-brand-800 bg-brand-50/20 dark:bg-brand-950/20">
          <p className="text-sm font-medium text-neutral-900 dark:text-white">Saved DHA drafts</p>
          <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
            Only forms you save with <strong>Save draft</strong> appear here (not autosave).
            <strong> Start new DHA</strong> opens a blank form; saved drafts stay in this list until you delete them.
          </p>
          {!dhaSavedToList && submissionId && (
            <p className="text-xs text-amber-700 dark:text-amber-400 mt-2">
              This form is not in your saved drafts yet — click <strong>Save draft</strong> to keep it.
            </p>
          )}
          {dhaSaveDraftMessage && (
            <p className="text-xs text-neutral-600 dark:text-neutral-300 mt-2">{dhaSaveDraftMessage}</p>
          )}
          {dhaSavedDraftsLoading ? (
            <p className="mt-3 text-sm text-neutral-500">Loading drafts…</p>
          ) : dhaSavedDrafts.length === 0 ? (
            <p className="mt-3 text-sm text-neutral-500 dark:text-neutral-400">
              No saved drafts yet for this form. Fill in a field or use <strong>Save draft</strong> to keep your place.
            </p>
          ) : (
            <ul className="mt-3 space-y-2 max-h-40 overflow-y-auto">
              {dhaSavedDrafts.map((d) => {
                const isCurrent = dhaSavedToList && d.id === submissionId
                const label =
                  d.title?.trim() || d.templateName || template?.name || 'Daily Hazard Assessments Form'
                const when = d.createdAt ? new Date(d.createdAt).toLocaleString() : ''
                const href = `/forms/new/${templateId}${d.jobId ? `?jobId=${encodeURIComponent(d.jobId)}&` : '?'}draftId=${encodeURIComponent(d.id)}`
                return (
                  <li
                    key={d.id}
                    className={`flex flex-wrap items-center justify-between gap-2 py-2 px-3 rounded-xl text-sm ${
                      isCurrent
                        ? 'bg-brand-100/80 dark:bg-brand-900/40 ring-1 ring-brand-300 dark:ring-brand-700'
                        : 'bg-neutral-50 dark:bg-neutral-800/50'
                    }`}
                  >
                    <div className="min-w-0">
                      <span className="font-medium text-neutral-900 dark:text-white">{label}</span>
                      {when && <span className="text-neutral-500 dark:text-neutral-400 ml-2 text-xs">{when}</span>}
                      {isCurrent && (
                        <span className="ml-2 text-xs font-medium text-brand-700 dark:text-brand-300">(editing now)</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {!isCurrent && (
                        <Button type="button" variant="outline" size="sm" onClick={() => navigate(href)}>
                          Open
                        </Button>
                      )}
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="text-red-600 hover:text-red-700 dark:text-red-400"
                        disabled={deletingDraftId === d.id}
                        onClick={() => void handleDeleteDhaDraft(d.id, label, isCurrent)}
                      >
                        {deletingDraftId === d.id ? 'Deleting…' : 'Delete'}
                      </Button>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
          <p className="mt-2 text-xs text-neutral-500 dark:text-neutral-400">
            Also on your <Link to="/" className="text-brand-600 dark:text-brand-400 hover:underline">dashboard</Link> under{' '}
            <strong>My Drafts</strong>, or{' '}
            <Link to="/library?view=submissions&status=draft" className="text-brand-600 dark:text-brand-400 hover:underline">
              Forms &amp; Documents → Submissions → Draft
            </Link>
            .
          </p>
        </Card>
      )}

      {isLegislativeComplianceTemplate && (
        <Card padding="md" className="no-print border-amber-200 dark:border-amber-800 bg-amber-50/40 dark:bg-amber-950/25">
          <p className="text-sm font-medium text-amber-900 dark:text-amber-100">Yearly review required</p>
          <p className="text-sm text-amber-800/90 dark:text-amber-200/90 mt-1">
            Complete this evaluation at least annually and schedule the next review before your <strong>Next Review Date</strong> (e.g. COR 2020 Element 13.4). Retain records per your program; full requirement wording is in the checklist document.
          </p>
          <p className="text-sm mt-2">
            <a
              className="text-brand-600 dark:text-brand-400 font-medium underline hover:no-underline"
              href="/documents/Compliance-Evaluation-Checklist.docx"
              download
            >
              Download Compliance Evaluation Checklist (DOCX)
            </a>
            <span className="text-neutral-600 dark:text-neutral-400"> — separate reference document attached to this form type.</span>
          </p>
        </Card>
      )}

      {isCriticalTaskRiskRegisterTemplate && (
        <Card padding="md" className="no-print border-sky-200 dark:border-sky-800 bg-sky-50/40 dark:bg-sky-950/25">
          <p className="text-sm font-medium text-sky-900 dark:text-sky-100">Reference document (V.2)</p>
          <p className="text-sm text-sky-800/90 dark:text-sky-200/90 mt-1">
            Use the PDF for full column definitions and formatting. Update this register when tasks, equipment, or hazards change; communicate changes to affected workers as required.
          </p>
          <p className="text-sm mt-2">
            <a
              className="text-brand-600 dark:text-brand-400 font-medium underline hover:no-underline"
              href="/documents/Critical-Task-Inventory-Risk-Register.pdf"
              download
            >
              Download Critical Task Inventory &amp; Risk Register (PDF)
            </a>
            <span className="text-neutral-600 dark:text-neutral-400"> — same document as attached to this form type.</span>
          </p>
        </Card>
      )}

      {isConfinedSpaceEntryPermitTemplate && (
        <Card padding="md" className="no-print border-violet-200 dark:border-violet-800 bg-violet-50/40 dark:bg-violet-950/25">
          <p className="text-sm font-medium text-violet-900 dark:text-violet-100">Reference form (2026)</p>
          <p className="text-sm text-violet-800/90 dark:text-violet-200/90 mt-1">
            Follow O. Reg. 632/05 and site procedures. Do not enter until hazards are controlled, atmospheric tests are acceptable, and an attendant is stationed. Cancel or close the permit when work is complete.
          </p>
          <p className="text-sm mt-2">
            <a
              className="text-brand-600 dark:text-brand-400 font-medium underline hover:no-underline"
              href="/documents/Confined-Space-Entry-Permit-2026.pdf"
              download
            >
              Download Confined Spaces form (PDF)
            </a>
            <span className="text-neutral-600 dark:text-neutral-400"> — same layout as the 2026 reference document.</span>
          </p>
        </Card>
      )}

      {isInterim2PmChecklistTemplate && (
        <Card padding="md" className="no-print border-sky-200 dark:border-sky-800 bg-sky-50/40 dark:bg-sky-950/25">
          <p className="text-sm font-medium text-sky-900 dark:text-sky-100">INTERIM 2 PM Checklist — Site Copy V1.1</p>
          <p className="text-sm text-sky-800/90 dark:text-sky-200/90 mt-1">
            Complete all 19 checklist pages (DEF, Sanding, and WWF systems). Check each inspection task, add comments where needed, then sign off at the bottom.
          </p>
          <p className="text-sm mt-2">
            <a
              className="text-brand-600 dark:text-brand-400 font-medium underline hover:no-underline"
              href="/documents/INTERIM-2-PM-CHECKLIST-SITE-COPY-V1.1.pdf"
              download
            >
              Download PM Checklist reference (PDF)
            </a>
            <span className="text-neutral-600 dark:text-neutral-400"> — 19-page site copy dated 03-31-2026.</span>
          </p>
        </Card>
      )}

      {errors.length > 0 && (
        <Card padding="md" className="no-print border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/20">
          <p className="font-medium text-amber-800 dark:text-amber-200">Please complete these required fields before submitting:</p>
          <ul className="list-disc list-inside mt-1 text-sm text-amber-700 dark:text-amber-300">
            {errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </Card>
      )}

      {signatureSaveError && (
        <Card padding="md" className="no-print border-red-200 dark:border-red-800 bg-red-50/50 dark:bg-red-950/20">
          <p className="font-medium text-red-800 dark:text-red-200">Signature could not be saved</p>
          <p className="text-sm text-red-700 dark:text-red-200 mt-1">{signatureSaveError}</p>
        </Card>
      )}

      {!isCustomTemplate && pageCount > 1 && (
        <div className="no-print flex flex-wrap gap-2">
          {Array.from({ length: pageCount }, (_, i) => i + 1).map((p) => (
            <button
              key={p}
              type="button"
              className={`px-4 py-1.5 rounded-lg text-sm font-medium ${currentPage === p
                ? 'bg-brand-600 text-white'
                : 'bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-600 text-neutral-600 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-700'
                }`}
              onClick={() => setCurrentPage(p)}
            >
              Page {p}
            </button>
          ))}
        </div>
      )}

      {isCustomTemplate && (
        <div className="space-y-4">
          {isDailyHazardTemplate && (
            <Card padding="md" className="border-brand-200 dark:border-brand-800 bg-brand-50/30 dark:bg-brand-900/10">
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex-1 min-w-[240px]">
                  <label className="block text-sm font-semibold text-neutral-700 dark:text-neutral-300 mb-1">Load Preset</label>
                  <select
                    value={selectedDhaPresetId}
                    onChange={(e) => handleLoadDhaPreset(e.target.value)}
                    className="w-full min-h-[40px] px-3 rounded-lg border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 text-sm"
                  >
                    <option value="">— Select a saved preset to auto-fill —</option>
                    {dhaPresets.map((preset) => (
                      <option key={preset.id} value={preset.id}>{preset.name}</option>
                    ))}
                  </select>
                </div>
                <Button type="button" variant="secondary" size="sm" onClick={() => setShowSaveDhaPresetModal(true)}>
                  Save as Preset
                </Button>
                {selectedDhaPresetId && (
                  <Button type="button" variant="danger" size="sm" onClick={() => void handleDeleteDhaPreset(selectedDhaPresetId)}>
                    Delete Preset
                  </Button>
                )}
              </div>
              {dhaPresets.length === 0 && (
                <p className="mt-2 text-xs text-neutral-500 dark:text-neutral-400">
                  No presets saved yet. Fill out the form and save a preset for quick reuse.
                </p>
              )}
            </Card>
          )}
          {(() => {
            if (!isDailyHazardTemplate) return null
            const allVisibleFields = visibleSections.flatMap((section) => section.fields)
            const allTemplateFields = template.fields ?? []
            const allFields = [...allVisibleFields, ...allTemplateFields]
            const byExactLabel = (label: string, types?: string[]) =>
              allFields.find((f) => {
                const fieldLabel = normalizeDhaLabel(parseCustomFieldSpec(f.label)?.label ?? f.label)
                const typeOk = !types || types.includes(fieldTypeNorm(f.type))
                return fieldLabel === normalizeDhaLabel(label) && typeOk
              })
            const byAliases = (aliases: string[], types?: string[]) =>
              allFields.find((f) => {
                const fieldLabel = normalizeDhaLabel(parseCustomFieldSpec(f.label)?.label ?? f.label)
                const typeOk = !types || types.includes(fieldTypeNorm(f.type))
                if (!typeOk) return false
                return aliases.some((aliasRaw) => {
                  const alias = normalizeDhaLabel(aliasRaw)
                  return fieldLabel === alias || fieldLabel.includes(alias) || alias.includes(fieldLabel)
                })
              })
            const dateField = byExactLabel('date', ['DATE', 'TEXT'])
            const projectField =
              allFields.find((f) => parseJobDropdownMarker(parseCustomFieldSpec(f.label)?.label ?? f.label) != null)
              ?? allFields.find((f) => normalizeDhaLabel(parseCustomFieldSpec(f.label)?.label ?? f.label).includes('project'))
            const musterField = byAliases(['muster point', 'meeting point'], ['TEXT'])
            const supervisorField = byAliases(['supervisor'], ['TEXT', 'DROPDOWN', 'SELECT'])
            const jobNumberField = byAliases(['job number'], ['TEXT', 'NUMBER'])
            const weatherField = byAliases(['weather (°c)', 'weather temp', 'temperature', 'weather'], ['TEXT', 'NUMBER'])
            const nearestHospitalField = byAliases(['nearest hospital', 'hospital name', 'hospital'], ['TEXT'])
            const emergencyCoordinatorField = byAliases(['emergency response coordinator', 'emergency coordinator', 'response coordinator'], ['TEXT'])
            const weatherConditionFields = allFields.filter((f) => {
              const label = String(parseCustomFieldSpec(f.label)?.label ?? f.label ?? '').trim().toLowerCase()
              return ['rain', 'snow', 'wind', 'lightning', 'sun', 'overcast'].includes(label) && fieldTypeNorm(f.type) === 'CHECKBOX'
            })
            const dhaInputCls = 'w-full min-h-[44px] px-4 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white text-sm'
            const dhaLabelCls = 'block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1'
            return (
              <Card padding="lg">
                <CardHeader>Section 1 — General Information</CardHeader>
                <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {dateField && (
                    <label className="block">
                      <span className={dhaLabelCls}>Date *</span>
                      <input type="date" value={values[dateField.id] ?? ''} onChange={(e) => handleValueChange(dateField.id, e.target.value)} className={dhaInputCls} />
                    </label>
                  )}
                  <label className="block">
                    <span className={dhaLabelCls}>Project</span>
                    <select
                      value={projectField ? (values[projectField.id] ?? '') : dhaProjectFallback}
                      onChange={(e) => projectField ? handleValueChange(projectField.id, e.target.value) : setDhaProjectFallback(e.target.value)}
                      className={dhaInputCls}
                    >
                      <option value="">Select project...</option>
                      {jobOptions.map((job) => (
                        <option key={job.id} value={job.label}>{job.label}</option>
                      ))}
                    </select>
                  </label>
                  {musterField && (
                    <label className="block">
                      <span className={dhaLabelCls}>Muster Point *</span>
                      <input type="text" value={values[musterField.id] ?? ''} onChange={(e) => handleValueChange(musterField.id, e.target.value)} className={dhaInputCls} />
                    </label>
                  )}
                  <label className="block">
                    <span className={dhaLabelCls}>Supervisor</span>
                    {(() => {
                      const selectOptions = dhaSupervisorOptions.map((s) => s.name).filter(Boolean)
                      if (selectOptions.length > 0) {
                        return (
                          <select
                            value={supervisorField ? (values[supervisorField.id] ?? '') : ''}
                            onChange={(e) => supervisorField && handleValueChange(supervisorField.id, e.target.value)}
                            className={dhaInputCls}
                          >
                            <option value="">Select supervisor...</option>
                            {selectOptions.map((option) => (
                              <option key={option} value={option}>{option}</option>
                            ))}
                          </select>
                        )
                      }
                      return (
                        <input
                          type="text"
                          value={supervisorField ? (values[supervisorField.id] ?? '') : ''}
                          onChange={(e) => supervisorField && handleValueChange(supervisorField.id, e.target.value)}
                          className={dhaInputCls}
                        />
                      )
                    })()}
                  </label>
                  {jobNumberField && (
                    <label className="block">
                      <span className={dhaLabelCls}>Job Number *</span>
                      <input type="text" value={values[jobNumberField.id] ?? ''} onChange={(e) => handleValueChange(jobNumberField.id, e.target.value)} className={dhaInputCls} />
                    </label>
                  )}
                  <label className="block">
                    <span className={dhaLabelCls}>Weather (°C)</span>
                    <input
                      type="text"
                      value={weatherField ? (values[weatherField.id] ?? '') : dhaWeatherFallback}
                      onChange={(e) => {
                        if (weatherField) handleValueChange(weatherField.id, e.target.value)
                        else setDhaWeatherFallback(e.target.value)
                        handleValueChange('__dha_weather__', e.target.value)
                      }}
                      placeholder="e.g. 12"
                      className={dhaInputCls}
                    />
                  </label>
                </div>
                <div className="mt-4">
                  <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">Weather Conditions</label>
                  <div className="flex flex-wrap gap-3">
                    {['Rain', 'Snow', 'Wind', 'Lightning', 'Sun', 'Overcast'].map((condition) => {
                      const mappedField = weatherConditionFields.find((f) =>
                        normalizeDhaLabel(parseCustomFieldSpec(f.label)?.label ?? f.label).includes(normalizeDhaLabel(condition))
                      )
                      const checked = mappedField ? values[mappedField.id] === 'true' : Boolean(dhaWeatherConditionFallback[condition])
                      return (
                        <label key={condition} className="flex items-center gap-2 py-2 px-3 border border-neutral-200 dark:border-neutral-700 hover:bg-neutral-50 dark:hover:bg-neutral-800 rounded-lg cursor-pointer">
                          <input
                            type="checkbox"
                            className="shrink-0"
                            checked={checked}
                            onChange={(e) => {
                              if (mappedField) {
                                handleValueChange(mappedField.id, e.target.checked ? 'true' : 'false')
                              } else {
                                setDhaWeatherConditionFallback((prev) => ({ ...prev, [condition]: e.target.checked }))
                              }
                              const current = { ...dhaWeatherConditionFallback, [condition]: e.target.checked }
                              const selected = ['Rain', 'Snow', 'Wind', 'Lightning', 'Sun', 'Overcast'].filter((c) => Boolean(current[c]))
                              handleValueChange('__dha_weather_conditions__', selected.join('|'))
                            }}
                          />
                          <span className="text-sm">{condition}</span>
                        </label>
                      )
                    })}
                  </div>
                </div>
                <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <label className="block">
                    <span className={dhaLabelCls}>Nearest Hospital</span>
                    <input
                      type="text"
                      value={nearestHospitalField ? (values[nearestHospitalField.id] ?? '') : dhaNearestHospitalFallback}
                      onChange={(e) => {
                        if (nearestHospitalField) handleValueChange(nearestHospitalField.id, e.target.value)
                        else setDhaNearestHospitalFallback(e.target.value)
                        handleValueChange('__dha_nearest_hospital__', e.target.value)
                      }}
                      placeholder="Name or address"
                      className={dhaInputCls}
                    />
                  </label>
                  <label className="block">
                    <span className={dhaLabelCls}>Emergency Response Coordinator</span>
                    <input
                      type="text"
                      value={emergencyCoordinatorField ? (values[emergencyCoordinatorField.id] ?? '') : dhaEmergencyCoordinatorFallback}
                      onChange={(e) => {
                        if (emergencyCoordinatorField) handleValueChange(emergencyCoordinatorField.id, e.target.value)
                        else setDhaEmergencyCoordinatorFallback(e.target.value)
                        handleValueChange('__dha_emergency_coordinator__', e.target.value)
                      }}
                      placeholder="Name"
                      className={dhaInputCls}
                    />
                  </label>
                </div>
              </Card>
            )
          })()}
          {(() => {
            if (!isDailyHazardTemplate) return null
            const allVisibleFields = visibleSections.flatMap((section) => section.fields)
            const allTemplateFields = template.fields ?? []
            const allFields = [...allVisibleFields, ...allTemplateFields]
            const activityEntries = dhaGeneralActivities.map((activity) => {
              const field = allFields.find((f) => {
                if (fieldTypeNorm(f.type) !== 'CHECKBOX') return false
                const label = parseCustomFieldSpec(f.label)?.label ?? f.label
                return normalizeDhaLabel(label) === normalizeDhaLabel(activity)
              })
              return { activity, field }
            })
            if (activityEntries.every((entry) => !entry.field)) return null
            return (
              <Card padding="lg">
                <CardHeader>Section 2 — General Activities and Hazards</CardHeader>
                <CardDescription>Select all that apply</CardDescription>
                <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                  {activityEntries.map(({ activity, field }) => (
                    <label key={activity} className="flex items-start gap-3 py-3 px-3 border border-neutral-200 dark:border-neutral-700 hover:bg-neutral-50 dark:hover:bg-neutral-800 rounded-lg cursor-pointer min-h-[58px]">
                      <input
                        type="checkbox"
                        className="mt-0.5 shrink-0"
                        checked={field ? values[field.id] === 'true' : false}
                        onChange={(e) => field && handleValueChange(field.id, e.target.checked ? 'true' : 'false')}
                        disabled={!field}
                      />
                      <span className="text-sm leading-snug">{activity}</span>
                    </label>
                  ))}
                </div>
              </Card>
            )
          })()}
          {(() => {
            if (!isDailyHazardTemplate) return null
            const allVisibleFields = visibleSections.flatMap((section) => section.fields)
            const allTemplateFields = template.fields ?? []
            const allFields = [...allVisibleFields, ...allTemplateFields]
            const hazardEntries = dhaSpecificHazards.map((hazard) => {
              const field = allFields.find((f) => {
                if (fieldTypeNorm(f.type) !== 'CHECKBOX') return false
                const label = parseCustomFieldSpec(f.label)?.label ?? f.label
                return normalizeDhaLabel(label) === normalizeDhaLabel(hazard)
              })
              return { hazard, field }
            })
            if (hazardEntries.every((entry) => !entry.field)) return null
            return (
              <Card padding="lg">
                <CardHeader>Section 3 — Specific Hazards and Site Considerations</CardHeader>
                <CardDescription>Select all that apply</CardDescription>
                <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                  {hazardEntries.map(({ hazard, field }) => (
                    <label key={hazard} className="flex items-start gap-3 py-3 px-3 border border-neutral-200 dark:border-neutral-700 hover:bg-neutral-50 dark:hover:bg-neutral-800 rounded-lg cursor-pointer min-h-[58px]">
                      <input
                        type="checkbox"
                        className="mt-0.5 shrink-0"
                        checked={field ? values[field.id] === 'true' : false}
                        onChange={(e) => field && handleValueChange(field.id, e.target.checked ? 'true' : 'false')}
                        disabled={!field}
                      />
                      <span className="text-sm leading-snug">{hazard}</span>
                    </label>
                  ))}
                </div>
              </Card>
            )
          })()}
          {(() => {
            if (!isDailyHazardTemplate) return null
            const allVisibleFields = visibleSections.flatMap((section) => section.fields)
            const allTemplateFields = template.fields ?? []
            const allFields = [...allVisibleFields, ...allTemplateFields]
            const controlEntries = dhaStandardSiteControls.map((control) => {
              const field = allFields.find((f) => {
                if (fieldTypeNorm(f.type) !== 'CHECKBOX') return false
                const label = parseCustomFieldSpec(f.label)?.label ?? f.label
                return normalizeDhaLabel(label) === normalizeDhaLabel(control)
              })
              return { control, field }
            })
            if (controlEntries.every((entry) => !entry.field)) return null
            return (
              <Card padding="lg">
                <CardHeader>Section 4 — Standard Site Controls</CardHeader>
                <CardDescription>Select all that apply</CardDescription>
                <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                  {controlEntries.map(({ control, field }) => (
                    <label key={control} className="flex items-start gap-3 py-3 px-3 border border-neutral-200 dark:border-neutral-700 hover:bg-neutral-50 dark:hover:bg-neutral-800 rounded-lg cursor-pointer min-h-[58px]">
                      <input
                        type="checkbox"
                        className="mt-0.5 shrink-0"
                        checked={field ? values[field.id] === 'true' : false}
                        onChange={(e) => field && handleValueChange(field.id, e.target.checked ? 'true' : 'false')}
                        disabled={!field}
                      />
                      <span className="text-sm leading-snug">{control}</span>
                    </label>
                  ))}
                </div>
              </Card>
            )
          })()}
          {(() => {
            if (!isDailyHazardTemplate) return null
            const allVisibleFields = visibleSections.flatMap((section) => section.fields)
            const allTemplateFields = template.fields ?? []
            const allFields = [...allVisibleFields, ...allTemplateFields]
            const hazardAliases: Record<string, string[]> = {
              'INCLEMENT WEATHER': ['inclement weather'],
              'HIGH WINDS': ['high winds', 'high wind'],
              'TRAFFIC': ['traffic', 'moving traffic', 'moving traffic vehicles', 'traffic vehicles'],
              'NEIGHBOURING CONSTRUCTION': ['neighbouring construction', 'neighboring construction', 'neighbouring', 'neighboring'],
              'PUBLIC ACCESS': ['public access', 'public access to site'],
              'PUBLIC PROTECTION IN PLACE': ['public protection in place', 'public protection'],
              'OVERHEAD HAZARDS': ['overhead hazards', 'overhead hazards identified'],
            }
            const externalHazardEntries = dhaExternalHazards.map((hazard) => {
              const field = allFields.find((f) => {
                if (fieldTypeNorm(f.type) !== 'CHECKBOX') return false
                const labelNorm = normalizeDhaLabel(parseCustomFieldSpec(f.label)?.label ?? f.label)
                const aliases = hazardAliases[hazard] ?? [hazard]
                return aliases.some((aliasRaw) => {
                  const alias = normalizeDhaLabel(aliasRaw)
                  return labelNorm === alias || labelNorm.includes(alias) || alias.includes(labelNorm)
                })
              })
              return { hazard, field }
            })
            if (externalHazardEntries.every((entry) => !entry.field)) return null
            return (
              <Card padding="lg">
                <CardHeader>Section 5 — External Hazards</CardHeader>
                <CardDescription>Select all that apply</CardDescription>
                <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                  {externalHazardEntries.map(({ hazard, field }) => (
                    <label key={hazard} className="flex items-start gap-3 py-3 px-3 border border-neutral-200 dark:border-neutral-700 hover:bg-neutral-50 dark:hover:bg-neutral-800 rounded-lg cursor-pointer min-h-[58px]">
                      <input
                        type="checkbox"
                        className="mt-0.5 shrink-0"
                        checked={field ? values[field.id] === 'true' : Boolean(dhaExternalHazardFallback[hazard])}
                        onChange={(e) => {
                          if (field) {
                            handleValueChange(field.id, e.target.checked ? 'true' : 'false')
                            return
                          }
                          setDhaExternalHazardFallback((prev) => ({ ...prev, [hazard]: e.target.checked }))
                        }}
                      />
                      <span className="text-sm leading-snug">{hazard}</span>
                    </label>
                  ))}
                </div>
              </Card>
            )
          })()}
          {(() => {
            if (!isDailyHazardTemplate) return null
            const allVisibleFields = visibleSections.flatMap((section) => section.fields)
            const allTemplateFields = template.fields ?? []
            const allFields = [...allVisibleFields, ...allTemplateFields]
            const ppeEntries = dhaPpeItems.map((ppe) => {
              const field = allFields.find((f) => {
                if (fieldTypeNorm(f.type) !== 'CHECKBOX') return false
                const label = parseCustomFieldSpec(f.label)?.label ?? f.label
                return normalizeDhaLabel(label) === normalizeDhaLabel(ppe.label)
              })
              return { ...ppe, field }
            })
            if (ppeEntries.every((entry) => !entry.field)) return null
            return (
              <Card padding="lg">
                <CardHeader>Section 6 — Personal Protective Equipment Required</CardHeader>
                <CardDescription>Select all that apply — Must be CSA Approved</CardDescription>
                <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                  {ppeEntries.map(({ label, icon, field }) => (
                    <label key={label} className="flex items-start gap-3 py-3 px-3 border border-neutral-200 dark:border-neutral-700 hover:bg-neutral-50 dark:hover:bg-neutral-800 rounded-lg cursor-pointer min-h-[58px]">
                      <input
                        type="checkbox"
                        className="mt-0.5 shrink-0"
                        checked={field ? values[field.id] === 'true' : false}
                        onChange={(e) => field && handleValueChange(field.id, e.target.checked ? 'true' : 'false')}
                        disabled={!field}
                      />
                      <span className="text-sm leading-snug">
                        <span className="mr-2" aria-hidden="true">{icon}</span>
                        {label}
                      </span>
                    </label>
                  ))}
                </div>
              </Card>
            )
          })()}
          {(() => {
            if (!isDailyHazardTemplate) return null
            const allVisibleFields = visibleSections.flatMap((section) => section.fields)
            const allTemplateFields = template.fields ?? []
            const allFields = [...allVisibleFields, ...allTemplateFields]
            const findByIncludes = (parts: string[]) =>
              allFields.find((f) => {
                const label = normalizeDhaLabel(parseCustomFieldSpec(f.label)?.label ?? f.label)
                return parts.every((part) => label.includes(normalizeDhaLabel(part)))
              })
            const toolsField =
              findByIncludes(['tools', 'equipment', 'replaced'])
              ?? findByIncludes(['tools', 'equipment', 'repaired'])
            const commentsField =
              findByIncludes(['additional', 'comments'])
              ?? findByIncludes(['concerns'])
            const section2Selected = dhaGeneralActivities
              .map((activity) => {
                const field = allFields.find((f) => {
                  if (fieldTypeNorm(f.type) !== 'CHECKBOX') return false
                  const label = parseCustomFieldSpec(f.label)?.label ?? f.label
                  return normalizeDhaLabel(label) === normalizeDhaLabel(activity)
                })
                return field && values[field.id] === 'true' ? activity : null
              })
              .filter(Boolean) as string[]

            const updateCustomJhaRow = (id: string, patch: Partial<{ job: string; hazards: string; controls: string; riskBefore: string; riskAfter: string }>) => {
              setDhaCustomJhaRows((prev) => prev.map((row) => (row.id === id ? { ...row, ...patch } : row)))
            }

            return (
              <>
                <Card padding="lg">
                  <CardHeader>Section 7 — Tool Condition</CardHeader>
                  <div className="space-y-4">
                    <label className="block">
                      <span className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
                        Are there any tools or equipment that need to be replaced or repaired? (Optional)
                      </span>
                      <textarea
                        value={toolsField ? (values[toolsField.id] ?? '') : dhaToolsConditionFallback}
                        onChange={(e) => toolsField ? handleValueChange(toolsField.id, e.target.value) : setDhaToolsConditionFallback(e.target.value)}
                        rows={4}
                        className="w-full min-h-[96px] px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white text-sm resize-y"
                      />
                    </label>
                    <label className="block">
                      <span className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
                        Additional Comments or Concerns? (Optional)
                      </span>
                      <textarea
                        value={commentsField ? (values[commentsField.id] ?? '') : dhaAdditionalCommentsFallback}
                        onChange={(e) => commentsField ? handleValueChange(commentsField.id, e.target.value) : setDhaAdditionalCommentsFallback(e.target.value)}
                        rows={4}
                        className="w-full min-h-[96px] px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white text-sm resize-y"
                      />
                    </label>
                  </div>
                </Card>

                <Card padding="lg">
                  <CardHeader>Section 8 — Job Hazard Assessment</CardHeader>
                  <CardDescription>
                    Identify job-specific hazards and controls. If a risk rating is required, please fill out form 10-1.
                  </CardDescription>
                  <div className="mt-4 overflow-x-auto rounded-lg border border-neutral-200 dark:border-neutral-700">
                    <table className="w-full min-w-[900px] border-collapse">
                      <thead className="bg-neutral-100 dark:bg-neutral-800">
                        <tr>
                          <th className="px-3 py-2 text-left text-sm font-semibold border border-neutral-200 dark:border-neutral-700">Job</th>
                          <th className="px-3 py-2 text-left text-sm font-semibold border border-neutral-200 dark:border-neutral-700">Hazards</th>
                          <th className="px-3 py-2 text-left text-sm font-semibold border border-neutral-200 dark:border-neutral-700">Control Measures</th>
                          <th className="px-3 py-2 text-left text-sm font-semibold border border-neutral-200 dark:border-neutral-700">Risk Rating Before Controls</th>
                          <th className="px-3 py-2 text-left text-sm font-semibold border border-neutral-200 dark:border-neutral-700">Risk Rating After Controls</th>
                        </tr>
                      </thead>
                      <tbody>
                        {section2Selected.map((activity) => {
                          const task = getDhaTaskLibraryEntry(activity)
                          const hazards = task?.hazards ?? []
                          const controls = task?.controls ?? []
                          const riskBefore = String(task?.riskBeforeControls ?? '')
                          const riskAfter = String(task?.riskAfterControls ?? '')
                          const riskBeforeScore = dhaRiskScore(riskBefore)
                          const riskAfterScore = dhaRiskScore(riskAfter)
                          return (
                            <tr key={`dha-jha-${activity}`}>
                              <td className="border border-neutral-200 dark:border-neutral-700 p-2 text-sm align-middle">{activity}</td>
                              <td className="border border-neutral-200 dark:border-neutral-700 p-2 align-top">
                                {hazards.length > 0 ? (
                                  <ul className="space-y-1 text-xs text-neutral-800 dark:text-neutral-200">
                                    {hazards.map((hazard) => (
                                      <li key={hazard}>• {hazard}</li>
                                    ))}
                                  </ul>
                                ) : (
                                  <span className="text-xs text-neutral-500 dark:text-neutral-400">—</span>
                                )}
                              </td>
                              <td className="border border-neutral-200 dark:border-neutral-700 p-2 align-top">
                                {controls.length > 0 ? (
                                  <ul className="space-y-1 text-xs text-neutral-800 dark:text-neutral-200">
                                    {controls.map((control) => (
                                      <li key={control}>• {control}</li>
                                    ))}
                                  </ul>
                                ) : (
                                  <span className="text-xs text-neutral-500 dark:text-neutral-400">—</span>
                                )}
                              </td>
                              <td className="border border-neutral-200 dark:border-neutral-700 p-2 align-middle">
                                {riskBefore ? (
                                  <span className={`inline-flex rounded-full border px-2 py-1 text-xs font-semibold ${dhaRiskPillClass(riskBefore)}`}>
                                    {riskBeforeScore ? `${riskBefore} (${riskBeforeScore})` : riskBefore}
                                  </span>
                                ) : (
                                  <span className="text-xs text-neutral-500 dark:text-neutral-400">—</span>
                                )}
                              </td>
                              <td className="border border-neutral-200 dark:border-neutral-700 p-2 align-middle">
                                {riskAfter ? (
                                  <span className={`inline-flex rounded-full border px-2 py-1 text-xs font-semibold ${dhaRiskPillClass(riskAfter)}`}>
                                    {riskAfterScore ? `${riskAfter} (${riskAfterScore})` : riskAfter}
                                  </span>
                                ) : (
                                  <span className="text-xs text-neutral-500 dark:text-neutral-400">—</span>
                                )}
                              </td>
                            </tr>
                          )
                        })}
                        {dhaCustomJhaRows.map((row) => (
                          <tr key={row.id}>
                            <td className="border border-neutral-200 dark:border-neutral-700 p-2 align-top">
                              <input value={row.job} onChange={(e) => updateCustomJhaRow(row.id, { job: e.target.value })} className="w-full min-h-[36px] px-2 rounded border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 text-xs" />
                            </td>
                            <td className="border border-neutral-200 dark:border-neutral-700 p-2 align-top">
                              <textarea value={row.hazards} onChange={(e) => updateCustomJhaRow(row.id, { hazards: e.target.value })} rows={3} className="w-full px-2 py-1.5 rounded border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 text-xs resize-y" />
                            </td>
                            <td className="border border-neutral-200 dark:border-neutral-700 p-2 align-top">
                              <textarea value={row.controls} onChange={(e) => updateCustomJhaRow(row.id, { controls: e.target.value })} rows={3} className="w-full px-2 py-1.5 rounded border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 text-xs resize-y" />
                            </td>
                            <td className="border border-neutral-200 dark:border-neutral-700 p-2 align-top">
                              <select value={row.riskBefore} onChange={(e) => updateCustomJhaRow(row.id, { riskBefore: e.target.value })} className="w-full min-h-[36px] px-2 rounded border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 text-xs">
                                <option value="">Select...</option><option value="Low">Low</option><option value="Medium">Medium</option><option value="High">High</option><option value="Critical">Critical</option>
                              </select>
                            </td>
                            <td className="border border-neutral-200 dark:border-neutral-700 p-2 align-top">
                              <div className="flex items-center gap-2">
                                <select value={row.riskAfter} onChange={(e) => updateCustomJhaRow(row.id, { riskAfter: e.target.value })} className="w-full min-h-[36px] px-2 rounded border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 text-xs">
                                  <option value="">Select...</option><option value="Low">Low</option><option value="Medium">Medium</option><option value="High">High</option><option value="Critical">Critical</option>
                                </select>
                                <button type="button" onClick={() => setDhaCustomJhaRows((prev) => prev.filter((r) => r.id !== row.id))} className="shrink-0 rounded border border-red-200 dark:border-red-800 px-2 py-1 text-xs text-red-700 dark:text-red-300">
                                  Remove
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {section2Selected.length === 0 && (
                    <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-2">
                      Select one or more activities in Section 2 to auto-populate Section 8 jobs.
                    </p>
                  )}
                  <div className="mt-3">
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() =>
                        setDhaCustomJhaRows((prev) => [
                          ...prev,
                          { id: `${Date.now()}-${Math.random().toString(36).slice(2)}`, job: '', hazards: '', controls: '', riskBefore: '', riskAfter: '' },
                        ])
                      }
                    >
                      + Add custom job/hazard row
                    </Button>
                  </div>
                </Card>

                {(() => {
                  const allVisibleFields = visibleSections.flatMap((section) => section.fields)
                  const allTemplateFields = template.fields ?? []
                  const allFields = [...allVisibleFields, ...allTemplateFields]
                  const correctiveActionsField = allFields.find((f) => {
                    const label = normalizeDhaLabel(parseCustomFieldSpec(f.label)?.label ?? f.label)
                    return label.includes('corrective actions')
                  })
                  const questionFieldByIndex = DHA_WORKPLACE_VIOLENCE_QUESTIONS.map((question) =>
                    allFields.find((f) => {
                      const label = normalizeDhaLabel(parseCustomFieldSpec(f.label)?.label ?? f.label)
                      const q = normalizeDhaLabel(question)
                      return label === q || label.includes(q) || q.includes(label)
                    })
                  )
                  return (
                    <Card padding="lg">
                      <CardHeader>Section 9 — Workplace Violence Assessment</CardHeader>
                      <CardDescription>If answering Yes to any question, list corrective actions taken below.</CardDescription>
                      <div className="mt-4 space-y-3">
                        {DHA_WORKPLACE_VIOLENCE_QUESTIONS.map((question, idx) => (
                          <div key={question} className="flex items-center justify-between gap-4 py-3 px-3 border border-neutral-200 dark:border-neutral-700 rounded-lg">
                            <span className="text-sm text-neutral-800 dark:text-neutral-200 flex-1">{question}</span>
                            <div className="flex items-center gap-4 shrink-0">
                              <label className="flex items-center gap-1.5 cursor-pointer">
                                <input
                                  type="radio"
                                  name={`dha-violence-${idx}`}
                                  value="Yes"
                                  checked={
                                    questionFieldByIndex[idx]
                                      ? normalizeDhaLabel(values[questionFieldByIndex[idx]!.id]) === 'yes'
                                      : dhaViolenceAnswers[idx] === 'Yes'
                                  }
                                  onChange={() => {
                                    setDhaViolenceAnswers((prev) => ({ ...prev, [idx]: 'Yes' }))
                                    if (questionFieldByIndex[idx]) handleValueChange(questionFieldByIndex[idx]!.id, 'Yes')
                                    handleValueChange(`__dha_violence_q_${idx}__`, 'Yes')
                                  }}
                                  className="accent-brand-600"
                                />
                                <span className="text-sm">Yes</span>
                              </label>
                              <label className="flex items-center gap-1.5 cursor-pointer">
                                <input
                                  type="radio"
                                  name={`dha-violence-${idx}`}
                                  value="No"
                                  checked={
                                    questionFieldByIndex[idx]
                                      ? normalizeDhaLabel(values[questionFieldByIndex[idx]!.id]) === 'no'
                                      : dhaViolenceAnswers[idx] === 'No'
                                  }
                                  onChange={() => {
                                    setDhaViolenceAnswers((prev) => ({ ...prev, [idx]: 'No' }))
                                    if (questionFieldByIndex[idx]) handleValueChange(questionFieldByIndex[idx]!.id, 'No')
                                    handleValueChange(`__dha_violence_q_${idx}__`, 'No')
                                  }}
                                  className="accent-brand-600"
                                />
                                <span className="text-sm">No</span>
                              </label>
                            </div>
                          </div>
                        ))}
                      </div>
                      <div className="mt-4">
                        <label className="block">
                          <span className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
                            List Corrective Actions Taken (if applicable)
                          </span>
                          <textarea
                            value={correctiveActionsField ? (values[correctiveActionsField.id] ?? '') : dhaViolenceActionsFallback}
                            onChange={(e) => {
                              if (correctiveActionsField) handleValueChange(correctiveActionsField.id, e.target.value)
                              else setDhaViolenceActionsFallback(e.target.value)
                              handleValueChange('__dha_violence_actions__', e.target.value)
                            }}
                            rows={4}
                            className="w-full min-h-[96px] px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white text-sm resize-y"
                          />
                        </label>
                      </div>
                    </Card>
                  )
                })()}

                <Card padding="lg" className="border-brand-500/50 bg-brand-50/20 dark:bg-brand-900/10">
                  <CardHeader>Section 10 — Worker Acknowledgement</CardHeader>
                  <CardDescription className="italic mt-2 text-neutral-800 dark:text-neutral-200 border-l-4 border-brand-500 pl-3">
                    I, the undersigned employee, hereby confirm the following: Thoroughly reviewed and understand the Daily Hazard Analysis / Am physically and mentally fit to perform my assigned duties / Have or will complete all permits and forms to ensure a safe work-day / Addressed and resolved all previous hazards
                  </CardDescription>
                  <div className="mt-6 space-y-4">
                    <h3 className="font-medium text-neutral-900 dark:text-white">Signatures Collected</h3>
                    {(() => {
                      const collected = loadedSignatures
                        .filter((s) => String(s?.signerRole ?? '').toLowerCase() === 'collected')
                        .slice()
                        .sort((a, b) => String(b?.signedAt ?? '').localeCompare(String(a?.signedAt ?? '')))
                      if (collected.length === 0) {
                        return <p className="text-sm text-neutral-500">No signatures collected yet.</p>
                      }
                      return (
                        <ul className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          {collected.map((sig, i) => (
                            <li key={`dha-collected-${i}-${sig.signedAt ?? ''}`} className="border border-neutral-200 dark:border-neutral-700 rounded-lg p-3 bg-white dark:bg-neutral-800 flex items-center gap-4">
                              {sig.imageData ? (
                                <img src={sig.imageData} alt={`Signature of ${sig.signerName ?? 'Worker'}`} className="h-12 border rounded bg-white" />
                              ) : (
                                <div className="h-12 w-24 border rounded bg-neutral-50 flex items-center justify-center text-xs text-neutral-400">No Signature</div>
                              )}
                              <div>
                                <p className="font-medium text-sm text-neutral-900 dark:text-white">{sig.signerName ?? 'Worker'}</p>
                                {sig.signedAt && <p className="text-xs text-neutral-500">{new Date(sig.signedAt).toLocaleString()}</p>}
                              </div>
                            </li>
                          ))}
                        </ul>
                      )
                    })()}
                    <div className="pt-4 border-t border-neutral-200 dark:border-neutral-700 flex flex-wrap items-end gap-3">
                      <div className="flex-1 min-w-[200px]">
                        <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">Select worker to sign</label>
                        <select
                          value={collectSigningWorkerId}
                          onChange={(e) => {
                            setCollectSignerType('worker')
                            setCollectSigningWorkerId(e.target.value)
                          }}
                          className="w-full min-h-[44px] px-4 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white"
                          aria-label="Select worker to sign"
                        >
                          <option value="">Select yourself or a worker...</option>
                          <option value={user?.id ?? ''}>{user?.name ?? 'Me'} (Me)</option>
                          {signerOptions
                            .filter((w: any) => w.id !== user?.id)
                            .map((w: any) => (
                              <option key={w.id} value={w.id}>{w.name}</option>
                            ))}
                        </select>
                      </div>
                      <Button
                        type="button"
                        onClick={() => {
                          if (!collectSigningWorkerId) return
                          setSigField({ id: '__collect_signatures__', label: 'Signature' })
                        }}
                        disabled={!collectSigningWorkerId || collectBusy}
                      >
                        Add Signature
                      </Button>
                    </div>
                    <div className="flex flex-wrap items-end gap-3">
                      <div className="flex-1 min-w-[220px]">
                        <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">Visitor name</label>
                        <input
                          value={collectVisitorName}
                          onChange={(e) => {
                            setCollectSignerType('visitor')
                            setCollectVisitorName(e.target.value)
                          }}
                          className="w-full min-h-[44px] px-4 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white text-sm"
                          placeholder="Enter visitor name..."
                        />
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => {
                          if (!collectVisitorName.trim()) return
                          setCollectSignerType('visitor')
                          setSigField({ id: '__collect_signatures__', label: `Visitor: ${collectVisitorName.trim()}` })
                        }}
                        disabled={!collectVisitorName.trim() || collectBusy}
                      >
                        Add Visitor Signature
                      </Button>
                    </div>
                  </div>
                </Card>
              </>
            )
          })()}
          {!isDailyHazardTemplate && visibleSections.map((section) => (
            <div key={section.key} className="space-y-4">
              {isHotWorkPermitTemplate && section.key === 'signatures' && (
                <Card padding="lg">
                  <CardHeader className="mb-1">Section — Additional Comments</CardHeader>
                  <label className="block rounded-lg border border-neutral-200 dark:border-neutral-700 p-3 bg-white dark:bg-neutral-900/20">
                    <span className="block text-sm text-neutral-700 dark:text-neutral-200 mb-1">
                      Additional comments
                    </span>
                    <textarea
                      value={values[HOT_WORK_ADDITIONAL_COMMENTS_FIELD_ID] ?? ''}
                      onChange={(e) => handleValueChange(HOT_WORK_ADDITIONAL_COMMENTS_FIELD_ID, e.target.value)}
                      rows={4}
                      placeholder="Add any extra notes before signing..."
                      className="w-full min-h-[110px] px-3 py-2 rounded-lg border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 text-sm resize-y"
                    />
                  </label>
                </Card>
              )}
            <Card
              padding="lg"
              className={`space-y-3 ${section.key === 'toolbox_approvals' || section.key === 'weekly_management' || section.key === 'signatures'
                  ? 'border-brand-500/50 bg-brand-50/20 dark:bg-brand-900/10'
                  : ''
                }`}
            >
              <CardHeader className="mb-1">{section.title}</CardHeader>
              <div className="space-y-3">
                {(() => {
                  const sectionTitle = String(section.title ?? '').toLowerCase()
                  return sectionTitle.includes('equipment/machine') && sectionTitle.includes('energy type')
                })() ? (
                  <div className="overflow-x-auto rounded-lg border border-neutral-200 dark:border-neutral-700">
                    <table className="w-full min-w-[720px] border-collapse">
                      <thead className="bg-neutral-100 dark:bg-neutral-800">
                        <tr>
                          <th className="px-3 py-2 text-left text-xs font-semibold border border-neutral-200 dark:border-neutral-700 w-[8%]">#</th>
                          <th className="px-3 py-2 text-left text-xs font-semibold border border-neutral-200 dark:border-neutral-700">Equipment / machine</th>
                          <th className="px-3 py-2 text-left text-xs font-semibold border border-neutral-200 dark:border-neutral-700">Location</th>
                          <th className="px-3 py-2 text-left text-xs font-semibold border border-neutral-200 dark:border-neutral-700">Energy Type(s)</th>
                          <th className="px-3 py-2 text-left text-xs font-semibold border border-neutral-200 dark:border-neutral-700">Lock Removed (Initial)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {section.fields
                          .filter((field) => {
                            const rowNum = parseLotoRowNumber(field.label)
                            return rowNum != null && rowNum <= 6
                          })
                          .map((field, idx) => {
                          const row = parseLotoRowValue(values[field.id] ?? '')
                          const slotLabel = String(field.label ?? `${idx + 1})`).match(/\d+/)?.[0] ?? String(idx + 1)
                          const updateRow = (patch: Partial<typeof row>) =>
                            handleValueChange(field.id, formatLotoRowValue({ ...row, ...patch }))
                          return (
                            <tr key={field.id}>
                              <td className="px-3 py-2 text-sm border border-neutral-200 dark:border-neutral-700 text-neutral-700 dark:text-neutral-300">{slotLabel}.</td>
                              <td className="p-1.5 border border-neutral-200 dark:border-neutral-700">
                                <input
                                  type="text"
                                  value={row.equipment}
                                  onChange={(e) => updateRow({ equipment: e.target.value })}
                                  className="w-full min-h-[38px] px-2 rounded border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 text-sm"
                                  aria-label={`Equipment row ${slotLabel}`}
                                />
                              </td>
                              <td className="p-1.5 border border-neutral-200 dark:border-neutral-700">
                                <input
                                  type="text"
                                  value={row.location}
                                  onChange={(e) => updateRow({ location: e.target.value })}
                                  className="w-full min-h-[38px] px-2 rounded border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 text-sm"
                                  aria-label={`Location row ${slotLabel}`}
                                />
                              </td>
                              <td className="p-1.5 border border-neutral-200 dark:border-neutral-700">
                                <input
                                  type="text"
                                  value={row.energyType}
                                  onChange={(e) => updateRow({ energyType: e.target.value })}
                                  className="w-full min-h-[38px] px-2 rounded border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 text-sm"
                                  aria-label={`Energy type row ${slotLabel}`}
                                />
                              </td>
                              <td className="p-1.5 border border-neutral-200 dark:border-neutral-700">
                                <input
                                  type="text"
                                  value={row.lockRemoved}
                                  onChange={(e) => updateRow({ lockRemoved: e.target.value })}
                                  className="w-full min-h-[38px] px-2 rounded border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 text-sm"
                                  aria-label={`Lock removed row ${slotLabel}`}
                                />
                              </td>
                            </tr>
                          )
                          })}
                      </tbody>
                    </table>
                  </div>
                ) : section.key === 'notice_transmittal_items' ? (
                  (() => {
                    const rows = Array.from({ length: 5 }, (_, idx) => idx + 1).map((rowNum) => {
                      const quantityField = section.fields.find((f) => {
                        const cell = parseNoticeOfTransmittalCell(parseCustomFieldSpec(f.label)?.label ?? f.label)
                        return cell?.row === rowNum && cell.column === 'quantity'
                      })
                      const itemNumberField = section.fields.find((f) => {
                        const cell = parseNoticeOfTransmittalCell(parseCustomFieldSpec(f.label)?.label ?? f.label)
                        return cell?.row === rowNum && cell.column === 'itemNumber'
                      })
                      const descriptionField = section.fields.find((f) => {
                        const cell = parseNoticeOfTransmittalCell(parseCustomFieldSpec(f.label)?.label ?? f.label)
                        return cell?.row === rowNum && cell.column === 'description'
                      })
                      return { rowNum, quantityField, itemNumberField, descriptionField }
                    })
                    return (
                      <div className="overflow-x-auto rounded-lg border border-neutral-200 dark:border-neutral-700">
                        <table className="w-full min-w-[760px] border-collapse">
                          <thead className="bg-neutral-100 dark:bg-neutral-800">
                            <tr>
                              <th className="px-3 py-2 text-left text-xs font-semibold border border-neutral-200 dark:border-neutral-700 w-[15%]">Quantity</th>
                              <th className="px-3 py-2 text-left text-xs font-semibold border border-neutral-200 dark:border-neutral-700 w-[25%]">Item Number</th>
                              <th className="px-3 py-2 text-left text-xs font-semibold border border-neutral-200 dark:border-neutral-700">Description</th>
                            </tr>
                          </thead>
                          <tbody>
                            {rows.map((row) => (
                              <tr key={`notice-transmittal-row-${row.rowNum}`}>
                                <td className="p-1.5 border border-neutral-200 dark:border-neutral-700">
                                  <input
                                    type="text"
                                    value={row.quantityField ? (values[row.quantityField.id] ?? '') : ''}
                                    onChange={(e) => row.quantityField && handleValueChange(row.quantityField.id, e.target.value)}
                                    className="w-full min-h-[38px] px-2 rounded border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 text-sm"
                                    aria-label={`Quantity row ${row.rowNum}`}
                                    disabled={!row.quantityField}
                                  />
                                </td>
                                <td className="p-1.5 border border-neutral-200 dark:border-neutral-700">
                                  <input
                                    type="text"
                                    value={row.itemNumberField ? (values[row.itemNumberField.id] ?? '') : ''}
                                    onChange={(e) => row.itemNumberField && handleValueChange(row.itemNumberField.id, e.target.value)}
                                    className="w-full min-h-[38px] px-2 rounded border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 text-sm"
                                    aria-label={`Item number row ${row.rowNum}`}
                                    disabled={!row.itemNumberField}
                                  />
                                </td>
                                <td className="p-1.5 border border-neutral-200 dark:border-neutral-700">
                                  <input
                                    type="text"
                                    value={row.descriptionField ? (values[row.descriptionField.id] ?? '') : ''}
                                    onChange={(e) => row.descriptionField && handleValueChange(row.descriptionField.id, e.target.value)}
                                    className="w-full min-h-[38px] px-2 rounded border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 text-sm"
                                    aria-label={`Description row ${row.rowNum}`}
                                    disabled={!row.descriptionField}
                                  />
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )
                  })()
                ) : section.key === 'niche_water_softener_matrix' || section.key === 'def_matrix' || section.key.startsWith('interim2_pm_page_') ? (
                  (() => {
                    const matrixField = section.fields[0]
                    if (!matrixField) return null
                    const interim2PageNum = section.key.startsWith('interim2_pm_page_')
                      ? Number(section.key.replace('interim2_pm_page_', ''))
                      : null
                    const matrix = interim2PageNum != null && Number.isFinite(interim2PageNum)
                      ? parseInterim2PmMatrixState(values[matrixField.id], interim2PageNum)
                      : parseDynamicMatrixState(
                      values[matrixField.id],
                      section.key === 'def_matrix'
                        ? getTestingVerificationDefDefaultColumns(template.name ?? '')
                        : getNicheMatrixDefaultColumns(template.name ?? ''),
                      section.key === 'def_matrix'
                        ? getTestingVerificationDefDefaultRowLabels(template.name ?? '')
                        : getNicheMatrixDefaultRowLabels(template.name ?? '')
                    )

                    const updateMatrix = (next: DynamicMatrixState) => {
                      handleValueChange(matrixField.id, JSON.stringify(next))
                    }

                    const updateCell = (rowIdx: number, colIdx: number, cellValue: string) => {
                      const nextRows = matrix.rows.map((row, r) =>
                        r === rowIdx ? row.map((cell, c) => (c === colIdx ? cellValue : cell)) : row
                      )
                      updateMatrix({ columns: matrix.columns, rows: nextRows })
                    }

                    const updateColumnName = (colIdx: number, name: string) => {
                      const nextColumns = matrix.columns.map((col, idx) => (idx === colIdx ? name : col))
                      updateMatrix({ columns: nextColumns, rows: matrix.rows })
                    }

                    const addRow = () => {
                      const nextRows = [...matrix.rows, Array.from({ length: matrix.columns.length }, () => '')]
                      updateMatrix({ columns: matrix.columns, rows: nextRows })
                    }

                    const addColumn = () => {
                      const nextColumns = [...matrix.columns, `Column ${matrix.columns.length + 1}`]
                      const nextRows = matrix.rows.map((row) => [...row, ''])
                      updateMatrix({ columns: nextColumns, rows: nextRows })
                    }

                    const interim2DefaultRowCount =
                      interim2PageNum != null && Number.isFinite(interim2PageNum)
                        ? getInterim2PmDefaultRowCount(interim2PageNum)
                        : 0
                    const isInterim2ExtraRow = (rowIdx: number) =>
                      section.key.startsWith('interim2_pm_page_') && rowIdx >= interim2DefaultRowCount

                    const removeInterim2Row = (rowIdx: number) => {
                      if (!isInterim2ExtraRow(rowIdx)) return
                      const nextRows = matrix.rows.filter((_, idx) => idx !== rowIdx)
                      updateMatrix({ columns: matrix.columns, rows: nextRows })
                    }

                    return (
                      <div className="space-y-3">
                        <div className="flex flex-wrap gap-2">
                          <Button type="button" variant="outline" size="sm" onClick={addRow}>
                            Add Row
                          </Button>
                          {!section.key.startsWith('interim2_pm_page_') && (
                          <Button type="button" variant="outline" size="sm" onClick={addColumn}>
                            Add Column
                          </Button>
                          )}
                        </div>
                        <div className="overflow-x-auto rounded-lg border border-neutral-200 dark:border-neutral-700">
                          <table className="w-full min-w-[900px] border-collapse">
                            <thead className="bg-neutral-100 dark:bg-neutral-800">
                              <tr>
                                {matrix.columns.map((col, colIdx) => (
                                  (() => {
                                    const headerNorm = String(col ?? '').trim().toLowerCase()
                                    const isDefYesNoColumn = section.key === 'def_matrix' && (headerNorm === 'yes' || headerNorm === 'no')
                                    const isInterim2CommentsColumn =
                                      section.key.startsWith('interim2_pm_page_') && headerNorm === 'comments'
                                    const isInterim2Column = section.key.startsWith('interim2_pm_page_')
                                    const interim2HeaderClass =
                                      colIdx === 0
                                        ? 'min-w-[200px]'
                                        : colIdx === 1
                                          ? 'min-w-[90px]'
                                          : colIdx === 2
                                            ? 'min-w-[120px]'
                                            : isInterim2CommentsColumn
                                              ? 'min-w-[180px]'
                                              : 'min-w-[220px]'
                                    return (
                                  <th
                                    key={`niche-matrix-col-${colIdx}`}
                                    className={`p-1.5 border border-neutral-200 dark:border-neutral-700 align-top ${
                                      isInterim2Column
                                        ? interim2HeaderClass
                                        : colIdx === 0
                                          ? 'w-[220px] min-w-[220px]'
                                          : isDefYesNoColumn
                                            ? 'w-[68px] min-w-[68px]'
                                            : 'min-w-[180px]'
                                    }`}
                                  >
                                    {isInterim2Column ? (
                                      <div className="w-full px-2 py-1 text-xs leading-snug font-semibold text-left whitespace-normal">
                                        {col}
                                      </div>
                                    ) : (
                                    <textarea
                                      value={col}
                                      onChange={(e) => updateColumnName(colIdx, e.target.value)}
                                      rows={2}
                                      className="w-full min-h-[56px] px-2 py-1 rounded border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 text-xs font-semibold resize-y"
                                      aria-label={`Niche matrix column ${colIdx + 1} title`}
                                    />
                                    )}
                                  </th>
                                    )
                                  })()
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {matrix.rows.map((row, rowIdx) => {
                                const firstCellLabel = String(row[0] ?? '').trim()
                                const isPumpsSectionSeparatorRow =
                                  isNichePumpsTemplate && /^(hot water|chilled water)$/i.test(firstCellLabel)
                                const isDefSectionSeparatorRow =
                                  isTestingVerificationDefTemplate && (
                                    /(tag:)/i.test(firstCellLabel)
                                    || /^(repeat number of dispensers open:)/i.test(firstCellLabel)
                                    || /^(test\s+\d+:)/i.test(firstCellLabel)
                                    || /^(outgoing flow meter test:|incoming flow meter test:)/i.test(firstCellLabel)
                                    || /^(tank #\d+:)/i.test(firstCellLabel)
                                    || /^(level sensor:|4 float:|tank temperature sensor:)/i.test(firstCellLabel)
                                  )
                                const isSectionSeparatorRow = isPumpsSectionSeparatorRow || isDefSectionSeparatorRow
                                const alternatingRowBgClass =
                                  rowIdx % 2 === 0
                                    ? 'bg-white dark:bg-neutral-900'
                                    : 'bg-neutral-50 dark:bg-neutral-800/60'
                                return (
                                <tr key={`niche-matrix-row-${rowIdx}`}>
                                  {row.map((cell, colIdx) => (
                                    <td
                                      key={`niche-matrix-cell-${rowIdx}-${colIdx}`}
                                      className={`p-1.5 border border-neutral-200 dark:border-neutral-700 ${
                                        section.key.startsWith('interim2_pm_page_')
                                          ? colIdx === 0
                                            ? 'min-w-[200px]'
                                            : colIdx === 1
                                              ? 'min-w-[90px]'
                                              : colIdx === 2
                                                ? 'min-w-[120px]'
                                                : String(matrix.columns[colIdx] ?? '').trim().toLowerCase() === 'comments'
                                                  ? 'min-w-[180px]'
                                                  : 'min-w-[72px] w-[72px]'
                                          : colIdx === 0
                                            ? 'w-[320px] min-w-[320px]'
                                            : isTestingVerificationDefTemplate && /^(yes|no)$/i.test(String(matrix.columns[colIdx] ?? '').trim())
                                              ? 'w-[68px] min-w-[68px]'
                                              : 'min-w-[180px]'
                                      } ${isSectionSeparatorRow ? 'bg-neutral-100 dark:bg-neutral-900/40' : alternatingRowBgClass}`}
                                    >
                                      {isSectionSeparatorRow && colIdx > 0 ? (
                                        <div className="w-full min-h-[36px]" aria-hidden="true" />
                                      ) : colIdx === 0 ? (
                                        section.key.startsWith('interim2_pm_page_') ? (
                                          <div className="space-y-1">
                                            <textarea
                                              value={cell}
                                              onChange={(e) => updateCell(rowIdx, colIdx, e.target.value)}
                                              rows={2}
                                              readOnly={!isInterim2ExtraRow(rowIdx)}
                                              className={`w-full min-h-[56px] px-2 py-1 rounded border text-sm resize-y whitespace-pre-wrap ${
                                                isInterim2ExtraRow(rowIdx)
                                                  ? 'border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800'
                                                  : 'border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800/60'
                                              }`}
                                              aria-label={`Component row ${rowIdx + 1}`}
                                            />
                                            {isInterim2ExtraRow(rowIdx) && (
                                              <button
                                                type="button"
                                                onClick={() => removeInterim2Row(rowIdx)}
                                                className="text-xs text-red-600 dark:text-red-400 hover:underline"
                                              >
                                                Remove row
                                              </button>
                                            )}
                                          </div>
                                        ) : (
                                        <textarea
                                          value={cell}
                                          onChange={(e) => updateCell(rowIdx, colIdx, e.target.value)}
                                          rows={2}
                                          className={`w-full min-h-[56px] px-2 py-1 rounded border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 text-sm resize-y whitespace-pre-wrap ${isSectionSeparatorRow ? 'font-semibold tracking-wide' : ''}`}
                                          aria-label={
                                            isSectionSeparatorRow
                                              ? `Matrix section separator row ${rowIdx + 1}`
                                              : `Niche matrix row ${rowIdx + 1} equipment`
                                          }
                                          readOnly={isSectionSeparatorRow}
                                        />
                                        )
                                      ) : section.key.startsWith('interim2_pm_page_') && colIdx <= 2 ? (
                                        <textarea
                                          value={cell}
                                          readOnly={!isInterim2ExtraRow(rowIdx)}
                                          onChange={(e) => updateCell(rowIdx, colIdx, e.target.value)}
                                          rows={2}
                                          className={`w-full min-h-[56px] px-2 py-1 rounded border text-sm resize-y whitespace-pre-wrap ${
                                            isInterim2ExtraRow(rowIdx)
                                              ? 'border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800'
                                              : 'border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800/60'
                                          }`}
                                          aria-label={`PM checklist row ${rowIdx + 1} column ${colIdx + 1}`}
                                        />
                                      ) : (() => {
                                        const normalizedHeader = String(matrix.columns[colIdx] ?? '').trim().toLowerCase()
                                        const isDefYesNoColumn =
                                          isTestingVerificationDefTemplate && (normalizedHeader === 'yes' || normalizedHeader === 'no')
                                        const isDefDateColumn =
                                          isTestingVerificationDefTemplate && normalizedHeader === 'date'
                                        const isInterim2CommentsColumn =
                                          section.key.startsWith('interim2_pm_page_') && normalizedHeader === 'comments'
                                        const isInterim2TaskCheckboxColumn =
                                          section.key.startsWith('interim2_pm_page_')
                                          && colIdx > 2
                                          && !isInterim2CommentsColumn
                                        if (isInterim2CommentsColumn) {
                                          return (
                                            <textarea
                                              value={cell}
                                              onChange={(e) => updateCell(rowIdx, colIdx, e.target.value)}
                                              rows={2}
                                              className="w-full min-h-[56px] px-2 py-1 rounded border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 text-sm resize-y"
                                              aria-label={`Comments for row ${rowIdx + 1}`}
                                            />
                                          )
                                        }
                                        if (isInterim2TaskCheckboxColumn) {
                                          const isChecked = /^(1|true|yes|y|x|checked)$/i.test(String(cell ?? '').trim())
                                          return (
                                            <div className="flex items-center justify-center min-h-[36px]">
                                              <input
                                                type="checkbox"
                                                checked={isChecked}
                                                onChange={(e) => updateCell(rowIdx, colIdx, e.target.checked ? '1' : '')}
                                                aria-label={`PM checklist task ${colIdx + 1} row ${rowIdx + 1}`}
                                                className="h-4 w-4"
                                              />
                                            </div>
                                          )
                                        }
                                        if (isDefYesNoColumn) {
                                          const isChecked = /^(1|true|yes|y|x|checked)$/i.test(String(cell ?? '').trim())
                                          return (
                                            <div className="flex items-center justify-center min-h-[36px]">
                                              <input
                                                type="checkbox"
                                                checked={isChecked}
                                                onChange={(e) => updateCell(rowIdx, colIdx, e.target.checked ? '1' : '')}
                                                aria-label={`DEF ${normalizedHeader} check for row ${rowIdx + 1}`}
                                                disabled={isSectionSeparatorRow}
                                                className="h-4 w-4"
                                              />
                                            </div>
                                          )
                                        }
                                        if (isDefDateColumn) {
                                          return (
                                            <input
                                              type="date"
                                              value={String(cell ?? '')}
                                              onChange={(e) => updateCell(rowIdx, colIdx, e.target.value)}
                                              className={`w-full min-h-[36px] px-2 rounded border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 text-sm ${isSectionSeparatorRow ? 'opacity-60 cursor-not-allowed' : ''}`}
                                              aria-label={`DEF date for row ${rowIdx + 1}`}
                                              disabled={isSectionSeparatorRow}
                                            />
                                          )
                                        }
                                        return (
                                        <input
                                          type="text"
                                          value={cell}
                                          onChange={(e) => updateCell(rowIdx, colIdx, e.target.value)}
                                          className={`w-full min-h-[36px] px-2 rounded border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 text-sm ${isSectionSeparatorRow ? 'opacity-60 cursor-not-allowed' : ''}`}
                                          aria-label={`Niche matrix row ${rowIdx + 1} column ${colIdx + 1}`}
                                          disabled={isSectionSeparatorRow}
                                        />
                                        )
                                      })()}
                                    </td>
                                  ))}
                                </tr>
                              )})}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )
                  })()
                ) : section.key === 'work_log_details' ? (
                  (() => {
                    const locationField = section.fields.find((f) => parseJobDropdownMarker(parseCustomFieldSpec(f.label)?.label ?? f.label))
                    const siteLocationField = section.fields.find(
                      (f) =>
                        String(parseCustomFieldSpec(f.label)?.label ?? f.label ?? '')
                          .trim()
                          .toLowerCase() === 'site location'
                    )
                    const workDescriptionField = section.fields.find(
                      (f) =>
                        String(parseCustomFieldSpec(f.label)?.label ?? f.label ?? '')
                          .trim()
                          .toLowerCase() === 'work description'
                    )
                    const inputCls = 'w-full min-h-[40px] px-3 rounded-lg border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 text-sm'
                    return (
                      <div className="space-y-3">
                        {locationField && (
                          <label className="block">
                            <span className="block text-sm text-neutral-700 dark:text-neutral-200 mb-1">Location</span>
                            <select
                              value={values[locationField.id] ?? ''}
                              onChange={(e) => handleValueChange(locationField.id, e.target.value)}
                              className={inputCls}
                              aria-label="Work log location"
                            >
                              <option value="">Select active site...</option>
                              {jobOptions.map((job) => (
                                <option key={job.id} value={job.label}>
                                  {job.label}
                                </option>
                              ))}
                            </select>
                          </label>
                        )}
                        {siteLocationField && (
                          <label className="block">
                            <span className="block text-sm text-neutral-700 dark:text-neutral-200 mb-1">Site Location</span>
                            <input
                              type="text"
                              value={values[siteLocationField.id] ?? ''}
                              onChange={(e) => handleValueChange(siteLocationField.id, e.target.value)}
                              className={inputCls}
                              aria-label="Work log site location"
                            />
                          </label>
                        )}
                        {workDescriptionField && (
                          <label className="block">
                            <span className="block text-sm text-neutral-700 dark:text-neutral-200 mb-1">Work Description</span>
                            <textarea
                              value={values[workDescriptionField.id] ?? ''}
                              onChange={(e) => handleValueChange(workDescriptionField.id, e.target.value)}
                              rows={5}
                              className="w-full min-h-[120px] px-3 py-2 rounded-lg border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 text-sm resize-y"
                              aria-label="Work description"
                            />
                          </label>
                        )}
                      </div>
                    )
                  })()
                ) : section.key === 'work_log_table' ? (
                  (() => {
                    const colLabel: Record<'trade' | 'date' | 'startTime' | 'endTime' | 'regularHours' | 'overtimeHours' | 'numberOfGuys' | 'totalHours', string> = {
                      trade: 'Trade',
                      date: 'Date',
                      startTime: 'Start Time',
                      endTime: 'End Time',
                      regularHours: 'Regular Hours',
                      overtimeHours: 'Overtime Hours',
                      numberOfGuys: 'Number Of Guys',
                      totalHours: 'Total Hours',
                    }
                    const columns: Array<keyof typeof colLabel> = ['trade', 'date', 'startTime', 'endTime', 'regularHours', 'overtimeHours', 'numberOfGuys', 'totalHours']
                    const rows = Array.from({ length: 6 }, (_, idx) => idx + 1).map((rowNum) => {
                      const byCol = columns.reduce((acc, col) => {
                        const field = section.fields.find((f) => {
                          const cell = parseWorkLogTableCell(parseCustomFieldSpec(f.label)?.label ?? f.label)
                          return cell?.row === rowNum && cell.column === col
                        })
                        acc[col] = field
                        return acc
                      }, {} as Record<keyof typeof colLabel, typeof section.fields[number] | undefined>)
                      return { rowNum, byCol }
                    })
                    const totalsByCol = columns.reduce((acc, col) => {
                      const target = `totals ${colLabel[col].toLowerCase()}`
                      acc[col] = section.fields.find((f) => String(parseCustomFieldSpec(f.label)?.label ?? f.label ?? '').trim().toLowerCase() === target)
                      return acc
                    }, {} as Record<keyof typeof colLabel, typeof section.fields[number] | undefined>)

                    return (
                      <div className="overflow-x-auto rounded-lg border border-neutral-200 dark:border-neutral-700">
                        <table className="w-full min-w-[1100px] border-collapse">
                          <thead className="bg-neutral-100 dark:bg-neutral-800">
                            <tr>
                              {columns.map((col) => (
                                <th key={`work-log-col-${col}`} className="px-3 py-2 text-left text-xs font-semibold border border-neutral-200 dark:border-neutral-700">
                                  {colLabel[col]}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {rows.map((row) => (
                              <tr key={`work-log-row-${row.rowNum}`}>
                                {columns.map((col) => {
                                  const field = row.byCol[col]
                                  return (
                                    <td key={`work-log-row-${row.rowNum}-${col}`} className="p-1.5 border border-neutral-200 dark:border-neutral-700">
                                      <input
                                        type={col === 'date' ? 'date' : 'text'}
                                        value={field ? (values[field.id] ?? '') : ''}
                                        onChange={(e) => field && handleValueChange(field.id, e.target.value)}
                                        className="w-full min-h-[38px] px-2 rounded border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 text-sm"
                                        aria-label={`${colLabel[col]} row ${row.rowNum}`}
                                        disabled={!field}
                                      />
                                    </td>
                                  )
                                })}
                              </tr>
                            ))}
                            <tr>
                              {columns.map((col) => {
                                const field = totalsByCol[col]
                                return (
                                  <td key={`work-log-total-${col}`} className="p-1.5 border border-neutral-200 dark:border-neutral-700">
                                    <input
                                      type={col === 'date' ? 'date' : 'text'}
                                      value={field ? (values[field.id] ?? '') : ''}
                                      onChange={(e) => field && handleValueChange(field.id, e.target.value)}
                                      className="w-full min-h-[38px] px-2 rounded border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 text-sm font-medium"
                                      aria-label={`${colLabel[col]} totals`}
                                      disabled={!field}
                                      placeholder={col === 'trade' ? 'Totals' : ''}
                                    />
                                  </td>
                                )
                              })}
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    )
                  })()
                ) : section.key === 'work_log_signatures' ? (
                  (() => {
                    const fieldByLabel = (label: string) =>
                      section.fields.find(
                        (f) =>
                          String(parseCustomFieldSpec(f.label)?.label ?? f.label ?? '')
                            .trim()
                            .toLowerCase() === label
                      )
                    const buttconCompanyField = fieldByLabel('buttcon company name')
                    const buttconSupervisorNameField = fieldByLabel('buttcon supervisor name')
                    const buttconSupervisorSignatureField = fieldByLabel('buttcon supervisor signature')
                    const buttconDateField = fieldByLabel('buttcon date')
                    const maximSupervisorNameField = fieldByLabel('maxim supervisor name')
                    const maximSupervisorSignatureField = fieldByLabel('maxim supervisor signature')
                    const maximDateField = fieldByLabel('maxim date')

                    const labelCls = 'block text-sm text-neutral-700 dark:text-neutral-200 mb-1'
                    const inputCls = 'w-full min-h-[40px] px-3 rounded-lg border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 text-sm'

                    return (
                      <div className="space-y-5">
                        <Card padding="md" className="space-y-3">
                          <CardHeader className="mb-0">Hiring Company</CardHeader>
                          {buttconCompanyField && (
                            <label className="block">
                              <span className={labelCls}>Company Name</span>
                              <input type="text" value={values[buttconCompanyField.id] ?? ''} onChange={(e) => handleValueChange(buttconCompanyField.id, e.target.value)} className={inputCls} />
                            </label>
                          )}
                          {buttconSupervisorNameField && (
                            <label className="block">
                              <span className={labelCls}>Supervisor Name</span>
                              <input type="text" value={values[buttconSupervisorNameField.id] ?? ''} onChange={(e) => handleValueChange(buttconSupervisorNameField.id, e.target.value)} className={inputCls} />
                            </label>
                          )}
                          {buttconSupervisorSignatureField && (
                            <div className="rounded-lg border border-neutral-200 dark:border-neutral-700 p-3">
                              <p className="text-sm text-neutral-700 dark:text-neutral-200 mb-2">Supervisor Signature</p>
                              <button
                                type="button"
                                className="w-full min-h-[52px] border border-dashed border-neutral-300 dark:border-neutral-600 rounded-lg flex items-center justify-center hover:bg-neutral-50 dark:hover:bg-neutral-800"
                                onClick={() => setSigField({ id: buttconSupervisorSignatureField.id, label: 'Buttcon Supervisor Signature' })}
                              >
                                {values[buttconSupervisorSignatureField.id] ? <img src={String(values[buttconSupervisorSignatureField.id])} alt="Buttcon supervisor signature" className="max-h-12 object-contain" /> : <span className="text-sm text-neutral-500">Tap to sign</span>}
                              </button>
                            </div>
                          )}
                          {buttconDateField && (
                            <label className="block">
                              <span className={labelCls}>Date</span>
                              <input type="date" value={values[buttconDateField.id] ?? ''} onChange={(e) => handleValueChange(buttconDateField.id, e.target.value)} className={inputCls} />
                            </label>
                          )}
                        </Card>

                        <Card padding="md" className="space-y-3">
                          <CardHeader className="mb-0">Maxim</CardHeader>
                          {maximSupervisorNameField && (
                            <label className="block">
                              <span className={labelCls}>Supervisor Name</span>
                              <input type="text" value={values[maximSupervisorNameField.id] ?? ''} onChange={(e) => handleValueChange(maximSupervisorNameField.id, e.target.value)} className={inputCls} />
                            </label>
                          )}
                          {maximSupervisorSignatureField && (
                            <div className="rounded-lg border border-neutral-200 dark:border-neutral-700 p-3">
                              <p className="text-sm text-neutral-700 dark:text-neutral-200 mb-2">Supervisor Signature</p>
                              <button
                                type="button"
                                className="w-full min-h-[52px] border border-dashed border-neutral-300 dark:border-neutral-600 rounded-lg flex items-center justify-center hover:bg-neutral-50 dark:hover:bg-neutral-800"
                                onClick={() => setSigField({ id: maximSupervisorSignatureField.id, label: 'Maxim Supervisor Signature' })}
                              >
                                {values[maximSupervisorSignatureField.id] ? <img src={String(values[maximSupervisorSignatureField.id])} alt="Maxim supervisor signature" className="max-h-12 object-contain" /> : <span className="text-sm text-neutral-500">Tap to sign</span>}
                              </button>
                            </div>
                          )}
                          {maximDateField && (
                            <label className="block">
                              <span className={labelCls}>Date</span>
                              <input type="date" value={values[maximDateField.id] ?? ''} onChange={(e) => handleValueChange(maximDateField.id, e.target.value)} className={inputCls} />
                            </label>
                          )}
                        </Card>
                      </div>
                    )
                  })()
                ) : section.key === 'toolbox_topic' ? (
                  <div className="space-y-4">
                    <div className="rounded-lg border border-neutral-200 dark:border-neutral-700 p-3 bg-white dark:bg-neutral-900/20">
                      <p className="text-sm font-medium text-neutral-900 dark:text-neutral-100 mb-2">Quick Topic Autofill (IHSA)</p>
                      <div className="grid grid-cols-1 gap-2 md:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
                        <input
                          type="text"
                          value={toolboxTopicSearch}
                          onChange={(e) => setToolboxTopicSearch(e.target.value)}
                          placeholder="Search toolbox topics..."
                          className="w-full min-h-[40px] px-3 rounded-lg border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 text-sm"
                          aria-label="Search toolbox topics"
                        />
                        <select
                          value={selectedToolboxTopicId}
                          onChange={(e) => void handleToolboxTopicSelect(e.target.value)}
                          className="w-full min-h-[40px] px-3 rounded-lg border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 text-sm"
                          aria-label="Select toolbox topic"
                          disabled={toolboxTopicsLoading || toolboxTopicAttachBusy}
                        >
                          <option value="">Select a topic...</option>
                          {toolboxTopics.map((topic) => (
                            <option key={topic.id} value={topic.id}>
                              {topic.topicTitle}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="mt-2 text-xs text-neutral-600 dark:text-neutral-400 space-y-1">
                        {toolboxTopicsLoading && <p>Loading topics...</p>}
                        {!toolboxTopicsLoading && toolboxTopics.length > 0 && (
                          <p>{toolboxTopics.length} topics available in this view.</p>
                        )}
                        {toolboxTopicAttachBusy && <p>Attaching source PDF to this form...</p>}
                        {toolboxTopicsError && <p className="text-red-600 dark:text-red-400">{toolboxTopicsError}</p>}
                        {selectedToolboxTopic && (
                          <p>
                            Source: <a href={selectedToolboxTopic.sourcePdfUrl} target="_blank" rel="noreferrer" className="underline">{selectedToolboxTopic.sourcePdfUrl}</a>
                          </p>
                        )}
                      </div>
                    </div>
                    {section.fields.map((field) => {
                      const dropdown = parseCustomFieldSpec(field.label)
                      const jobDropdown = parseJobDropdownMarker(field.label)
                      const resolvedLabel = jobDropdown?.label ?? dropdown?.label ?? field.label ?? 'Field'
                      const value = values[field.id] ?? ''
                      if (fieldTypeNorm(field.type) === 'CHECKBOX') {
                        if (isStandardsChecklistTemplate) {
                          const currentChoice = normalizeChecklistChoice(value)
                          const triOpts = isHotWorkPermitTemplate
                            ? ([
                                { key: 'yes' as const, label: 'Yes' },
                                { key: 'no' as const, label: 'No' },
                                { key: 'na' as const, label: 'N/A' },
                              ] as const)
                            : ([
                                { key: 'standard' as const, label: 'Standard' },
                                { key: 'substandard' as const, label: 'Substandard' },
                                { key: 'na' as const, label: 'N/A (Missing)' },
                              ] as const)
                          return (
                            <div key={field.id} className="rounded-lg border border-neutral-200 dark:border-neutral-700 p-3">
                              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                                <span className="text-sm text-neutral-800 dark:text-neutral-200">
                                  {resolvedLabel}
                                  {field.required ? ' *' : ''}
                                </span>
                                <div className="flex items-center gap-3 text-xs text-neutral-600 dark:text-neutral-300">
                                  {!isHotWorkPermitTemplate && (
                                    <span className="font-medium">Does it Meet Standards?</span>
                                  )}
                                  {triOpts.map((opt) => (
                                    <label key={opt.key} className="inline-flex items-center gap-1.5 whitespace-nowrap">
                                      <input
                                        type="checkbox"
                                        checked={currentChoice === opt.key}
                                        onChange={() => handleChecklistChoiceChange(field.id, opt.key)}
                                        className="w-4 h-4 rounded border-neutral-300 text-brand-600"
                                      />
                                      <span>{opt.label}</span>
                                    </label>
                                  ))}
                                </div>
                              </div>
                            </div>
                          )
                        }
                        return (
                          <label key={field.id} className="flex items-center gap-3 rounded-lg border border-neutral-200 dark:border-neutral-700 p-3">
                            <input
                              type="checkbox"
                              checked={value === 'true'}
                              onChange={(e) => handleValueChange(field.id, e.target.checked ? 'true' : 'false')}
                              className="w-4 h-4 rounded border-neutral-300 text-brand-600"
                            />
                            <span className="text-sm text-neutral-800 dark:text-neutral-200">
                              {resolvedLabel}
                              {field.required ? ' *' : ''}
                            </span>
                          </label>
                        )
                      }
                      const dropdownOptions =
                        dropdown
                          ? filterDropdownOptionsForTemplate(template.name ?? '', resolvedLabel, dropdown.options)
                          : []
                      if (dropdown && dropdownOptions.length > 0) {
                        return (
                          <label key={field.id} className="block">
                            <span className="block text-sm text-neutral-700 dark:text-neutral-200 mb-1">
                              {resolvedLabel}
                              {field.required ? ' *' : ''}
                            </span>
                            <select
                              value={value}
                              onChange={(e) => handleValueChange(field.id, e.target.value)}
                              className="w-full min-h-[40px] px-3 rounded-lg border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 text-sm"
                            >
                              <option value="">Select...</option>
                              {dropdownOptions.map((option) => (
                                <option key={option} value={option}>
                                  {option}
                                </option>
                              ))}
                            </select>
                          </label>
                        )
                      }
                      const inputType =
                        fieldTypeNorm(field.type) === 'NUMBER'
                          ? 'number'
                          : fieldTypeNorm(field.type) === 'DATE'
                            ? (isDateTimeLabel(resolvedLabel) ? 'datetime-local' : 'date')
                            : (isDateTimeLabel(resolvedLabel) ? 'datetime-local' : 'text')
                      const wantsMultiline =
                        fieldTypeNorm(field.type) === 'TEXT' &&
                        (String(field.label ?? '').toLowerCase().includes('control measures') ||
                          String(field.label ?? '').toLowerCase().includes('safety tips') ||
                          String(field.label ?? '').toLowerCase().includes('notes from workers') ||
                          String(field.label ?? '').length > 60)
                      return (
                        <label key={field.id} className="block">
                          <span className="block text-sm text-neutral-700 dark:text-neutral-200 mb-1">
                            {resolvedLabel}
                            {field.required ? ' *' : ''}
                          </span>
                          {wantsMultiline ? (
                            <textarea
                              value={value}
                              onChange={(e) => handleValueChange(field.id, e.target.value)}
                              rows={5}
                              className="w-full min-h-[120px] px-3 py-2 rounded-lg border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 text-sm resize-y"
                            />
                          ) : (
                            <input
                              type={inputType}
                              value={value}
                              onChange={(e) => handleValueChange(field.id, e.target.value)}
                              className="w-full min-h-[40px] px-3 rounded-lg border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 text-sm"
                            />
                          )}
                        </label>
                      )
                    })}
                  </div>
                ) : section.key === 'toolbox_attendees' ? (
                  (() => {
                    const signatureFields = section.fields
                      .filter((f) => (f.type || '').toUpperCase() === 'SIGNATURE')
                      .sort((a, b) => (getAttendeeSlot(a.label)?.num ?? 0) - (getAttendeeSlot(b.label)?.num ?? 0))

                    const signatureRows = signatureFields
                      .map((sigFieldItem) => {
                        const slot = getAttendeeSlot(sigFieldItem.label)
                        const nameField = (template.fields ?? []).find((f) => {
                          const s = getAttendeeSlot(f.label)
                          return s && slot && s.num === slot.num && s.kind === 'name'
                        })
                        const sigValue = values[sigFieldItem.id]
                        const attendeeName = nameField?.id ? values[nameField.id] : ''
                        if (!sigValue) return null
                        const sigInfo = loadedSignatures.find(s => s.fieldId === sigFieldItem.id)
                        return {
                          id: sigFieldItem.id,
                          signature: sigValue,
                          name: attendeeName || `Attendee ${slot?.num ?? ''}`.trim(),
                          signedAt: sigInfo?.signedAt,
                        }
                      })
                      .filter(Boolean) as Array<{ id: string; signature: string; name: string; signedAt?: string }>

                    const nextSigField = findNextToolboxSignatureField(section.fields)

                    return (
                      <>
                        <h3 className="font-medium text-neutral-900 dark:text-white">Signatures Collected</h3>
                        {signatureRows.length === 0 ? (
                          <p className="text-sm text-neutral-500">No signatures collected yet.</p>
                        ) : (
                          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            {signatureRows.map((row) => (
                              <li key={row.id} className="border border-neutral-200 dark:border-neutral-700 rounded-lg p-3 bg-white dark:bg-neutral-800 flex items-center gap-4">
                                <img src={row.signature} alt={`Signature of ${row.name}`} className="h-12 border rounded bg-white" />
                                <div>
                                  <p className="font-medium text-sm text-neutral-900 dark:text-white">{row.name}</p>
                                  {row.signedAt && (
                                    <p className="text-xs text-neutral-500 mt-1">
                                      {new Date(row.signedAt).toLocaleString()}
                                    </p>
                                  )}
                                </div>
                              </li>
                            ))}
                          </ul>
                        )}

                        <div className="pt-4 border-t border-neutral-200 dark:border-neutral-700 space-y-3">
                          <div className="flex flex-wrap items-end gap-3">
                            <div className="flex-1 min-w-[200px]">
                              <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">Select worker to sign</label>
                              <select
                                value={toolboxSigningWorkerId}
                                onChange={(e) => {
                                  setToolboxSigningWorkerId(e.target.value)
                                  if (e.target.value) setToolboxVisitorName('')
                                }}
                                className="w-full min-h-[44px] px-4 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white"
                                aria-label="Select worker to sign"
                              >
                                <option value="">Select yourself or a worker...</option>
                                <option value={user?.id ?? ''}>{user?.name ?? 'Me'} (Me)</option>
                                {toolboxSigningOptions
                                  .filter((w: any) => w.id !== user?.id)
                                  .map((w: any) => (
                                    <option key={w.id} value={w.id}>{w.name}</option>
                                  ))}
                              </select>
                            </div>
                            <Button
                              type="button"
                              onClick={() => {
                                if (!nextSigField || !toolboxSigningWorkerId) return
                                setSigField({ id: nextSigField.id, label: nextSigField.label })
                              }}
                              disabled={!toolboxSigningWorkerId || !nextSigField}
                            >
                              Add Signature
                            </Button>
                          </div>
                          <div className="flex flex-wrap items-end gap-3">
                            <div className="flex-1 min-w-[220px]">
                              <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">Visitor name</label>
                              <input
                                value={toolboxVisitorName}
                                onChange={(e) => {
                                  setToolboxVisitorName(e.target.value)
                                  if (e.target.value.trim()) setToolboxSigningWorkerId('')
                                }}
                                className="w-full min-h-[44px] px-4 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white text-sm"
                                placeholder="Enter visitor name..."
                              />
                            </div>
                            <Button
                              type="button"
                              variant="outline"
                              onClick={() => {
                                if (!toolboxVisitorName.trim() || !nextSigField) return
                                setToolboxSigningWorkerId('')
                                setSigField({ id: nextSigField.id, label: nextSigField.label })
                              }}
                              disabled={!toolboxVisitorName.trim() || !nextSigField}
                            >
                              Add Visitor Signature
                            </Button>
                          </div>
                        </div>
                      </>
                    )
                  })()
                ) : section.key === 'weekly_checklist' ? (
                  (() => {
                    const checklistFields = section.fields
                      .filter((f) => fieldTypeNorm(f.type) === 'CHECKBOX' && !parseSectionMarker(f.label) && !isCollectSignaturesMarker(f.label))
                      .slice()
                      .sort((a, b) => (a.x ?? 0) - (b.x ?? 0) || (a.y ?? 0) - (b.y ?? 0))

                    if (checklistFields.length === 0) {
                      return (
                        <p className="text-sm text-neutral-500 dark:text-neutral-400">
                          No checklist items found.
                        </p>
                      )
                    }

                    const categoryTitles = [
                      'General Site Conditions / PPE',
                      'Materials / Chemicals / Storage',
                      'Equipment / Lifting Devices',
                      'Emergency / Response',
                      'Site Required Documents',
                      'Industrial And Posting',
                    ]

                    const rowOrderedFields = checklistFields
                      .slice()
                      .sort((a, b) => (a.y ?? 0) - (b.y ?? 0) || (a.x ?? 0) - (b.x ?? 0))

                    const explicitColumns = categoryTitles.map((title, colIdx) => ({
                      colIdx,
                      title,
                      fields: [] as typeof checklistFields,
                    }))
                    const unmatchedFields: typeof checklistFields = []

                    for (const field of rowOrderedFields) {
                      const resolvedLabel = parseCustomFieldSpec(field.label)?.label ?? field.label ?? ''
                      const mappedCategory = getWeeklyChecklistCategoryIndex(resolvedLabel)
                      if (mappedCategory == null) {
                        unmatchedFields.push(field)
                        continue
                      }
                      explicitColumns[mappedCategory].fields.push(field)
                    }

                    // Keep unmatched legacy labels visible and reasonably ordered by table rows.
                    for (let i = 0; i < unmatchedFields.length; i += 1) {
                      explicitColumns[i % categoryTitles.length].fields.push(unmatchedFields[i])
                    }

                    const orderedColumns = explicitColumns.filter((column) => column.fields.length > 0)

                    return (
                      <div className="space-y-4">
                        <p className="text-xs text-neutral-500 dark:text-neutral-400">
                          Checklist items are grouped by the original inspection table categories.
                        </p>
                        {orderedColumns.map((column) => (
                          <Card key={`weekly-col-${column.colIdx}`} padding="md" className="space-y-3">
                            <h3 className="font-semibold text-neutral-900 dark:text-white">{column.title}</h3>
                            <div className="space-y-2">
                              {column.fields.map((field) => {
                                const currentChoice = normalizeChecklistChoice(values[field.id] ?? '')
                                const resolvedLabel = parseCustomFieldSpec(field.label)?.label ?? field.label ?? 'Field'
                                return (
                                  <div key={field.id} className="rounded-lg border border-neutral-200 dark:border-neutral-700 p-3">
                                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                                      <span className="text-sm text-neutral-800 dark:text-neutral-200">
                                        {resolvedLabel}
                                        {field.required ? ' *' : ''}
                                      </span>
                                      <div className="flex items-center gap-3 text-xs text-neutral-600 dark:text-neutral-300">
                                        <span className="font-medium">Does it Meet Standards?</span>
                                        {[
                                          { key: 'standard' as const, label: 'Standard' },
                                          { key: 'substandard' as const, label: 'Substandard' },
                                          { key: 'na' as const, label: 'N/A (Missing)' },
                                        ].map((opt) => (
                                          <label key={opt.key} className="inline-flex items-center gap-1.5 whitespace-nowrap">
                                            <input
                                              type="checkbox"
                                              checked={currentChoice === opt.key}
                                              onChange={() => handleChecklistChoiceChange(field.id, opt.key)}
                                              className="w-4 h-4 rounded border-neutral-300 text-brand-600"
                                            />
                                            <span>{opt.label}</span>
                                          </label>
                                        ))}
                                      </div>
                                    </div>
                                  </div>
                                )
                              })}
                            </div>
                          </Card>
                        ))}
                      </div>
                    )
                  })()
                ) : section.key === 'weekly_management' ? (
                  (() => {
                    const collected = loadedSignatures
                      .filter((s) => String(s?.signerRole ?? '').toLowerCase() === 'collected')
                      .slice()
                      .sort((a, b) => String(b?.signedAt ?? '').localeCompare(String(a?.signedAt ?? '')))

                    const nonSignatureFields = section.fields.filter((f) => !isCollectSignaturesMarker(f.label))

                    return (
                      <div className="space-y-4">
                        {nonSignatureFields.map((field) => {
                          const dropdown = parseCustomFieldSpec(field.label)
                          const resolvedLabel = dropdown?.label ?? field.label ?? 'Field'
                          const value = values[field.id] ?? ''
                          if (fieldTypeNorm(field.type) === 'CHECKBOX') {
                            if (isStandardsChecklistTemplate) {
                              const currentChoice = normalizeChecklistChoice(value)
                              const triOpts = isHotWorkPermitTemplate
                                ? ([
                                    { key: 'yes' as const, label: 'Yes' },
                                    { key: 'no' as const, label: 'No' },
                                    { key: 'na' as const, label: 'N/A' },
                                  ] as const)
                                : ([
                                    { key: 'standard' as const, label: 'Standard' },
                                    { key: 'substandard' as const, label: 'Substandard' },
                                    { key: 'na' as const, label: 'N/A (Missing)' },
                                  ] as const)
                              return (
                                <div key={field.id} className="rounded-lg border border-neutral-200 dark:border-neutral-700 p-3">
                                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                                    <span className="text-sm text-neutral-800 dark:text-neutral-200">
                                      {resolvedLabel}
                                      {field.required ? ' *' : ''}
                                    </span>
                                    <div className="flex items-center gap-3 text-xs text-neutral-600 dark:text-neutral-300">
                                      {!isHotWorkPermitTemplate && (
                                        <span className="font-medium">Does it Meet Standards?</span>
                                      )}
                                      {triOpts.map((opt) => (
                                        <label key={opt.key} className="inline-flex items-center gap-1.5 whitespace-nowrap">
                                          <input
                                            type="checkbox"
                                            checked={currentChoice === opt.key}
                                            onChange={() => handleChecklistChoiceChange(field.id, opt.key)}
                                            className="w-4 h-4 rounded border-neutral-300 text-brand-600"
                                          />
                                          <span>{opt.label}</span>
                                        </label>
                                      ))}
                                    </div>
                                  </div>
                                </div>
                              )
                            }
                            return (
                              <label key={field.id} className="flex items-center gap-3 rounded-lg border border-neutral-200 dark:border-neutral-700 p-3">
                                <input
                                  type="checkbox"
                                  checked={value === 'true'}
                                  onChange={(e) => handleValueChange(field.id, e.target.checked ? 'true' : 'false')}
                                  className="w-4 h-4 rounded border-neutral-300 text-brand-600"
                                />
                                <span className="text-sm text-neutral-800 dark:text-neutral-200">
                                  {resolvedLabel}
                                  {field.required ? ' *' : ''}
                                </span>
                              </label>
                            )
                          }
                          const dropdownOptions =
                            dropdown
                              ? filterDropdownOptionsForTemplate(template.name ?? '', resolvedLabel, dropdown.options)
                              : []
                          if (dropdown && dropdownOptions.length > 0) {
                            return (
                              <label key={field.id} className="block">
                                <span className="block text-sm text-neutral-700 dark:text-neutral-200 mb-1">
                                  {resolvedLabel}
                                  {field.required ? ' *' : ''}
                                </span>
                                <select
                                  value={value}
                                  onChange={(e) => handleValueChange(field.id, e.target.value)}
                                  className="w-full min-h-[40px] px-3 rounded-lg border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 text-sm"
                                >
                                  <option value="">Select...</option>
                                  {dropdownOptions.map((option) => (
                                    <option key={option} value={option}>
                                      {option}
                                    </option>
                                  ))}
                                </select>
                              </label>
                            )
                          }
                          const inputType =
                            fieldTypeNorm(field.type) === 'NUMBER'
                              ? 'number'
                              : fieldTypeNorm(field.type) === 'DATE'
                                ? (isDateTimeLabel(resolvedLabel) ? 'datetime-local' : 'date')
                                : (isDateTimeLabel(resolvedLabel) ? 'datetime-local' : 'text')
                          return (
                            <label key={field.id} className="block">
                              <span className="block text-sm text-neutral-700 dark:text-neutral-200 mb-1">
                                {resolvedLabel}
                                {field.required ? ' *' : ''}
                              </span>
                              <input
                                type={inputType}
                                value={value}
                                onChange={(e) => handleValueChange(field.id, e.target.value)}
                                className="w-full min-h-[40px] px-3 rounded-lg border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 text-sm"
                              />
                            </label>
                          )
                        })}

                        <div className="rounded-lg border border-neutral-200 dark:border-neutral-700 p-4 bg-white dark:bg-neutral-900/20">
                          <h3 className="font-medium text-neutral-900 dark:text-white">Management Sign-Off Signatures</h3>
                          {collected.length === 0 ? (
                            <p className="text-sm text-neutral-500 mt-1">No signatures collected yet.</p>
                          ) : (
                            <ul className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-4">
                              {collected.map((row, i) => (
                                <li key={`${row.signedAt ?? 'sig'}-${i}`} className="border border-neutral-200 dark:border-neutral-700 rounded-lg p-3 bg-white dark:bg-neutral-800 flex items-center gap-4">
                                  {row.imageData ? (
                                    <img src={row.imageData} alt={`Signature of ${row.signerName ?? 'Worker'}`} className="h-12 border rounded bg-white object-contain min-w-[100px]" />
                                  ) : (
                                    <div className="h-12 w-24 border rounded bg-neutral-50 flex items-center justify-center text-xs text-neutral-400">No Signature</div>
                                  )}
                                  <div className="flex-1 min-w-0">
                                    <p className="font-medium text-sm text-neutral-900 dark:text-white">{row.signerName ?? 'Worker'}</p>
                                    {row.signedAt && (
                                      <p className="text-xs text-neutral-500 mt-1">{new Date(row.signedAt).toLocaleString()}</p>
                                    )}
                                  </div>
                                  <button
                                    type="button"
                                    className="shrink-0 text-xs px-3 py-1.5 rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 hover:bg-red-100 dark:hover:bg-red-900/40"
                                    onClick={() => handleDeleteCollectedSignature({ signedAt: row.signedAt, imageData: row.imageData })}
                                  >
                                    Remove
                                  </button>
                                </li>
                              ))}
                            </ul>
                          )}

                          <div className="pt-4 mt-4 border-t border-neutral-200 dark:border-neutral-700 flex flex-wrap items-end gap-3">
                            <div className="flex-1 min-w-[200px]">
                              <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">Select manager/supervisor to sign</label>
                              <select
                                value={collectSigningWorkerId}
                                onChange={(e) => {
                                  setCollectSignerType('worker')
                                  setCollectSigningWorkerId(e.target.value)
                                }}
                                className="w-full min-h-[44px] px-4 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white"
                                aria-label="Select manager/supervisor to sign"
                                disabled={collectBusy}
                              >
                                <option value="">Select yourself or a worker...</option>
                                <option value={user?.id ?? ''}>{user?.name ?? 'Me'} (Me)</option>
                                {toolboxSigningOptions
                                  .filter((w: any) => w.id !== user?.id)
                                  .map((w: any) => (
                                    <option key={w.id} value={w.id}>{w.name}</option>
                                  ))}
                              </select>
                            </div>
                            <Button
                              type="button"
                              onClick={() => {
                                if (!collectSigningWorkerId) return
                                setSigField({ id: '__collect_signatures__', label: 'Signature' })
                              }}
                              disabled={!collectSigningWorkerId || collectBusy}
                            >
                              {collectBusy ? 'Saving…' : 'Add Signature'}
                            </Button>
                          </div>
                          <div className="flex flex-wrap items-end gap-3">
                            <div className="flex-1 min-w-[220px]">
                              <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">Visitor name</label>
                              <input
                                value={collectVisitorName}
                                onChange={(e) => {
                                  setCollectSignerType('visitor')
                                  setCollectVisitorName(e.target.value)
                                }}
                                className="w-full min-h-[44px] px-4 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white text-sm"
                                placeholder="Enter visitor name..."
                                disabled={collectBusy}
                              />
                            </div>
                            <Button
                              type="button"
                              variant="outline"
                              onClick={() => {
                                if (!collectVisitorName.trim()) return
                                setCollectSignerType('visitor')
                                setSigField({ id: '__collect_signatures__', label: `Visitor: ${collectVisitorName.trim()}` })
                              }}
                              disabled={!collectVisitorName.trim() || collectBusy}
                            >
                              Add Visitor Signature
                            </Button>
                          </div>
                        </div>
                      </div>
                    )
                  })()
                ) : section.key === 'weekly_hazard_table' ? (
                  (() => {
                    type HazardRow = {
                      row: number
                      item?: any
                      hazards?: any
                      likelihood?: any
                      corrective?: any
                      repeat?: any
                      dateResolved?: any
                      comments?: any
                    }

                    const rowMap = new Map<number, HazardRow>()
                    for (const field of section.fields) {
                      const meta = parseWeeklyHazardFieldMeta(field)
                      if (!meta) continue
                      const current = rowMap.get(meta.row) ?? { row: meta.row }
                      current[meta.kind] = field
                      rowMap.set(meta.row, current)
                    }

                    const rows = Array.from(rowMap.values()).sort((a, b) => a.row - b.row)
                    const substandardCount = allCustomFields.filter(
                      (f) => fieldTypeNorm(f.type) === 'CHECKBOX' && normalizeChecklistChoice(values[f.id]) === 'substandard'
                    ).length
                    const filledRowCount = rows.filter((r) =>
                      [r.item, r.hazards, r.likelihood, r.corrective, r.repeat, r.dateResolved, r.comments]
                        .some((f) => f?.id && String(values[f.id] ?? '').trim())
                    ).length
                    const minVisibleRows = 5
                    const targetVisibleRows = Math.max(minVisibleRows, substandardCount, filledRowCount)
                    const visibleRows = rows.slice(0, targetVisibleRows)

                    return (
                      <div className="space-y-3">
                        <div className="text-xs text-neutral-500 dark:text-neutral-400">
                          Substandard selections automatically populate Item / Location below. Add details for each generated hazard column.
                        </div>
                        <div className="rounded-lg border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-900/30 px-3 py-2 text-xs text-neutral-600 dark:text-neutral-300 space-y-1">
                          <p><span className="font-semibold">A</span> = High likelihood of personal injury or facility, material or equipment damage</p>
                          <p><span className="font-semibold">B</span> = Moderate likelihood of personal injury or facility, material or equipment damage</p>
                          <p><span className="font-semibold">C</span> = Minor likelihood of personal injury or facility, material or equipment damage</p>
                        </div>
                        <div className="space-y-3">
                          {visibleRows.map((row, idx) => {
                              const colNum = idx + 1
                              const likelihoodDropdown = parseCustomFieldSpec(row.likelihood?.label)
                              const repeatDropdown = parseCustomFieldSpec(row.repeat?.label)
                              return (
                                <div key={row.row} className="w-full rounded-xl border border-neutral-200 dark:border-neutral-700 p-3 bg-white/60 dark:bg-neutral-900/20 space-y-2">
                                  <h4 className="text-sm font-semibold text-neutral-800 dark:text-neutral-100">{`Hazard Col ${colNum}`}</h4>

                                  {row.item?.id && (
                                    <label className="block">
                                      <span className="block text-xs font-medium text-neutral-600 dark:text-neutral-300 mb-1">{`Hazard Col ${colNum}: Item # / Location (Insert Substandard Item)`}</span>
                                      <input
                                        type="text"
                                        value={values[row.item.id] ?? ''}
                                        onChange={(e) => handleValueChange(row.item.id, e.target.value)}
                                        className="w-full min-h-[38px] px-3 rounded-lg border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 text-sm"
                                      />
                                    </label>
                                  )}

                                  {row.hazards?.id && (
                                    <label className="block">
                                      <span className="block text-xs font-medium text-neutral-600 dark:text-neutral-300 mb-1">{`Hazard Col ${colNum}: Hazards Observed`}</span>
                                      <input
                                        type="text"
                                        value={values[row.hazards.id] ?? ''}
                                        onChange={(e) => handleValueChange(row.hazards.id, e.target.value)}
                                        className="w-full min-h-[38px] px-3 rounded-lg border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 text-sm"
                                      />
                                    </label>
                                  )}

                                  <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">Details</p>

                                  {row.likelihood?.id && (
                                    <label className="block">
                                      <span className="block text-xs font-medium text-neutral-600 dark:text-neutral-300 mb-1">{`Hazard Col ${colNum}: Likelihood (A/B/C)`}</span>
                                      <select
                                        value={values[row.likelihood.id] ?? ''}
                                        onChange={(e) => handleValueChange(row.likelihood.id, e.target.value)}
                                        className="w-full min-h-[38px] px-3 rounded-lg border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 text-sm"
                                      >
                                        <option value="">Select...</option>
                                        {(likelihoodDropdown?.options ?? ['A', 'B', 'C']).map((option) => (
                                          <option key={option} value={option}>{option}</option>
                                        ))}
                                      </select>
                                    </label>
                                  )}

                                  {row.corrective?.id && (
                                    <label className="block">
                                      <span className="block text-xs font-medium text-neutral-600 dark:text-neutral-300 mb-1">{`Hazard Col ${colNum}: Corrective Measures Taken/Suggested`}</span>
                                      <input
                                        type="text"
                                        value={values[row.corrective.id] ?? ''}
                                        onChange={(e) => handleValueChange(row.corrective.id, e.target.value)}
                                        className="w-full min-h-[38px] px-3 rounded-lg border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 text-sm"
                                      />
                                    </label>
                                  )}

                                  {row.repeat?.id && (
                                    <label className="block">
                                      <span className="block text-xs font-medium text-neutral-600 dark:text-neutral-300 mb-1">{`Hazard Col ${colNum}: Repeat (Y/N)`}</span>
                                      <select
                                        value={values[row.repeat.id] ?? ''}
                                        onChange={(e) => handleValueChange(row.repeat.id, e.target.value)}
                                        className="w-full min-h-[38px] px-3 rounded-lg border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 text-sm"
                                      >
                                        <option value="">Select...</option>
                                        {(repeatDropdown?.options ?? ['Y', 'N']).map((option) => (
                                          <option key={option} value={option}>{option}</option>
                                        ))}
                                      </select>
                                    </label>
                                  )}

                                  {row.dateResolved?.id && (
                                    <label className="block">
                                      <span className="block text-xs font-medium text-neutral-600 dark:text-neutral-300 mb-1">{`Hazard Col ${colNum}: Date Resolved`}</span>
                                      <input
                                        type="date"
                                        value={values[row.dateResolved.id] ?? ''}
                                        onChange={(e) => handleValueChange(row.dateResolved.id, e.target.value)}
                                        className="w-full min-h-[38px] px-3 rounded-lg border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 text-sm"
                                      />
                                    </label>
                                  )}

                                  {row.comments?.id && (
                                    <label className="block">
                                      <span className="block text-xs font-medium text-neutral-600 dark:text-neutral-300 mb-1">{`Hazard Row ${colNum} (below it): Comments / Follow-Up / Site Incidents or Near Misses Reported`}</span>
                                      <textarea
                                        value={values[row.comments.id] ?? ''}
                                        onChange={(e) => handleValueChange(row.comments.id, e.target.value)}
                                        rows={3}
                                        className="w-full px-3 py-2 rounded-lg border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 text-sm resize-y"
                                      />
                                    </label>
                                  )}
                                </div>
                              )
                            })}
                        </div>
                        {targetVisibleRows > rows.length && (
                          <p className="text-xs text-amber-600 dark:text-amber-300">
                            More substandard items were selected than available hazard columns. Increase weekly hazard row slots in template setup.
                          </p>
                        )}
                      </div>
                    )
                  })()
                ) : section.key === 'washroom_items' ? (
                  (() => {
                    type WashroomRow = {
                      item: string
                      description: string
                      choiceField?: any
                      notesField?: any
                    }
                    const rows: WashroomRow[] = []
                    const rowMap = new Map<string, WashroomRow>()

                    const upsertRow = (itemName: string, description = '') => {
                      const key = itemName.toLowerCase()
                      let row = rowMap.get(key)
                      if (!row) {
                        row = { item: itemName, description }
                        rowMap.set(key, row)
                        rows.push(row)
                      } else if (!row.description && description) {
                        row.description = description
                      }
                      return row
                    }

                    for (const field of section.fields) {
                      const itemMeta = parseWashroomChecklistItemFieldMeta(field)
                      if (itemMeta) {
                        const row = upsertRow(itemMeta.item, itemMeta.description)
                        row.choiceField = field
                        continue
                      }
                      const notesMeta = parseWashroomChecklistNotesFieldMeta(field)
                      if (notesMeta) {
                        const row = upsertRow(notesMeta.item)
                        row.notesField = field
                      }
                    }

                    const checklistTopOrder = ['Toilet Paper', 'Lighting', 'Maintenance Log', 'Maintenance Notes']
                    const sortedRows = [...rows].sort((a, b) => {
                      const ai = checklistTopOrder.findIndex((name) => name.toLowerCase() === a.item.toLowerCase())
                      const bi = checklistTopOrder.findIndex((name) => name.toLowerCase() === b.item.toLowerCase())
                      const aRank = ai === -1 ? Number.MAX_SAFE_INTEGER : ai
                      const bRank = bi === -1 ? Number.MAX_SAFE_INTEGER : bi
                      if (aRank !== bRank) return aRank - bRank
                      return a.item.localeCompare(b.item)
                    })

                    return (
                      <div className="overflow-x-auto rounded-lg border border-neutral-200 dark:border-neutral-700">
                        <table className="w-full min-w-[980px] border-collapse">
                          <thead className="bg-neutral-100 dark:bg-neutral-800">
                            <tr>
                              <th className="px-3 py-2 text-left text-xs font-semibold border border-neutral-200 dark:border-neutral-700 w-[18%]">Item</th>
                              <th className="px-3 py-2 text-left text-xs font-semibold border border-neutral-200 dark:border-neutral-700">Description</th>
                              <th className="px-3 py-2 text-center text-xs font-semibold border border-neutral-200 dark:border-neutral-700 w-[6%]">Yes</th>
                              <th className="px-3 py-2 text-center text-xs font-semibold border border-neutral-200 dark:border-neutral-700 w-[6%]">No</th>
                              <th className="px-3 py-2 text-center text-xs font-semibold border border-neutral-200 dark:border-neutral-700 w-[6%]">N/A</th>
                              <th className="px-3 py-2 text-left text-xs font-semibold border border-neutral-200 dark:border-neutral-700 w-[28%]">Notes/Observations</th>
                            </tr>
                          </thead>
                          <tbody>
                            {sortedRows.map((row) => {
                              const choiceFieldId = row.choiceField?.id
                              const notesFieldId = row.notesField?.id
                              const choice = choiceFieldId ? normalizeWashroomChecklistChoice(values[choiceFieldId]) : ''
                              return (
                                <tr key={row.item}>
                                  <td className="px-3 py-2 text-sm align-top border border-neutral-200 dark:border-neutral-700">{row.item}</td>
                                  <td className="px-3 py-2 text-sm align-top border border-neutral-200 dark:border-neutral-700">{row.description || '—'}</td>
                                  {(['yes', 'no', 'na'] as const).map((opt) => (
                                    <td key={opt} className="px-2 py-2 text-center align-top border border-neutral-200 dark:border-neutral-700">
                                      {choiceFieldId ? (
                                        <input
                                          type="checkbox"
                                          checked={choice === opt}
                                          onChange={() => handleChecklistChoiceChange(choiceFieldId, opt)}
                                          className="w-4 h-4 rounded border-neutral-300 text-brand-600"
                                          aria-label={`${row.item} ${opt}`}
                                        />
                                      ) : (
                                        <span className="inline-block w-4 h-4" />
                                      )}
                                    </td>
                                  ))}
                                  <td className="p-1.5 align-top border border-neutral-200 dark:border-neutral-700">
                                    {notesFieldId ? (
                                      <input
                                        type="text"
                                        value={values[notesFieldId] ?? ''}
                                        onChange={(e) => handleValueChange(notesFieldId, e.target.value)}
                                        className="w-full min-h-[38px] px-2 rounded border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 text-sm"
                                        aria-label={`${row.item} notes`}
                                      />
                                    ) : (
                                      <span className="text-sm text-neutral-400 px-2">—</span>
                                    )}
                                  </td>
                                </tr>
                              )
                            })}
                          </tbody>
                        </table>
                      </div>
                    )
                  })()
                ) : section.key === 'washroom_signoff' ? (
                  (() => {
                    const findField = (name: string) => {
                      return section.fields.find((field) => {
                        const label = String(parseCustomFieldSpec(field.label)?.label ?? field.label ?? '').trim().toLowerCase()
                        return label === name
                      })
                    }
                    const dateField = findField('date of inspection')
                    const timeField = findField('time')
                    const facilityField = findField('facility/location')
                    const inspectorField = findField('name of inspector')
                    const signatureField = findField('signature')

                    const inputClass =
                      'w-full min-h-[38px] px-2 rounded border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 text-sm'

                    return (
                      <div className="overflow-x-auto rounded-lg border border-neutral-200 dark:border-neutral-700">
                        <table className="w-full min-w-[780px] border-collapse">
                          <tbody>
                            <tr>
                              <td className="px-3 py-2 text-sm font-medium border border-neutral-200 dark:border-neutral-700">Date of Inspection:</td>
                              <td className="p-1.5 border border-neutral-200 dark:border-neutral-700">
                                {dateField?.id ? (
                                  <input
                                    type="date"
                                    value={values[dateField.id] ?? ''}
                                    onChange={(e) => handleValueChange(dateField.id, e.target.value)}
                                    className={inputClass}
                                  />
                                ) : (
                                  <span className="text-neutral-400 text-sm">—</span>
                                )}
                              </td>
                              <td className="px-3 py-2 text-sm font-medium border border-neutral-200 dark:border-neutral-700">Time:</td>
                              <td className="p-1.5 border border-neutral-200 dark:border-neutral-700">
                                {timeField?.id ? (
                                  <input
                                    type="text"
                                    value={values[timeField.id] ?? ''}
                                    onChange={(e) => handleValueChange(timeField.id, e.target.value)}
                                    className={inputClass}
                                  />
                                ) : (
                                  <span className="text-neutral-400 text-sm">—</span>
                                )}
                              </td>
                              <td className="px-3 py-2 text-sm font-medium border border-neutral-200 dark:border-neutral-700">Facility/Location:</td>
                              <td className="p-1.5 border border-neutral-200 dark:border-neutral-700">
                                {facilityField?.id ? (
                                  <input
                                    type="text"
                                    value={values[facilityField.id] ?? ''}
                                    onChange={(e) => handleValueChange(facilityField.id, e.target.value)}
                                    className={inputClass}
                                  />
                                ) : (
                                  <span className="text-neutral-400 text-sm">—</span>
                                )}
                              </td>
                            </tr>
                            <tr>
                              <td className="px-3 py-2 text-sm font-medium border border-neutral-200 dark:border-neutral-700">Name of Inspector:</td>
                              <td className="p-1.5 border border-neutral-200 dark:border-neutral-700" colSpan={3}>
                                {inspectorField?.id ? (
                                  <input
                                    type="text"
                                    value={values[inspectorField.id] ?? ''}
                                    onChange={(e) => handleValueChange(inspectorField.id, e.target.value)}
                                    className={inputClass}
                                  />
                                ) : (
                                  <span className="text-neutral-400 text-sm">—</span>
                                )}
                              </td>
                              <td className="px-3 py-2 text-sm font-medium border border-neutral-200 dark:border-neutral-700">Signature:</td>
                              <td className="p-1.5 border border-neutral-200 dark:border-neutral-700">
                                {signatureField?.id ? (
                                  <button
                                    type="button"
                                    onClick={() => setSigField({ id: signatureField.id, label: signatureField.label })}
                                    className={`w-full min-h-[44px] px-3 rounded-lg border text-left text-sm transition-colors ${
                                      values[signatureField.id]
                                        ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300'
                                        : 'border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300'
                                    }`}
                                  >
                                    {values[signatureField.id] ? 'Signature saved' : 'Tap to sign'}
                                  </button>
                                ) : (
                                  <span className="text-neutral-400 text-sm">—</span>
                                )}
                              </td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    )
                  })()
                ) : (
                  <>
                    {section.fields.map((field) => {
                    if (isDailyHazardTemplate) {
                      const label = String(parseCustomFieldSpec(field.label)?.label ?? field.label ?? '')
                      const isGeneralInfoField =
                        isDhaGeneralInfoFieldLabel(label) ||
                        parseJobDropdownMarker(parseCustomFieldSpec(field.label)?.label ?? field.label)
                      if (isGeneralInfoField) return null
                      if (isDhaGeneralActivityLabel(label) && fieldTypeNorm(field.type) === 'CHECKBOX') return null
                      if (isDhaSpecificHazardLabel(label) && fieldTypeNorm(field.type) === 'CHECKBOX') return null
                      if (isDhaStandardSiteControlLabel(label) && fieldTypeNorm(field.type) === 'CHECKBOX') return null
                      if (isDhaExternalHazardLabel(label) && fieldTypeNorm(field.type) === 'CHECKBOX') return null
                      if (isDhaPpeLabel(label) && fieldTypeNorm(field.type) === 'CHECKBOX') return null
                    }
                    // Weekly hazard row fields (including dropdown-backed labels) should only
                    // render inside the dynamic weekly_hazard_table block.
                    if (section.key !== 'weekly_hazard_table' && parseWeeklyHazardFieldMeta(field)) {
                      return null
                    }
                    if (isCollectSignaturesMarker(field.label)) {
                      const collected = loadedSignatures
                        .filter((s) => String(s?.signerRole ?? '').toLowerCase() === 'collected')
                        .slice()
                        .sort((a, b) => String(b?.signedAt ?? '').localeCompare(String(a?.signedAt ?? '')))
                      const operatorSignature = collected.find((s) =>
                        (user?.id && s?.signerId === user.id) ||
                        (user?.name && !s?.signerId && s?.signerName === user.name)
                      )
                      return (
                        <div key={field.id} className="rounded-lg border border-neutral-200 dark:border-neutral-700 p-4 bg-white dark:bg-neutral-900/20">
                          <h3 className="font-medium text-neutral-900 dark:text-white">Signatures Collected</h3>
                          {collected.length === 0 ? (
                            <p className="text-sm text-neutral-500 mt-1">No signatures collected yet.</p>
                          ) : (
                            <ul className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-4">
                              {collected.map((row, i) => (
                                <li key={`${row.signedAt ?? 'sig'}-${i}`} className="border border-neutral-200 dark:border-neutral-700 rounded-lg p-3 bg-white dark:bg-neutral-800 flex items-center gap-4">
                                  {row.imageData ? (
                                    <img src={row.imageData} alt={`Signature of ${row.signerName ?? 'Worker'}`} className="h-12 border rounded bg-white object-contain min-w-[100px]" />
                                  ) : (
                                    <div className="h-12 w-24 border rounded bg-neutral-50 flex items-center justify-center text-xs text-neutral-400">No Signature</div>
                                  )}
                                  <div className="flex-1 min-w-0">
                                    <p className="font-medium text-sm text-neutral-900 dark:text-white">{row.signerName ?? 'Worker'}</p>
                                    {row.signedAt && (
                                      <p className="text-xs text-neutral-500 mt-1">{new Date(row.signedAt).toLocaleString()}</p>
                                    )}
                                  </div>
                                  <button
                                    type="button"
                                    className="shrink-0 text-xs px-3 py-1.5 rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 hover:bg-red-100 dark:hover:bg-red-900/40"
                                    onClick={() => handleDeleteCollectedSignature({ signedAt: row.signedAt, imageData: row.imageData })}
                                  >
                                    Remove
                                  </button>
                                </li>
                              ))}
                            </ul>
                          )}

                          {isEquipmentInspectionTemplate && (
                            <div className="mt-4 rounded-lg border border-neutral-200 dark:border-neutral-700 p-3 bg-white dark:bg-neutral-800/40">
                              <p className="text-sm font-medium text-neutral-900 dark:text-white mb-2">Operator Sign-off</p>
                              <button
                                type="button"
                                className="w-full min-h-[56px] border border-dashed border-neutral-300 dark:border-neutral-600 rounded-lg flex items-center justify-center hover:bg-neutral-50 dark:hover:bg-neutral-800 disabled:opacity-60"
                                onClick={() => {
                                  if (!user?.id) return
                                  setCollectSigningWorkerId(user.id)
                                  setSigField({ id: '__collect_signatures__', label: 'Operator Signature' })
                                }}
                                disabled={collectBusy || !user?.id}
                              >
                                {operatorSignature?.imageData ? (
                                  <img src={operatorSignature.imageData} alt="Operator signature" className="max-h-12 object-contain" />
                                ) : (
                                  <span className="text-sm text-neutral-500">Tap to add operator signature</span>
                                )}
                              </button>
                            </div>
                          )}

                          <div className="pt-4 mt-4 border-t border-neutral-200 dark:border-neutral-700 flex flex-wrap items-end gap-3">
                            <div className="flex-1 min-w-[200px]">
                              <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">Select worker to sign</label>
                              <select
                                value={collectSigningWorkerId}
                                onChange={(e) => {
                                  setCollectSignerType('worker')
                                  setCollectSigningWorkerId(e.target.value)
                                }}
                                className="w-full min-h-[44px] px-4 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white"
                                aria-label="Select worker to sign"
                                disabled={collectBusy}
                              >
                                <option value="">Select yourself or a worker...</option>
                                <option value={user?.id ?? ''}>{user?.name ?? 'Me'} (Me)</option>
                                {toolboxSigningOptions
                                  .filter((w: any) => w.id !== user?.id)
                                  .map((w: any) => (
                                    <option key={w.id} value={w.id}>{w.name}</option>
                                  ))}
                              </select>
                            </div>
                            <Button
                              type="button"
                              onClick={() => {
                                if (!collectSigningWorkerId) return
                                setSigField({ id: '__collect_signatures__', label: 'Signature' })
                              }}
                              disabled={!collectSigningWorkerId || collectBusy}
                            >
                              {collectBusy ? 'Saving…' : 'Add Signature'}
                            </Button>
                          </div>
                          <div className="flex flex-wrap items-end gap-3">
                            <div className="flex-1 min-w-[220px]">
                              <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">Visitor name</label>
                              <input
                                value={collectVisitorName}
                                onChange={(e) => {
                                  setCollectSignerType('visitor')
                                  setCollectVisitorName(e.target.value)
                                }}
                                className="w-full min-h-[44px] px-4 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white text-sm"
                                placeholder="Enter visitor name..."
                                disabled={collectBusy}
                              />
                            </div>
                            <Button
                              type="button"
                              variant="outline"
                              onClick={() => {
                                if (!collectVisitorName.trim()) return
                                setCollectSignerType('visitor')
                                setSigField({ id: '__collect_signatures__', label: `Visitor: ${collectVisitorName.trim()}` })
                              }}
                              disabled={!collectVisitorName.trim() || collectBusy}
                            >
                              Add Visitor Signature
                            </Button>
                          </div>
                        </div>
                      )
                    }
                    const dropdown = parseCustomFieldSpec(field.label)
                    const jobDropdown = parseJobDropdownMarker(field.label)
                    const resolvedLabel = jobDropdown?.label ?? dropdown?.label ?? field.label ?? 'Field'
                    const value = values[field.id] ?? ''
                    if (fieldTypeNorm(field.type) === 'CHECKBOX') {
                      if (isUndergroundPipingInspectionTemplate) {
                        const rawChoice = String(value ?? '').trim().toLowerCase()
                        const currentChoice =
                          rawChoice === 'yes' || rawChoice === 'true'
                            ? 'yes'
                            : rawChoice === 'no' || rawChoice === 'false'
                              ? 'no'
                              : ''
                        return (
                          <div key={field.id} className="rounded-lg border border-neutral-200 dark:border-neutral-700 p-3">
                            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                              <span className="text-sm text-neutral-800 dark:text-neutral-200">
                                {resolvedLabel}
                                {field.required ? ' *' : ''}
                              </span>
                              <div className="flex items-center gap-3 text-xs text-neutral-600 dark:text-neutral-300">
                                {([
                                  { key: 'yes' as const, label: 'Yes' },
                                  { key: 'no' as const, label: 'No' },
                                ] as const).map((opt) => (
                                  <label key={opt.key} className="inline-flex items-center gap-1.5 whitespace-nowrap">
                                    <input
                                      type="checkbox"
                                      checked={currentChoice === opt.key}
                                      onChange={() => handleValueChange(field.id, currentChoice === opt.key ? '' : opt.key)}
                                      className="w-4 h-4 rounded border-neutral-300 text-brand-600"
                                    />
                                    <span>{opt.label}</span>
                                  </label>
                                ))}
                              </div>
                            </div>
                          </div>
                        )
                      }
                      if (isStandardsChecklistTemplate) {
                        const currentChoice = normalizeChecklistChoice(value)
                        const triOpts = isHotWorkPermitTemplate
                          ? ([
                              { key: 'yes' as const, label: 'Yes' },
                              { key: 'no' as const, label: 'No' },
                              { key: 'na' as const, label: 'N/A' },
                            ] as const)
                          : ([
                              { key: 'standard' as const, label: 'Standard' },
                              { key: 'substandard' as const, label: 'Substandard' },
                              { key: 'na' as const, label: 'N/A (Missing)' },
                            ] as const)
                        return (
                          <div key={field.id} className="rounded-lg border border-neutral-200 dark:border-neutral-700 p-3">
                            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                              <span className="text-sm text-neutral-800 dark:text-neutral-200">
                                {resolvedLabel}
                                {field.required ? ' *' : ''}
                              </span>
                              <div className="flex items-center gap-3 text-xs text-neutral-600 dark:text-neutral-300">
                                {!isHotWorkPermitTemplate && (
                                  <span className="font-medium">Does it Meet Standards?</span>
                                )}
                                {triOpts.map((opt) => (
                                  <label key={opt.key} className="inline-flex items-center gap-1.5 whitespace-nowrap">
                                    <input
                                      type="checkbox"
                                      checked={currentChoice === opt.key}
                                      onChange={() => handleChecklistChoiceChange(field.id, opt.key)}
                                      className="w-4 h-4 rounded border-neutral-300 text-brand-600"
                                    />
                                    <span>{opt.label}</span>
                                  </label>
                                ))}
                              </div>
                            </div>
                          </div>
                        )
                      }
                      return (
                        <label key={field.id} className="flex items-center gap-3 rounded-lg border border-neutral-200 dark:border-neutral-700 p-3">
                          <input
                            type="checkbox"
                            checked={value === 'true'}
                            onChange={(e) => handleValueChange(field.id, e.target.checked ? 'true' : 'false')}
                            className="w-4 h-4 rounded border-neutral-300 text-brand-600"
                          />
                          <span className="text-sm text-neutral-800 dark:text-neutral-200">
                            {resolvedLabel}
                            {field.required ? ' *' : ''}
                          </span>
                        </label>
                      )
                    }
                    if (fieldTypeNorm(field.type) === 'SIGNATURE') {
                      const remoteId = hotWorkRemoteSignerByFieldId[field.id] ?? ''
                      return (
                        <div key={field.id} className="rounded-lg border border-neutral-200 dark:border-neutral-700 p-3">
                          <p className="text-sm text-neutral-700 dark:text-neutral-200 mb-2">
                            {resolvedLabel}
                            {field.required ? ' *' : ''}
                          </p>
                          {isHotWorkPermitTemplate && !value && !remoteId && (
                            <label className="block mb-3">
                              <span className="block text-xs font-medium text-neutral-600 dark:text-neutral-300 mb-1">
                                Print name (who is signing this line)
                              </span>
                              <input
                                type="text"
                                value={hotWorkPrintNameByFieldId[field.id] ?? ''}
                                onChange={(e) =>
                                  setHotWorkPrintNameByFieldId((prev) => ({
                                    ...prev,
                                    [field.id]: e.target.value,
                                  }))
                                }
                                placeholder="Type full name as it should appear on the permit"
                                className="w-full min-h-[40px] px-3 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-neutral-800 text-sm text-neutral-900 dark:text-white"
                                autoComplete="name"
                              />
                            </label>
                          )}
                          <button
                            type="button"
                            className="w-full min-h-[52px] border border-dashed border-neutral-300 dark:border-neutral-600 rounded-lg flex items-center justify-center hover:bg-neutral-50 dark:hover:bg-neutral-800 disabled:opacity-50"
                            onClick={() => {
                              if (isHotWorkPermitTemplate && remoteId) return
                              if (isHotWorkPermitTemplate && !remoteId) {
                                const printName = String(hotWorkPrintNameByFieldId[field.id] ?? '').trim()
                                if (!printName) {
                                  alert('Enter the signer’s print name before signing (same idea as Daily Hazard / visitor sign-off).')
                                  return
                                }
                                setSigField({ id: field.id, label: resolvedLabel, hotWorkPrintName: printName })
                                return
                              }
                              setSigField({ id: field.id, label: resolvedLabel })
                            }}
                            disabled={Boolean(isHotWorkPermitTemplate && remoteId)}
                          >
                            {value ? <img src={String(value)} alt="Signature" className="max-h-12 object-contain" /> : <span className="text-sm text-neutral-500">Tap to sign</span>}
                          </button>
                          {isHotWorkPermitTemplate && !value && (
                            <div className="mt-3 space-y-1">
                              <label className="block text-xs font-medium text-neutral-600 dark:text-neutral-300">
                                Or send this line for signature
                              </label>
                              <select
                                value={remoteId}
                                onChange={(e) => {
                                  const v = e.target.value
                                  setHotWorkRemoteSignerByFieldId((prev) => {
                                    const next = { ...prev }
                                    if (!v) delete next[field.id]
                                    else next[field.id] = v
                                    return next
                                  })
                                  if (v) {
                                    setHotWorkPrintNameByFieldId((prev) => {
                                      const next = { ...prev }
                                      delete next[field.id]
                                      return next
                                    })
                                  }
                                }}
                                className="w-full min-h-[40px] px-3 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-neutral-800 text-sm text-neutral-900 dark:text-white"
                                aria-label={`Assign remote signer for ${resolvedLabel}`}
                              >
                                <option value="">Sign on this device only</option>
                                <option value={user?.id ?? ''}>{user?.name ?? 'Me'} (notify me)</option>
                                {signerOptions
                                  .filter((w: any) => w.id !== user?.id)
                                  .map((w: any) => (
                                    <option key={w.id} value={w.id}>
                                      {w.name}
                                    </option>
                                  ))}
                              </select>
                              <p className="text-xs text-neutral-500 dark:text-neutral-400">
                                Assigned people get a notification to sign this exact line on their own account.
                              </p>
                            </div>
                          )}
                        </div>
                      )
                    }
                    if (jobDropdown) {
                      return (
                        <label key={field.id} className="block">
                          <span className="block text-sm text-neutral-700 dark:text-neutral-200 mb-1">
                            {resolvedLabel}
                            {field.required ? ' *' : ''}
                          </span>
                          <select
                            value={value}
                            onChange={(e) => handleValueChange(field.id, e.target.value)}
                            className="w-full min-h-[40px] px-3 rounded-lg border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 text-sm"
                          >
                            <option value="">Select project...</option>
                            {jobOptions.map((job) => (
                              <option key={job.id} value={job.label}>
                                {job.label}
                              </option>
                            ))}
                          </select>
                        </label>
                      )
                    }
                    const dropdownOptions =
                      dropdown
                        ? filterDropdownOptionsForTemplate(template.name ?? '', resolvedLabel, dropdown.options)
                        : []
                    if (dropdown && dropdownOptions.length > 0) {
                      return (
                        <label key={field.id} className="block">
                          <span className="block text-sm text-neutral-700 dark:text-neutral-200 mb-1">
                            {resolvedLabel}
                            {field.required ? ' *' : ''}
                          </span>
                          <select
                            value={value}
                            onChange={(e) => handleValueChange(field.id, e.target.value)}
                            className="w-full min-h-[40px] px-3 rounded-lg border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 text-sm"
                          >
                            <option value="">Select...</option>
                            {dropdownOptions.map((option) => (
                              <option key={option} value={option}>
                                {option}
                              </option>
                            ))}
                          </select>
                        </label>
                      )
                    }
                    const inputType =
                      fieldTypeNorm(field.type) === 'NUMBER'
                        ? 'number'
                        : fieldTypeNorm(field.type) === 'DATE'
                          ? (isDateTimeLabel(resolvedLabel) ? 'datetime-local' : 'date')
                          : (isDateTimeLabel(resolvedLabel) ? 'datetime-local' : 'text')
                    const wantsMultiline =
                      fieldTypeNorm(field.type) === 'TEXT' &&
                      (String(field.label ?? '').toLowerCase().includes('control measures') ||
                        String(field.label ?? '').toLowerCase().includes('safety tips') ||
                        String(field.label ?? '').toLowerCase().includes('notes from workers') ||
                        String(field.label ?? '').length > 60)
                    return (
                      <label key={field.id} className="block">
                        <span className="block text-sm text-neutral-700 dark:text-neutral-200 mb-1">
                          {resolvedLabel}
                          {field.required ? ' *' : ''}
                        </span>
                        {wantsMultiline ? (
                          <textarea
                            value={value}
                            onChange={(e) => handleValueChange(field.id, e.target.value)}
                            rows={5}
                            className="w-full min-h-[120px] px-3 py-2 rounded-lg border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 text-sm resize-y"
                          />
                        ) : (
                          <input
                            type={inputType}
                            value={value}
                            onChange={(e) => handleValueChange(field.id, e.target.value)}
                            className="w-full min-h-[40px] px-3 rounded-lg border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 text-sm"
                          />
                        )}
                      </label>
                    )
                    })}
                  </>
                )}
              </div>
            </Card>
            </div>
          ))}
        </div>
      )}

      {isCustomTemplate && attendeeSlots.length > 0 && (
        <Card padding="lg" className="border-brand-500/50 bg-brand-50/20 dark:bg-brand-900/10">
          <h2 className="font-semibold text-lg text-neutral-900 dark:text-white mb-2">Worker Acknowledgement</h2>
          <p className="italic mb-6 text-neutral-800 dark:text-neutral-200 border-l-4 border-brand-500 pl-3">
            I, the undersigned employee, hereby confirm the following: Thoroughly reviewed and understand the Daily Hazard Analysis / Am physically and mentally fit to perform my assigned duties / Have or will complete all permits and forms to ensure a safe work-day / Addressed and resolved all previous hazards
          </p>

          <div className="space-y-4">
            <h3 className="font-medium text-neutral-900 dark:text-white">Signatures Collected</h3>
            <ul className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {attendeeSlots.map((slot, i) => {
                const nameVal = values[slot.nameField.id]
                const sigVal = values[slot.sigField.id]
                if (!nameVal && !sigVal) return null
                const sigInfo = loadedSignatures.find(s => s.fieldId === slot.sigField.id)
                return (
                  <li key={i} className="border border-neutral-200 dark:border-neutral-700 rounded-lg p-3 bg-white dark:bg-neutral-800 flex items-center gap-4">
                    {sigVal ? (
                      <img src={sigVal} alt={`Signature`} className="h-12 border rounded bg-white object-contain min-w-[100px]" />
                    ) : (
                      <div className="h-12 w-24 border rounded bg-neutral-50 flex items-center justify-center text-xs text-neutral-400">No Signature</div>
                    )}
                    <div>
                      <p className="font-medium text-sm text-neutral-900 dark:text-white">{nameVal || 'Unknown Worker'}</p>
                      {sigInfo?.signedAt && (
                        <p className="text-xs text-neutral-500 mt-1">
                          {new Date(sigInfo.signedAt).toLocaleString()}
                        </p>
                      )}
                    </div>
                  </li>
                )
              })}
              {attendeeSlots.every(slot => !values[slot.nameField.id] && !values[slot.sigField.id]) && (
                <li className="text-sm text-neutral-500 min-w-full col-span-2">No signatures collected yet.</li>
              )}
            </ul>

            <div className="pt-4 border-t border-neutral-200 dark:border-neutral-700 space-y-3">
              <div className="flex flex-wrap items-end gap-3">
                <div className="flex-1 min-w-[200px]">
                  <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">Select worker to sign</label>
                  <select
                    value={signingWorkerId}
                    onChange={(e) => {
                      setSigningWorkerId(e.target.value)
                      if (e.target.value) setToolboxVisitorName('')
                    }}
                    className="w-full min-h-[44px] px-4 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white text-sm"
                    aria-label="Select worker to sign"
                  >
                    <option value="">Select yourself or a worker...</option>
                    <option value={user?.id ?? 'self'}>{user?.name} (Me)</option>
                    {employees.filter((e: any) => e.id !== user?.id).map((e: any) => (
                      <option key={e.id} value={e.id}>{e.firstName} {e.lastName}</option>
                    ))}
                  </select>
                </div>
                <Button type="button" onClick={() => {
                  const firstEmptySlot = attendeeSlots.find(s => !values[s.nameField.id] && !values[s.sigField.id])
                  if (!firstEmptySlot) {
                    alert('All signature slots are full.')
                    return
                  }
                  const workerName = signingWorkerId === user?.id || signingWorkerId === 'self'
                    ? user?.name
                    : employees.find((e: any) => e.id === signingWorkerId)?.firstName + ' ' + employees.find((e: any) => e.id === signingWorkerId)?.lastName;

                  setSigField({ id: firstEmptySlot.sigField.id, nameFieldId: firstEmptySlot.nameField.id, label: workerName || 'Worker' });
                  setIsSigningWorker(true);
                }} disabled={!signingWorkerId}>
                  Add Signature
                </Button>
              </div>
              <div className="flex flex-wrap items-end gap-3">
                <div className="flex-1 min-w-[220px]">
                  <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">Visitor name</label>
                  <input
                    value={toolboxVisitorName}
                    onChange={(e) => {
                      setToolboxVisitorName(e.target.value)
                      if (e.target.value.trim()) setSigningWorkerId('')
                    }}
                    className="w-full min-h-[44px] px-4 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white text-sm"
                    placeholder="Enter visitor name..."
                  />
                </div>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    const visitorName = toolboxVisitorName.trim()
                    if (!visitorName) return
                    const firstEmptySlot = attendeeSlots.find(s => !values[s.nameField.id] && !values[s.sigField.id])
                    if (!firstEmptySlot) {
                      alert('All signature slots are full.')
                      return
                    }
                    setSigningWorkerId('')
                    setSigField({
                      id: firstEmptySlot.sigField.id,
                      nameFieldId: firstEmptySlot.nameField.id,
                      label: visitorName,
                    })
                    setIsSigningWorker(false)
                  }}
                  disabled={!toolboxVisitorName.trim()}
                >
                  Add Visitor Signature
                </Button>
              </div>
            </div>
          </div>
        </Card>
      )}

      {isCustomTemplate && attendeeSlots.length > 0 && (
        <Card padding="lg" className="border-amber-500/50 bg-amber-50/20 dark:bg-amber-900/10">
          <h2 className="font-semibold text-lg text-neutral-900 dark:text-white mb-2">Tool Box Talks — Supporting PDF (optional)</h2>
          <p className="text-sm text-neutral-600 dark:text-neutral-400 mb-4">
            Upload any supporting document (e.g. permit, checklist, or reference PDF) for this toolbox talk. You can then Quick view or Download it below.
          </p>

          {toolboxExtraPdfBlobPath ? (
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <div className="min-w-[180px]">
                <p className="font-medium text-sm text-neutral-900 dark:text-neutral-100 truncate" title={toolboxExtraPdfOriginalName ?? 'Toolbox attachment'}>
                  {toolboxExtraPdfOriginalName ?? 'Toolbox attachment.pdf'}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button type="button" variant="outline" size="sm" onClick={handleToolboxExtraQuickView}>
                  Quick view
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={handleToolboxExtraDownload}>
                  Download
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
                  onClick={handleToolboxExtraRemove}
                  disabled={toolboxExtraPdfRemoving}
                >
                  {toolboxExtraPdfRemoving ? 'Removing…' : 'Remove'}
                </Button>
              </div>
            </div>
          ) : (
            <p className="text-sm text-neutral-500 dark:text-neutral-400 mb-4">No supporting PDF added yet.</p>
          )}

          {toolboxExtraPdfBlobPath && (
            <div className="mb-4 rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900/20 overflow-hidden">
              <div className="px-3 py-2 text-xs text-neutral-600 dark:text-neutral-300 border-b border-neutral-200 dark:border-neutral-700">
                Embedded preview
              </div>
              {toolboxExtraPdfEmbedLoading ? (
                <div className="px-3 py-6 text-sm text-neutral-500 dark:text-neutral-400">Loading preview...</div>
              ) : toolboxExtraPdfEmbedError ? (
                <div className="px-3 py-4 text-sm text-red-600 dark:text-red-400">{toolboxExtraPdfEmbedError}</div>
              ) : toolboxExtraPdfEmbedUrl ? (
                <iframe
                  src={toolboxExtraPdfEmbedUrl}
                  title="Toolbox supporting PDF preview"
                  className="w-full h-[460px] bg-white"
                />
              ) : (
                <div className="px-3 py-6 text-sm text-neutral-500 dark:text-neutral-400">Preview unavailable.</div>
              )}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-3">
            <input
              type="file"
              ref={toolboxExtraPdfInputRef}
              accept=".pdf,application/pdf"
              onChange={(e) => {
                const f = e.target.files?.[0] ?? null
                setToolboxExtraPdfFile(f)
                setToolboxExtraPdfError(null)
              }}
              className="block text-sm text-neutral-700 dark:text-neutral-200"
              aria-label="Upload supporting PDF"
              disabled={toolboxExtraPdfUploading}
            />
            <Button type="button" size="sm" onClick={handleToolboxExtraUpload} disabled={!toolboxExtraPdfFile || toolboxExtraPdfUploading}>
              {toolboxExtraPdfUploading ? 'Uploading…' : 'Add PDF'}
            </Button>
          </div>
          {toolboxExtraPdfError && (
            <p className="text-xs text-red-600 dark:text-red-400 mt-2">{toolboxExtraPdfError}</p>
          )}
        </Card>
      )}

      {/* Desktop/Tablet View: Interactive PDF Overlay */}
      {!isCustomTemplate && !isKissMode && (
        <div className="hidden md:block overflow-x-auto -mx-4 px-4 pb-2">
          <div ref={containerRef} className="relative mx-auto w-full max-w-3xl" style={{ minWidth: '800px' }}>
            {currentImage && (
              <>
                <img
                  src={currentImage}
                  alt={`Page ${currentPage}`}
                  className="block w-full h-auto shadow-lg rounded-lg"
                />
                <div className="absolute inset-0 top-0 left-0 right-0 bottom-0">
                  {pageFields.map((field) => {
                    const left = (field.x ?? 0) * 100
                    const top = (field.y ?? 0) * 100
                    const width = (field.width ?? 0.1) * 100
                    const height = (field.height ?? 0.04) * 100
                    const borderClass = FIELD_BORDER[field.type] ?? 'border-neutral-400'

                    return (
                      <div
                        key={field.id}
                        className="absolute"
                        style={{ left: `${left}%`, top: `${top}%`, width: `${width}%`, height: `${height}%` }}
                      >
                        {field.type === 'TEXT' && (
                          <input
                            type="text"
                            placeholder={field.required ? `${field.label ?? ''} *` : field.label ?? ''}
                            className={`w-full h-full border border-transparent bg-transparent px-2 text-sm rounded focus:outline-none focus:ring-1 focus:ring-brand-500/50 focus:border-brand-400/50 text-neutral-900 placeholder:text-neutral-500 [color-scheme:light]`}
                            value={values[field.id] ?? ''}
                            onChange={(e) => handleValueChange(field.id, e.target.value)}
                          />
                        )}
                        {field.type === 'NUMBER' && (
                          <input
                            type="number"
                            placeholder={field.required ? `${field.label ?? ''} *` : field.label ?? ''}
                            className={`w-full h-full border border-transparent bg-transparent px-2 text-sm rounded focus:outline-none focus:ring-1 focus:ring-brand-500/50 focus:border-brand-400/50 text-neutral-900 [color-scheme:light]`}
                            value={values[field.id] ?? ''}
                            onChange={(e) => handleValueChange(field.id, e.target.value)}
                          />
                        )}
                        {field.type === 'DATE' && (
                          <input
                            type={isDateTimeLabel(field.label) ? 'datetime-local' : 'date'}
                            aria-label={field.label ?? 'Date'}
                            title={field.label ?? 'Date'}
                            className={`w-full h-full border border-transparent bg-transparent px-2 text-sm rounded focus:outline-none focus:ring-1 focus:ring-brand-500/50 focus:border-brand-400/50 text-neutral-900 [color-scheme:light]`}
                            value={values[field.id] ?? ''}
                            onChange={(e) => handleValueChange(field.id, e.target.value)}
                          />
                        )}
                        {field.type === 'CHECKBOX' && (
                          <div className="w-full h-full flex items-center justify-center">
                            <input
                              type="checkbox"
                              aria-label={field.label ?? 'Checkbox'}
                              title={field.label ?? 'Checkbox'}
                              className="w-5 h-5 rounded cursor-pointer accent-brand-600"
                              checked={values[field.id] === 'true'}
                              onChange={(e) => handleValueChange(field.id, e.target.checked ? 'true' : 'false')}
                            />
                          </div>
                        )}
                        {field.type === 'SIGNATURE' && (
                          <button
                            type="button"
                            className="w-full h-full border border-transparent bg-transparent rounded flex items-center justify-center hover:bg-white/20 transition-colors focus:outline-none focus:ring-1 focus:ring-brand-500/50"
                            onClick={() => setSigField({ id: field.id, label: field.label })}
                          >
                            {values[field.id] ? (
                              <img src={values[field.id]} alt="Signature" className="max-w-full max-h-full object-contain" />
                            ) : (
                              <span className="text-sm text-neutral-600">
                                ✍ {field.required ? 'Sign here *' : 'Sign here'}
                              </span>
                            )}
                          </button>
                        )}
                      </div>
                    )
                  })}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Mobile Form View: Full form with inputs overlaid (same as desktop). Page scrolls to see everything. */}
      {!isCustomTemplate && !isKissMode && (
        <div className="block md:hidden mt-4">
          {currentImage && (
            <div className="relative w-full">
              <img
                src={currentImage}
                alt={`Form page ${currentPage}`}
                className="block w-full h-auto shadow-lg rounded-lg border border-neutral-200 dark:border-neutral-600 bg-white dark:bg-neutral-100"
              />
              <div className="absolute inset-0 top-0 left-0 right-0 bottom-0">
                {pageFields.map((field) => {
                  const left = (field.x ?? 0) * 100
                  const top = (field.y ?? 0) * 100
                  const width = (field.width ?? 0.1) * 100
                  const height = (field.height ?? 0.04) * 100
                  const borderClass = FIELD_BORDER[field.type] ?? 'border-neutral-400'
                  const placeholder = getMobilePlaceholder(field) || (field.required ? `${field.label ?? ''} *` : field.label ?? '')
                  return (
                    <div
                      key={field.id}
                      className="absolute flex flex-col"
                      style={{ left: `${left}%`, top: `${top}%`, width: `${width}%`, height: `${height}%` }}
                    >
                      {field.type === 'TEXT' && (
                        <input
                          type="text"
                          placeholder={placeholder}
                          aria-label={field.label ?? 'Text'}
                          className="w-full flex-1 min-h-[44px] border border-transparent bg-transparent px-2 py-1.5 text-sm rounded focus:outline-none focus:ring-1 focus:ring-brand-500/50 text-neutral-900 placeholder:text-neutral-500 [color-scheme:light]"
                          value={values[field.id] ?? ''}
                          onChange={(e) => handleValueChange(field.id, e.target.value)}
                        />
                      )}
                      {field.type === 'NUMBER' && (
                        <input
                          type="number"
                          placeholder={placeholder}
                          aria-label={field.label ?? 'Number'}
                          className="w-full flex-1 min-h-[44px] border border-transparent bg-transparent px-2 py-1.5 text-sm rounded focus:outline-none focus:ring-1 focus:ring-brand-500/50 text-neutral-900 placeholder:text-neutral-500 [color-scheme:light]"
                          value={values[field.id] ?? ''}
                          onChange={(e) => handleValueChange(field.id, e.target.value)}
                        />
                      )}
                      {field.type === 'DATE' && (
                        <input
                          type={isDateTimeLabel(field.label) ? 'datetime-local' : 'date'}
                          aria-label={field.label ?? 'Date'}
                          title={field.label ?? 'Date'}
                          className="w-full flex-1 min-h-[44px] border border-transparent bg-transparent px-2 py-1.5 text-sm rounded focus:outline-none focus:ring-1 focus:ring-brand-500/50 text-neutral-900 [color-scheme:light]"
                          value={values[field.id] ?? ''}
                          onChange={(e) => handleValueChange(field.id, e.target.value)}
                        />
                      )}
                      {field.type === 'CHECKBOX' && (
                        <div className="w-full h-full flex items-center justify-center min-h-[44px]">
                          <input
                            type="checkbox"
                            aria-label={field.label ?? 'Checkbox'}
                            title={field.label ?? 'Checkbox'}
                            className="w-6 h-6 rounded cursor-pointer accent-brand-600"
                            checked={values[field.id] === 'true'}
                            onChange={(e) => handleValueChange(field.id, e.target.checked ? 'true' : 'false')}
                          />
                        </div>
                      )}
                      {field.type === 'SIGNATURE' && (
                        <button
                          type="button"
                          className="w-full flex-1 min-h-[44px] border border-transparent bg-transparent rounded flex items-center justify-center hover:bg-white/20 transition-colors focus:outline-none focus:ring-1 focus:ring-brand-500/50"
                          onClick={() => setSigField({ id: field.id, label: field.label })}
                        >
                          {values[field.id] ? (
                            <img src={values[field.id]} alt="Signature" className="max-w-full max-h-full object-contain" />
                          ) : (
                            <span className="text-sm text-neutral-600">✍ Tap to sign</span>
                          )}
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}
          {currentImage && pageFields.length === 0 && (
            <p className="text-sm text-neutral-500 dark:text-neutral-400 text-center py-4 mt-2">No fields on this page.</p>
          )}
        </div>
      )}

      {!isCustomTemplate && isKissMode && (
        <div className="space-y-4">
          <Card padding="lg" className="space-y-4">
            <div className="space-y-3">
              {[...(template?.fields ?? [])]
                .filter((f) => fieldTypeNorm(f.type) !== 'SIGNATURE')
                .sort((a, b) => Number(Boolean(b.required)) - Number(Boolean(a.required)))
                .map((field) => {
                  const label = field.required ? `${field.label ?? field.type} *` : (field.label ?? field.type)
                  if (fieldTypeNorm(field.type) === 'CHECKBOX') {
                    return (
                      <label
                        key={field.id}
                        className="flex items-center gap-3 min-h-[48px] rounded-xl border border-neutral-200 dark:border-neutral-700 px-3"
                      >
                        <input
                          type="checkbox"
                          checked={values[field.id] === 'true'}
                          onChange={(e) => handleValueChange(field.id, e.target.checked ? 'true' : 'false')}
                          className="w-5 h-5 rounded accent-brand-600"
                        />
                        <span className="text-sm text-neutral-900 dark:text-neutral-100">{label}</span>
                      </label>
                    )
                  }
                  return (
                    <div key={field.id}>
                      <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">{label}</label>
                      <input
                        type={
                          fieldTypeNorm(field.type) === 'DATE'
                            ? (isDateTimeLabel(field.label) ? 'datetime-local' : 'date')
                            : fieldTypeNorm(field.type) === 'NUMBER'
                              ? 'number'
                              : 'text'
                        }
                        value={values[field.id] ?? ''}
                        onChange={(e) => handleValueChange(field.id, e.target.value)}
                        className="w-full min-h-[48px] px-3 rounded-xl border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white"
                        placeholder={getMobilePlaceholder(field)}
                      />
                    </div>
                  )
                })}
            </div>
          </Card>

          {kissPdfSignatureFields.length > 0 && (
            <Card padding="lg" className="border-brand-500/50 bg-brand-50/20 dark:bg-brand-900/10">
              <CardHeader>Signatures — Worker acknowledgement</CardHeader>
              <CardDescription className="italic mt-2 text-neutral-800 dark:text-neutral-200 border-l-4 border-brand-500 pl-3">
                I, the undersigned employee, hereby confirm the following: Thoroughly reviewed and understand the Daily Hazard Analysis / Am physically and mentally fit to perform my assigned duties / Have or will complete all permits and forms to ensure a safe work-day / Addressed and resolved all previous hazards
              </CardDescription>

              <div className="mt-6 space-y-4">
                <h3 className="font-medium text-neutral-900 dark:text-white">Signatures collected</h3>
                {kissPdfSignatureFields.every((f) => !values[f.id]?.trim()) ? (
                  <p className="text-sm text-neutral-500">No signatures collected yet.</p>
                ) : (
                  <ul className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {kissPdfSignatureFields
                      .filter((f) => values[f.id]?.trim())
                      .map((f) => {
                        const sigInfo = loadedSignatures.find((s) => s.fieldId === f.id)
                        return (
                          <li
                            key={f.id}
                            className="border border-neutral-200 dark:border-neutral-700 rounded-lg p-3 bg-white dark:bg-neutral-800 flex items-center gap-4"
                          >
                            <img
                              src={values[f.id]}
                              alt=""
                              className="h-12 border rounded bg-white object-contain min-w-[100px]"
                            />
                            <div className="flex-1 min-w-0">
                              <p className="font-medium text-sm text-neutral-900 dark:text-white">
                                {sigInfo?.signerName ?? f.label ?? 'Signature'}
                              </p>
                              {sigInfo?.signedAt && (
                                <p className="text-xs text-neutral-500 mt-1">{new Date(sigInfo.signedAt).toLocaleString()}</p>
                              )}
                            </div>
                            <button
                              type="button"
                              className="shrink-0 text-xs px-3 py-1.5 rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 hover:bg-red-100 dark:hover:bg-red-900/40"
                              onClick={async () => {
                                if (submissionId) {
                                  try {
                                    await api.delete(`/pdf-submissions/${submissionId}/signatures`, {
                                      data: { fieldId: f.id },
                                    })
                                  } catch {
                                    /* still clear local draft */
                                  }
                                }
                                handleValueChange(f.id, '')
                                setLoadedSignatures((prev) => prev.filter((s) => s.fieldId !== f.id))
                              }}
                            >
                              Remove
                            </button>
                          </li>
                        )
                      })}
                  </ul>
                )}

                <div className="pt-4 border-t border-neutral-200 dark:border-neutral-700 flex flex-wrap items-end gap-3">
                  <div className="flex-1 min-w-[200px]">
                    <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">Select worker to sign</label>
                    <select
                      value={signingWorkerId}
                      onChange={(e) => setSigningWorkerId(e.target.value)}
                      className="w-full min-h-[44px] px-4 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white text-sm"
                      aria-label="Select worker to sign"
                    >
                      <option value="">Select yourself or a worker...</option>
                      <option value={user?.id ?? 'self'}>{user?.name} (Me)</option>
                      {employees.filter((e: any) => e.id !== user?.id).map((e: any) => (
                        <option key={e.id} value={e.id}>
                          {e.firstName} {e.lastName}
                        </option>
                      ))}
                    </select>
                  </div>
                  <Button
                    type="button"
                    onClick={() => {
                      const next = kissPdfSignatureFields.find((field) => !values[field.id]?.trim())
                      if (!next || !signingWorkerId) return
                      const workerName =
                        signingWorkerId === user?.id || signingWorkerId === 'self'
                          ? user?.name ?? 'Me'
                          : `${employees.find((e: any) => e.id === signingWorkerId)?.firstName ?? ''} ${employees.find((e: any) => e.id === signingWorkerId)?.lastName ?? ''}`.trim()
                      setSigField({ id: next.id, label: workerName })
                    }}
                    disabled={!signingWorkerId || !kissPdfSignatureFields.some((field) => !values[field.id]?.trim())}
                  >
                    Add signature
                  </Button>
                </div>
              </div>
            </Card>
          )}
        </div>
      )}

      <div className="no-print flex items-center justify-between text-sm text-neutral-500 dark:text-neutral-400">
        <span>
          {filledVisibleFieldCount} of {visibleFieldIdsForCounter.size} fields filled
        </span>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => navigate('/library')} disabled={submitting}>
            Save draft
          </Button>
          <Button size="sm" onClick={handleSubmit} disabled={submitting}>
            {submitting ? 'Submitting…' : 'Submit form'}
          </Button>
        </div>
      </div>

      {sigField && (
        <SignatureModal
          fieldLabel={sigField.label ?? 'Signature'}
          onSave={handleSignatureSave}
          onClose={() => setSigField(null)}
        />
      )}

      {showSaveDhaPresetModal && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white dark:bg-neutral-800 rounded-2xl shadow-xl w-full max-w-md p-6">
            <h2 className="text-lg font-bold text-neutral-900 dark:text-white">Save as Preset</h2>
            <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-1">
              Give this preset a name to reuse this DHA setup later.
            </p>
            <input
              type="text"
              value={dhaPresetName}
              onChange={(e) => setDhaPresetName(e.target.value)}
              placeholder='e.g. "Trench Work - Standard Setup"'
              className="mt-4 w-full min-h-[42px] px-3 rounded-lg border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-900 text-sm"
            />
            <div className="mt-4 flex justify-end gap-2">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => {
                  setShowSaveDhaPresetModal(false)
                  setDhaPresetName('')
                }}
                disabled={savingDhaPreset}
              >
                Cancel
              </Button>
              <Button type="button" size="sm" onClick={() => void handleSaveDhaPreset()} disabled={!dhaPresetName.trim() || savingDhaPreset}>
                {savingDhaPreset ? 'Saving…' : 'Save Preset'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Submit modal: optionally send for sign-off before HR */}
      {submitModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white dark:bg-neutral-800 rounded-2xl shadow-xl w-full max-w-md mx-4 p-6">
            <h2 className="text-lg font-bold text-neutral-900 dark:text-white mb-1">Submit Form</h2>
            {isHotWorkPermitTemplate ? (
              <>
                <p className="text-sm text-neutral-500 dark:text-neutral-400 mb-4">
                  {(() => {
                    const pending = hotWorkSignatureFields.filter((f) => {
                      const v = values[f.id]
                      return v == null || String(v).trim() === '' || !String(v).startsWith('data:image/')
                    })
                    if (pending.length === 0) {
                      return 'All signature lines are completed on this device. This will go to HR when you confirm.'
                    }
                    return 'For each open line you can pick someone on the form (per-line dropdown) and/or choose people below. Checkboxes fill remaining open lines in order from top to bottom. Each person can cover only one line.'
                  })()}
                </p>
                <ul className="max-h-48 overflow-y-auto space-y-2 mb-4 text-sm">
                  {hotWorkSignatureFields
                    .filter((f) => {
                      const v = values[f.id]
                      return v == null || String(v).trim() === '' || !String(v).startsWith('data:image/')
                    })
                    .map((f) => {
                      const assigneeId = hotWorkRemoteSignerByFieldId[f.id]
                      const label = parseCustomFieldSpec(f.label)?.label ?? f.label ?? 'Signature'
                      const name =
                        assigneeId === user?.id
                          ? `${user?.name ?? 'Me'} (me)`
                          : signerOptions.find((m: any) => m.id === assigneeId)?.name ?? (assigneeId ? 'Selected worker' : '—')
                      return (
                        <li
                          key={f.id}
                          className="py-2 px-3 rounded-xl bg-neutral-50 dark:bg-neutral-900/40 text-neutral-800 dark:text-neutral-200"
                        >
                          <span className="font-medium text-neutral-900 dark:text-white">{label}</span>
                          <span className="text-neutral-500 dark:text-neutral-400"> → </span>
                          {assigneeId ? (
                            name
                          ) : (
                            <span className="text-amber-700 dark:text-amber-400">Open — pick below or on the form</span>
                          )}
                        </li>
                      )
                    })}
                </ul>
                <div className="border-t border-neutral-200 dark:border-neutral-600 pt-4 mt-1">
                  <p className="text-sm font-medium text-neutral-900 dark:text-white mb-1">Assign team members (same as DHA)</p>
                  <p className="text-xs text-neutral-500 dark:text-neutral-400 mb-3">
                    Selected people are assigned to open lines in order. Anyone already chosen on a line above is skipped.
                  </p>
                  <div className="max-h-48 overflow-y-auto space-y-2 mb-4">
                    {signerOptions.length === 0 ? (
                      <p className="text-sm text-neutral-500 dark:text-neutral-400">No employees available.</p>
                    ) : (
                      signerOptions.map((m: any) => (
                        <label
                          key={m.id}
                          className="flex items-center gap-3 py-2 px-3 rounded-xl hover:bg-neutral-50 dark:hover:bg-neutral-700/50 cursor-pointer"
                        >
                          <input
                            type="checkbox"
                            checked={selectedSignerIds.includes(m.id)}
                            onChange={() =>
                              setSelectedSignerIds((prev) =>
                                prev.includes(m.id) ? prev.filter((id) => id !== m.id) : [...prev, m.id]
                              )
                            }
                            className="rounded"
                          />
                          <span className="text-sm font-medium text-neutral-900 dark:text-white">{m.name}</span>
                        </label>
                      ))
                    )}
                  </div>
                </div>
              </>
            ) : (
              <>
                <p className="text-sm text-neutral-500 dark:text-neutral-400 mb-4">
                  Select who must sign off before this is sent to HR. Leave empty to submit directly to HR.
                </p>
                <div className="max-h-48 overflow-y-auto space-y-2 mb-4">
                  {signerOptions.length === 0 ? (
                    <p className="text-sm text-neutral-500 dark:text-neutral-400">No employees available.</p>
                  ) : (
                    signerOptions.map((m: any) => (
                      <label
                        key={m.id}
                        className="flex items-center gap-3 py-2 px-3 rounded-xl hover:bg-neutral-50 dark:hover:bg-neutral-700/50 cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={selectedSignerIds.includes(m.id)}
                          onChange={() =>
                            setSelectedSignerIds((prev) =>
                              prev.includes(m.id) ? prev.filter((id) => id !== m.id) : [...prev, m.id]
                            )
                          }
                          className="rounded"
                        />
                        <span className="text-sm font-medium text-neutral-900 dark:text-white">{m.name}</span>
                      </label>
                    ))
                  )}
                </div>
              </>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="secondary" size="sm" onClick={() => setSubmitModalOpen(false)} disabled={submitting}>
                Cancel
              </Button>
              <Button size="sm" onClick={handleModalSubmit} disabled={submitting}>
                {submitting
                  ? 'Submitting…'
                  : isHotWorkPermitTemplate
                    ? (() => {
                        const pending = hotWorkSignatureFields.some((f) => {
                          const v = values[f.id]
                          return v == null || String(v).trim() === '' || !String(v).startsWith('data:image/')
                        })
                        return pending ? 'Send signature requests' : 'Submit to HR'
                      })()
                    : selectedSignerIds.length > 0
                      ? `Send for sign-off (${selectedSignerIds.length})`
                      : 'Submit to HR'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Equipment link modal — shown after submitting an equipment-related form */}
      {equipmentLinkModalOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white dark:bg-neutral-800 rounded-2xl shadow-xl w-full max-w-md p-6 space-y-4">
            <h2 className="text-lg font-bold text-neutral-900 dark:text-white">Link to Equipment</h2>
            <p className="text-sm text-neutral-500 dark:text-neutral-400">
              Would you like to assign this inspection to a piece of equipment in the equipment log? It will be available for quick-view on that equipment's detail page.
            </p>

            <div className="space-y-1">
              <label className="text-sm font-medium text-neutral-700 dark:text-neutral-300">Select Equipment</label>
              <select
                className="w-full rounded-xl border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-900 py-2.5 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                value={selectedEquipmentId}
                onChange={(e) => setSelectedEquipmentId(e.target.value)}
                disabled={equipmentLinkLoading}
              >
                {equipmentList.map(eq => (
                  <option key={eq.id} value={eq.id}>
                    {eq.name}{eq.tag ? ` (${eq.tag})` : ''}{eq.site?.name ? ` · ${eq.site.name}` : ''}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <Button variant="secondary" onClick={() => navigate(`/forms/${submissionId}`)} disabled={equipmentLinkLoading}>
                Skip
              </Button>
              <Button
                disabled={equipmentLinkLoading || !selectedEquipmentId}
                onClick={async () => {
                  if (!selectedEquipmentId || !submissionId) return
                  setEquipmentLinkLoading(true)
                  try {
                    await linkInspectionSubmission(selectedEquipmentId, submissionId)
                    navigate(`/equipment/${selectedEquipmentId}`)
                  } catch (e: any) {
                    alert(e?.response?.data?.error || e?.message || 'Failed to link.')
                    setEquipmentLinkLoading(false)
                  }
                }}
              >
                {equipmentLinkLoading ? 'Linking…' : 'Link to Equipment'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
