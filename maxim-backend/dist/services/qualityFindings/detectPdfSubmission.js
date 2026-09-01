"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizeChecklistValueForFinding = normalizeChecklistValueForFinding;
exports.isWashroomItemCheckboxLabel = isWashroomItemCheckboxLabel;
exports.extractLinkedJobIdFromFieldValues = extractLinkedJobIdFromFieldValues;
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
