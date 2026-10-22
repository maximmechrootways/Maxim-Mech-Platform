"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizeChecklistValueForFinding = normalizeChecklistValueForFinding;
exports.isWashroomItemCheckboxLabel = isWashroomItemCheckboxLabel;
exports.extractLinkedJobIdFromFieldValues = extractLinkedJobIdFromFieldValues;
exports.isStandardsTriStateChecklistTemplateName = isStandardsTriStateChecklistTemplateName;
exports.normalizeStandardsChecklistChoiceForAutoApprove = normalizeStandardsChecklistChoiceForAutoApprove;
exports.shouldAutoApproveStandardsChecklist = shouldAutoApproveStandardsChecklist;
exports.detectPdfChecklistSubstandard = detectPdfChecklistSubstandard;
const LINKED_JOB_FIELD_KEY = '__jobId__';
/** Align with maxim-frontend FormFill / FormReviewPdf checklist normalization (Phase 0: substandard only). */
function normalizeChecklistValueForFinding(raw) {
    const s = String(raw ?? '')
        .trim()
        .toLowerCase()
        .replace(/\u00a0/g, ' ')
        .replace(/\s+/g, ' ');
    if (s === 'substandard' || s === 'sub-standard' || s === 'sub standard')
        return 'substandard';
    return null;
}
/**
 * Washroom inspection rows use Yes/No/N/A; the UI maps "Substandard" semantics to stored `no`
 * (see FormFill `normalizeWashroomChecklistChoice` — substandard → no). Detect via field label prefix.
 */
function isWashroomItemCheckboxLabel(label) {
    return String(label ?? '').trimStart().startsWith('[WASHROOM_ITEM]');
}
function isWashroomSubstandardStoredValue(raw) {
    const s = String(raw ?? '').trim().toLowerCase();
    return s === 'no';
}
function extractLinkedJobIdFromFieldValues(fieldValues) {
    const v = fieldValues?.[LINKED_JOB_FIELD_KEY];
    if (typeof v === 'string' && v.trim())
        return v.trim();
    return undefined;
}
/** Templates that use Standard / Substandard / N/A in FormFill (not Hot Work yes/no). */
function isStandardsTriStateChecklistTemplateName(name) {
    const n = String(name ?? '');
    return (/weekly\s*project\s*inspection/i.test(n) ||
        // Match "Fall Arrest Inspection Checklist" and shorter names like "Fall Arrest Inspection"
        /fall\s*arrest\s*inspection(\s*checklist)?/i.test(n) ||
        /power\s*(and|&|\/)?\s*elevating/i.test(n) ||
        (/equipment\s*inspection/i.test(n) && !/hot\s*work\s*permit/i.test(n)));
}
/**
 * Normalize checklist stored values for auto-approve (standards tri-state forms only).
 * Pass = standard | na (and legacy true → standard). Fail/blank = anything else.
 */
function normalizeStandardsChecklistChoiceForAutoApprove(raw) {
    const s = String(raw ?? '')
        .trim()
        .toLowerCase()
        .replace(/\u00a0/g, ' ')
        .replace(/\s+/g, ' ');
    if (!s)
        return 'blank';
    if (s === 'standard' || s === 'true')
        return 'standard';
    if (s === 'na' || s === 'n/a' || s === 'missing')
        return 'na';
    return 'fail';
}
/**
 * Auto-approve when every checklist CHECKBOX on a standards tri-state template
 * is Up to standard (`standard`) or N/A (`na`). Blank or Substandard → not auto-approve.
 * Non-standards templates (Hot Work, washroom, plain forms) → false (no change).
 */
function shouldAutoApproveStandardsChecklist(opts) {
    if (!isStandardsTriStateChecklistTemplateName(opts.templateName))
        return false;
    const seenFieldIds = new Set();
    let checklistCount = 0;
    for (const f of opts.fields) {
        const typeNorm = String(f.type ?? '').trim().toUpperCase();
        if (typeNorm !== 'CHECKBOX')
            continue;
        if (seenFieldIds.has(f.id))
            continue;
        seenFieldIds.add(f.id);
        checklistCount += 1;
        const choice = normalizeStandardsChecklistChoiceForAutoApprove(opts.fieldValues[f.id]);
        if (choice !== 'standard' && choice !== 'na')
            return false;
    }
    return checklistCount > 0;
}
function detectPdfChecklistSubstandard(opts) {
    const linkedJobId = extractLinkedJobIdFromFieldValues(opts.fieldValues);
    const drafts = [];
    const standardsTriStateTemplate = isStandardsTriStateChecklistTemplateName(opts.templateName);
    /** One finding per PDF field id (templates can list the same control twice after edits/imports). */
    const seenFieldIds = new Set();
    for (const f of opts.fields) {
        const typeNorm = String(f.type ?? '').trim().toUpperCase();
        if (typeNorm !== 'CHECKBOX')
            continue;
        if (seenFieldIds.has(f.id))
            continue;
        const raw = opts.fieldValues[f.id];
        const isSubstandard = normalizeChecklistValueForFinding(raw) === 'substandard' ||
            (isWashroomItemCheckboxLabel(f.label) && isWashroomSubstandardStoredValue(raw)) ||
            // Legacy / mis-synced saves: some builds stored "Substandard" UI as `no` for standards-style forms only.
            (standardsTriStateTemplate &&
                !isWashroomItemCheckboxLabel(f.label) &&
                String(raw ?? '').trim().toLowerCase() === 'no');
        if (!isSubstandard)
            continue;
        seenFieldIds.add(f.id);
        drafts.push({
            ruleCode: 'checklist_substandard',
            ruleVersion: 1,
            templateId: opts.templateId,
            templateNameSnapshot: opts.templateName,
            fieldId: f.id,
            fieldLabelSnapshot: String(f.label ?? '').slice(0, 500),
            valueSnapshot: String(raw ?? '').slice(0, 500),
            linkedJobId,
        });
    }
    return drafts;
}
