"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.INTERIM2_PM_TEMPLATE_NAME = void 0;
exports.buildInterim2PmChecklistFields = buildInterim2PmChecklistFields;
const INTERIM2_PM_PAGE_TITLES = [
    { pageNum: 1, title: 'DEF SYSTEM - TANKS' },
    { pageNum: 2, title: 'DEF SYSTEM - VALVES' },
    { pageNum: 3, title: 'DEF SYSTEM - FILTERS' },
    { pageNum: 4, title: 'DEF SYSTEM - DEF DISPENSERS' },
    { pageNum: 5, title: 'DEF SYSTEM - PIPING' },
    { pageNum: 6, title: 'DEF SYSTEM - FLOW METERS' },
    { pageNum: 7, title: 'DEF SYSTEM - PRESSURE & TEMPERATURE TRANSDUCERS' },
    { pageNum: 8, title: 'DEF SYSTEM - PUMPS' },
    { pageNum: 9, title: 'SANDING SYSTEM - SAND DISPENSERS / PUMPS' },
    { pageNum: 10, title: 'SANDING SYSTEM - SAND DISPENSERS / PUMPS (continued)' },
    { pageNum: 11, title: 'SANDING SYSTEM - SILO DUST COLLECTOR' },
    { pageNum: 12, title: 'WWF SYSTEM - TANKS' },
    { pageNum: 13, title: 'WWF SYSTEM - VALVES' },
    { pageNum: 14, title: 'WWF SYSTEM - FILTERS' },
    { pageNum: 15, title: 'WWF SYSTEM - DISPENSERS' },
    { pageNum: 16, title: 'WWF SYSTEM - PIPING' },
    { pageNum: 17, title: 'WWF SYSTEM - FLOW METERS' },
    { pageNum: 18, title: 'WWF SYSTEM - PRESSURE & TEMPERATURE TRANSDUCERS' },
    { pageNum: 19, title: 'WWF SYSTEM - PUMPS' },
];
exports.INTERIM2_PM_TEMPLATE_NAME = 'INTERIM 2 PM Checklist (Site Copy V1.1)';
function buildInterim2PmChecklistFields() {
    const fields = [
        { type: 'TEXT', label: '[SECTION]Header', required: false },
        { type: 'TEXT', label: '[JOB_DROPDOWN]Project/Site', required: false },
        { type: 'TEXT', label: 'Building/Location', required: false },
        { type: 'TEXT', label: 'Version', required: false },
        { type: 'TEXT', label: 'Date Modified', required: false },
        { type: 'DATE', label: 'Date', required: false },
    ];
    for (const page of INTERIM2_PM_PAGE_TITLES) {
        fields.push({
            type: 'TEXT',
            label: `[SECTION]Page ${page.pageNum} — ${page.title}`,
            required: false,
        });
        fields.push({
            type: 'TEXT',
            label: `Interim 2 PM Matrix — Page ${page.pageNum}`,
            required: false,
        });
    }
    fields.push({ type: 'TEXT', label: '[SECTION]Sign-Off', required: false }, {
        type: 'TEXT',
        label: 'Review Note',
        required: false,
    }, { type: 'TEXT', label: 'Inspected By', required: false }, { type: 'TEXT', label: 'Completed By', required: false }, { type: 'DATE', label: 'Completion Date', required: false });
    return fields;
}
