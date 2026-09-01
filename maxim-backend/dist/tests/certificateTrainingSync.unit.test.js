"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = __importDefault(require("node:test"));
const strict_1 = __importDefault(require("node:assert/strict"));
const certificateTrainingSync_1 = require("../services/certificateTrainingSync");
(0, node_test_1.default)('resolveTrainingExpirationDate returns null for empty values', () => {
    strict_1.default.equal((0, certificateTrainingSync_1.resolveTrainingExpirationDate)(undefined), null);
    strict_1.default.equal((0, certificateTrainingSync_1.resolveTrainingExpirationDate)(null), null);
    strict_1.default.equal((0, certificateTrainingSync_1.resolveTrainingExpirationDate)(''), null);
    strict_1.default.equal((0, certificateTrainingSync_1.resolveTrainingExpirationDate)('   '), null);
});
(0, node_test_1.default)('resolveTrainingExpirationDate trims valid dates', () => {
    strict_1.default.equal((0, certificateTrainingSync_1.resolveTrainingExpirationDate)(' 2026-12-31 '), '2026-12-31');
    strict_1.default.equal((0, certificateTrainingSync_1.resolveTrainingExpirationDate)('2027-01-15'), '2027-01-15');
});
