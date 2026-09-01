"use strict";
/**
 * Critical Task Inventory & Risk Register — native FormFill fields (aligns with reference PDF V.2).
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildCriticalTaskInventoryRiskRegisterFields = buildCriticalTaskInventoryRiskRegisterFields;
const TASK_SLOTS = 8;
function buildCriticalTaskInventoryRiskRegisterFields() {
    const fields = [
        { type: 'TEXT', label: '[SECTION]Register header', required: false },
        { type: 'DATE', label: 'Register date', required: true },
        { type: 'TEXT', label: 'Document version / reference (e.g. V.2)', required: false },
        { type: 'TEXT', label: 'Organization / company', required: true },
        { type: 'TEXT', label: 'Project / site name', required: true },
        { type: 'TEXT', label: 'Prepared by (name)', required: true },
        { type: 'TEXT', label: 'Department / area', required: false },
        {
            type: 'TEXT',
            label: 'Instructions: Identify critical tasks, hazards, and controls. Align entries with the reference PDF. Link this submission to a job using the selector above.',
            required: false,
        },
    ];
    for (let i = 1; i <= TASK_SLOTS; i++) {
        fields.push({ type: 'TEXT', label: `[SECTION]Critical task ${i}`, required: false });
        fields.push({ type: 'TEXT', label: `Task ${i} — Task / activity name`, required: false });
        fields.push({ type: 'TEXT', label: `Task ${i} — Procedure / JHA / SOP reference`, required: false });
        fields.push({ type: 'TEXT', label: `Task ${i} — Hazards & risk factors`, required: false });
        fields.push({ type: 'TEXT', label: `Task ${i} — Engineering & administrative controls`, required: false });
        fields.push({ type: 'TEXT', label: `Task ${i} — PPE / barriers`, required: false });
        fields.push({
            type: 'TEXT',
            label: `[DROPDOWN] Task ${i} — Residual risk::Low|Medium|High|Extreme`,
            required: false,
        });
        fields.push({ type: 'DATE', label: `Task ${i} — Last review / verification date`, required: false });
        fields.push({ type: 'TEXT', label: `Task ${i} — Owner / responsible person`, required: false });
        fields.push({ type: 'TEXT', label: `Task ${i} — Notes / follow-up actions`, required: false });
    }
    fields.push({ type: 'TEXT', label: '[SECTION]Summary & register maintenance', required: false }, { type: 'TEXT', label: 'Overall register notes (change history, communication)', required: false }, { type: 'DATE', label: 'Next review date (register)', required: false }, {
        type: 'CHECKBOX',
        label: 'Changes communicated to affected workers (where required)',
        required: false,
    }, { type: 'TEXT', label: '[SECTION]Approval (optional)', required: false }, { type: 'TEXT', label: 'Approved by (name)', required: false }, { type: 'SIGNATURE', label: 'Approved by — Signature', required: false }, { type: 'DATE', label: 'Approval date', required: false });
    return fields;
}
