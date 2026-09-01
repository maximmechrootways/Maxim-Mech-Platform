"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.humanReadableFieldLabel = humanReadableFieldLabel;
exports.validateHazardSubmissionFieldValues = validateHazardSubmissionFieldValues;
exports.sanitizeFieldValuesForTemplate = sanitizeFieldValuesForTemplate;
/**
 * Shared validation for hazard risk assessment submissions (mirrors frontend rules).
 */
const hazardRiskAssessmentTemplateFields_1 = require("./hazardRiskAssessmentTemplateFields");
function isSectionLabel(label) {
    return label.trim().startsWith('[SECTION]');
}
function isInfoLabel(label) {
    return label.trim().startsWith('[INFO]');
}
/** User-facing label for errors (dropdowns, plain text). */
function humanReadableFieldLabel(label) {
    let x = label.trim();
    if (x.startsWith('[DROPDOWN]')) {
        x = x.slice('[DROPDOWN]'.length);
        if (x.startsWith('[RISK]'))
            x = x.slice('[RISK]'.length);
        const [q] = x.split('::');
        return (q ?? '').trim() || 'Field';
    }
    return x;
}
function fieldBlocksSubmit(f) {
    if (isSectionLabel(f.label) || isInfoLabel(f.label))
        return false;
    return f.required;
}
/**
 * Returns an error message if invalid, or null if all required inputs are present.
 */
function validateHazardSubmissionFieldValues(templateKey, fieldValues) {
    const fields = (0, hazardRiskAssessmentTemplateFields_1.getHazardRiskTemplateFieldsWithIds)(templateKey);
    if (!fields)
        return 'Invalid template';
    for (const f of fields) {
        if (!fieldBlocksSubmit(f))
            continue;
        const v = String(fieldValues[f.id] ?? '').trim();
        if (!v) {
            return `Please complete: ${humanReadableFieldLabel(f.label)}`;
        }
    }
    return null;
}
/** Keep only keys that belong to the current template (drops stale / forged keys). */
function sanitizeFieldValuesForTemplate(templateKey, fieldValues) {
    const fields = (0, hazardRiskAssessmentTemplateFields_1.getHazardRiskTemplateFieldsWithIds)(templateKey);
    if (!fields)
        return {};
    const allowed = new Set(fields.map((f) => f.id));
    const out = {};
    for (const [k, v] of Object.entries(fieldValues)) {
        if (allowed.has(k))
            out[k] = v;
    }
    return out;
}
