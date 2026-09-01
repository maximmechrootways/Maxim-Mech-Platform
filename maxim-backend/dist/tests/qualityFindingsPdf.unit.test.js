"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = __importDefault(require("node:test"));
const strict_1 = __importDefault(require("node:assert/strict"));
const detectPdfSubmission_1 = require("../services/qualityFindings/detectPdfSubmission");
(0, node_test_1.default)('normalizeChecklistValueForFinding only substandard', () => {
    strict_1.default.equal((0, detectPdfSubmission_1.normalizeChecklistValueForFinding)('substandard'), 'substandard');
    strict_1.default.equal((0, detectPdfSubmission_1.normalizeChecklistValueForFinding)('SubStandard'), 'substandard');
    strict_1.default.equal((0, detectPdfSubmission_1.normalizeChecklistValueForFinding)('  sub-standard  '), 'substandard');
    strict_1.default.equal((0, detectPdfSubmission_1.normalizeChecklistValueForFinding)('no'), null);
    strict_1.default.equal((0, detectPdfSubmission_1.normalizeChecklistValueForFinding)('standard'), null);
});
(0, node_test_1.default)('detectPdfChecklistSubstandard ignores duplicate template field rows (same id)', () => {
    const fields = [
        { id: 'b', type: 'CHECKBOX', label: 'Item B' },
        { id: 'b', type: 'CHECKBOX', label: 'Item B' },
    ];
    const out = (0, detectPdfSubmission_1.detectPdfChecklistSubstandard)({
        templateId: 'tpl',
        templateName: 'Weekly Project Inspection',
        fields,
        fieldValues: { b: 'substandard' },
    });
    strict_1.default.equal(out.length, 1);
    strict_1.default.equal(out[0].fieldId, 'b');
});
(0, node_test_1.default)('detectPdfChecklistSubstandard flags CHECKBOX substandard only', () => {
    const fields = [
        { id: 'a', type: 'CHECKBOX', label: 'Item A' },
        { id: 'b', type: 'CHECKBOX', label: 'Item B' },
        { id: 't', type: 'TEXT', label: 'Note' },
    ];
    const fieldValues = { a: 'standard', b: 'substandard', t: 'substandard', __jobId__: 'job-1' };
    const out = (0, detectPdfSubmission_1.detectPdfChecklistSubstandard)({
        templateId: 'tpl',
        templateName: 'T',
        fields,
        fieldValues,
    });
    strict_1.default.equal(out.length, 1);
    strict_1.default.equal(out[0].fieldId, 'b');
    strict_1.default.equal(out[0].ruleCode, 'checklist_substandard');
    strict_1.default.equal(out[0].linkedJobId, 'job-1');
});
(0, node_test_1.default)('detectPdfChecklistSubstandard ignores non-checkbox', () => {
    const fields = [{ id: 't', type: 'TEXT', label: 'X' }];
    const out = (0, detectPdfSubmission_1.detectPdfChecklistSubstandard)({
        templateId: 'tpl',
        templateName: 'T',
        fields,
        fieldValues: { t: 'substandard' },
    });
    strict_1.default.equal(out.length, 0);
});
(0, node_test_1.default)('detectPdfChecklistSubstandard treats washroom [WASHROOM_ITEM] CHECKBOX no as finding', () => {
    const fields = [
        {
            id: 'w1',
            type: 'CHECKBOX',
            label: '[WASHROOM_ITEM]Floors::Clean, without dirt',
        },
        { id: 'hw', type: 'CHECKBOX', label: 'Fire watch assigned?' },
    ];
    const out = (0, detectPdfSubmission_1.detectPdfChecklistSubstandard)({
        templateId: 'tpl',
        templateName: 'Washroom',
        fields,
        fieldValues: { w1: 'no', hw: 'no' },
    });
    strict_1.default.equal(out.length, 1);
    strict_1.default.equal(out[0].fieldId, 'w1');
});
(0, node_test_1.default)('detectPdfChecklistSubstandard treats checkbox no as substandard on Fall Arrest template (legacy storage)', () => {
    const fields = [{ id: 'x', type: 'CHECKBOX', label: 'Full Body Harness:Webbing' }];
    const out = (0, detectPdfSubmission_1.detectPdfChecklistSubstandard)({
        templateId: 'tpl',
        templateName: 'Fall Arrest Inspection Checklist',
        fields,
        fieldValues: { x: 'no' },
    });
    strict_1.default.equal(out.length, 1);
    strict_1.default.equal(out[0].fieldId, 'x');
});
(0, node_test_1.default)('detectPdfChecklistSubstandard treats no as substandard when template omits Checklist suffix', () => {
    const fields = [{ id: 'x', type: 'CHECKBOX', label: 'Full Body Harness:Webbing' }];
    const out = (0, detectPdfSubmission_1.detectPdfChecklistSubstandard)({
        templateId: 'tpl',
        templateName: 'Fall Arrest Inspection',
        fields,
        fieldValues: { x: 'no' },
    });
    strict_1.default.equal(out.length, 1);
});
(0, node_test_1.default)('detectPdfChecklistSubstandard does not treat no as substandard on Hot Work permit', () => {
    const fields = [{ id: 'x', type: 'CHECKBOX', label: 'Fire watch assigned?' }];
    const out = (0, detectPdfSubmission_1.detectPdfChecklistSubstandard)({
        templateId: 'tpl',
        templateName: 'Hot Work Permit',
        fields,
        fieldValues: { x: 'no' },
    });
    strict_1.default.equal(out.length, 0);
});
(0, node_test_1.default)('detectPdfChecklistSubstandard does not treat plain CHECKBOX no as finding (non-washroom)', () => {
    const fields = [{ id: 'x', type: 'CHECKBOX', label: 'Some question' }];
    const out = (0, detectPdfSubmission_1.detectPdfChecklistSubstandard)({
        templateId: 'tpl',
        templateName: 'Other',
        fields,
        fieldValues: { x: 'no' },
    });
    strict_1.default.equal(out.length, 0);
});
