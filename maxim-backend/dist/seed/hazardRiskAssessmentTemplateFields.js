"use strict";
/**
 * Hazard Risk Assessment templates (six role/trade forms).
 * Each field has a stable `stableId` so `fieldValues` keys stay valid when labels change.
 * UI: TEXT, DATE, CHECKBOX, SIGNATURE, [DROPDOWN], [DROPDOWN][RISK], [INFO], [SECTION].
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.HAZARD_RISK_TEMPLATE_META = exports.HAZARD_RISK_TEMPLATE_KEYS = void 0;
exports.getHazardRiskTemplateFields = getHazardRiskTemplateFields;
exports.getHazardRiskTemplateFieldsWithIds = getHazardRiskTemplateFieldsWithIds;
exports.listHazardRiskTemplates = listHazardRiskTemplates;
exports.HAZARD_RISK_TEMPLATE_KEYS = [
    'office_engineer',
    'general_labourer',
    'office_management',
    'plumber',
    'welder',
    'gas_fitter',
];
exports.HAZARD_RISK_TEMPLATE_META = {
    office_engineer: {
        title: 'Hazard Risk Assessment — Office Engineer',
        shortLabel: 'Office Engineer',
        description: 'Engineering office hazard identification, risk rating, and controls.',
    },
    general_labourer: {
        title: 'Hazard Risk Assessment — General Labourer',
        shortLabel: 'General Labourer',
        description: 'Field / general labour hazard assessment and controls.',
    },
    office_management: {
        title: 'Hazard Risk Assessment — Office Administration',
        shortLabel: 'Office Administration',
        description: 'Office administration hazard identification, risk rating, and controls.',
    },
    plumber: {
        title: 'Hazard Risk Assessment — Plumber',
        shortLabel: 'Plumber',
        description: 'Trade-specific plumbing task hazards, PPE, and controls.',
    },
    welder: {
        title: 'Hazard Risk Assessment — Welder',
        shortLabel: 'Welder',
        description: 'Welding / hot work hazards, ventilation, fire watch, and PPE.',
    },
    gas_fitter: {
        title: 'Hazard Risk Assessment — Gas Fitter',
        shortLabel: 'Gas Fitter',
        description: 'Gas fitting hazards, testing, ventilation, and emergency procedures.',
    },
};
const ROLE_LINES = {
    office_engineer: 'Role: Office Engineer — describe engineering tasks reviewed',
    general_labourer: 'Role: General Labourer — describe work area and tools',
    office_management: 'Role: Office Administration — describe administrative activities reviewed',
    plumber: 'Role: Plumber — describe plumbing work scope',
    welder: 'Role: Welder — describe welding process and location',
    gas_fitter: 'Role: Gas Fitter — describe gas work and testing scope',
};
/** Shared body: general → task/hazards → risk rating → controls → PPE → sign-off. */
function sharedFieldsBeforeRoleExtras(roleLine) {
    return [
        { stableId: 'section_general', type: 'TEXT', label: '[SECTION]General', required: false },
        { stableId: 'date_assessment', type: 'DATE', label: 'Date of assessment', required: true },
        { stableId: 'site_location', type: 'TEXT', label: 'Site / location', required: true },
        { stableId: 'project_job', type: 'TEXT', label: 'Project or job name (optional)', required: false },
        { stableId: 'role_scope', type: 'TEXT', label: roleLine, required: false },
        {
            stableId: 'assessment_performed_by',
            type: 'TEXT',
            label: 'Assessment performed by (name)',
            required: true,
        },
        {
            stableId: 'supervisor_name',
            type: 'TEXT',
            label: 'Supervisor name',
            required: false,
        },
        { stableId: 'section_task', type: 'TEXT', label: '[SECTION]Task and hazards', required: false },
        { stableId: 'task_activity', type: 'TEXT', label: 'Task or activity being assessed', required: true },
        {
            stableId: 'hazards_identified',
            type: 'TEXT',
            label: 'Hazards identified (what could cause harm?)',
            required: true,
        },
        { stableId: 'who_harmed', type: 'TEXT', label: 'Who may be harmed?', required: false },
        { stableId: 'section_risk', type: 'TEXT', label: '[SECTION]Risk rating (matrix)', required: false },
        {
            stableId: 'info_traffic_light',
            type: 'TEXT',
            label: '[INFO]Per Maxim Health & Safety Manual — Hazard Assessment Form: risk score = Likelihood × Severity using the 4×4 chart below (each factor scored 1–4). Categories: 1–3 Low, 4–8 Medium, 9–12 High, 13+ Severe (maximum product 16). Traffic-light fields (Initial / Residual risk) summarise overall band. Prefer elimination and engineering controls before relying on PPE alone.',
            required: false,
        },
        {
            stableId: 'risk_likelihood',
            type: 'TEXT',
            label: '[DROPDOWN][RISK]Likelihood of occurrence::1 — Remote — very unlikely to happen|2 — Possible — a chance it could happen|3 — Probable — could happen|4 — Expected — very likely to happen',
            required: true,
        },
        {
            stableId: 'risk_severity',
            type: 'TEXT',
            label: '[DROPDOWN][RISK]Severity::1 — Minimal — no injury, minor damage|2 — Moderate — first aid, minor illness, property damage up to $1K|3 — Serious — medical aid, lost time, property damage over $5K|4 — Catastrophic — death, critical injury, property damage over $10K',
            required: true,
        },
        {
            stableId: 'risk_initial_level',
            type: 'TEXT',
            label: '[DROPDOWN][RISK]Initial risk (inherent, before additional controls)::Low (Green)|Medium (Amber)|High (Red)|Severe — stop work (Black)',
            required: true,
        },
        {
            stableId: 'controls_existing',
            type: 'TEXT',
            label: 'Existing controls (guarding, procedures, training)',
            required: false,
        },
        {
            stableId: 'controls_additional',
            type: 'TEXT',
            label: 'Additional controls required',
            required: false,
        },
        {
            stableId: 'risk_residual',
            type: 'TEXT',
            label: '[DROPDOWN][RISK]Residual risk (after controls)::Low (Green)|Medium (Amber)|High (Red)|Severe — do not proceed (Black)',
            required: true,
        },
        {
            stableId: 'ppe',
            type: 'TEXT',
            label: 'PPE and equipment required',
            required: false,
        },
        {
            stableId: 'emergency',
            type: 'TEXT',
            label: 'Emergency / spill / rescue considerations',
            required: false,
        },
    ];
}
function signoffFields() {
    return [
        { stableId: 'section_signoff', type: 'TEXT', label: '[SECTION]Sign-off', required: false },
        { stableId: 'name_print', type: 'TEXT', label: 'Name (print)', required: true },
        { stableId: 'signature', type: 'SIGNATURE', label: 'Signature', required: false },
        { stableId: 'date_signoff', type: 'DATE', label: 'Date', required: true },
    ];
}
/** Role / trade–specific prompts (inserted before sign-off). */
const ROLE_SPECIFIC_FIELDS = {
    office_engineer: [
        {
            stableId: 'section_trade',
            type: 'TEXT',
            label: '[SECTION]Engineering / design',
            required: false,
        },
        {
            stableId: 'trade_design_docs',
            type: 'TEXT',
            label: 'Drawings, calculations, or design review references (optional)',
            required: false,
        },
        {
            stableId: 'trade_rams',
            type: 'TEXT',
            label: 'RAMS, permits, or client safety requirements noted (optional)',
            required: false,
        },
    ],
    office_management: [
        {
            stableId: 'section_trade',
            type: 'TEXT',
            label: '[SECTION]Office environment',
            required: false,
        },
        {
            stableId: 'trade_dse',
            type: 'TEXT',
            label: 'DSE / ergonomics, workload, or wellbeing factors (optional)',
            required: false,
        },
    ],
    general_labourer: [
        {
            stableId: 'section_trade',
            type: 'TEXT',
            label: '[SECTION]Site plant & tasks',
            required: false,
        },
        {
            stableId: 'trade_plant',
            type: 'TEXT',
            label: 'Plant, MEWP, or lifting equipment involved (optional)',
            required: false,
        },
        {
            stableId: 'trade_lone',
            type: 'CHECKBOX',
            label: 'Lone working applies to this task',
            required: false,
        },
    ],
    plumber: [
        {
            stableId: 'section_trade',
            type: 'TEXT',
            label: '[SECTION]Plumbing specifics',
            required: false,
        },
        {
            stableId: 'trade_isolation',
            type: 'TEXT',
            label: 'Water / services isolation, lock-out, or draining arrangements (optional)',
            required: false,
        },
        {
            stableId: 'trade_confined',
            type: 'TEXT',
            label: 'Confined space, trenches, or excavation hazards (optional)',
            required: false,
        },
    ],
    welder: [
        {
            stableId: 'section_trade',
            type: 'TEXT',
            label: '[SECTION]Hot work / welding',
            required: false,
        },
        {
            stableId: 'trade_hot_permit',
            type: 'TEXT',
            label: 'Hot work permit reference or authorisation (optional)',
            required: false,
        },
        {
            stableId: 'trade_weld_process',
            type: 'TEXT',
            label: 'Welding process and materials (e.g. MMA, MIG, stainless) (optional)',
            required: false,
        },
        {
            stableId: 'trade_fire_watch',
            type: 'CHECKBOX',
            label: 'Fire watch / extinguisher arrangements in place',
            required: false,
        },
    ],
    gas_fitter: [
        {
            stableId: 'section_trade',
            type: 'TEXT',
            label: '[SECTION]Gas installation work',
            required: false,
        },
        {
            stableId: 'trade_gas_type',
            type: 'TEXT',
            label: 'Gas type, appliance, or installation scope (optional)',
            required: false,
        },
        {
            stableId: 'trade_purge_test',
            type: 'TEXT',
            label: 'Purge, tightness, or commissioning test records (optional)',
            required: false,
        },
        {
            stableId: 'trade_ventilation',
            type: 'TEXT',
            label: 'Ventilation, CO monitoring, or emergency isolation (optional)',
            required: false,
        },
    ],
};
function getHazardRiskTemplateFields(key) {
    if (!exports.HAZARD_RISK_TEMPLATE_KEYS.includes(key))
        return null;
    const k = key;
    const core = sharedFieldsBeforeRoleExtras(ROLE_LINES[k]);
    const extra = ROLE_SPECIFIC_FIELDS[k] ?? [];
    return [...core, ...extra, ...signoffFields()];
}
function getHazardRiskTemplateFieldsWithIds(key) {
    const fields = getHazardRiskTemplateFields(key);
    if (!fields)
        return null;
    return fields.map((f) => ({
        ...f,
        id: `hra_${key}_${f.stableId}`,
    }));
}
function listHazardRiskTemplates() {
    return exports.HAZARD_RISK_TEMPLATE_KEYS.map((key) => ({
        key,
        ...exports.HAZARD_RISK_TEMPLATE_META[key],
    }));
}
