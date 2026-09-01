"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = require("node:test");
const strict_1 = __importDefault(require("node:assert/strict"));
function normalizeFolderName(name) {
    return name.trim().replace(/\s+/g, ' ');
}
(0, node_test_1.test)('normalizeFolderName trims and collapses whitespace', () => {
    strict_1.default.equal(normalizeFolderName('  Transmittals  '), 'Transmittals');
    strict_1.default.equal(normalizeFolderName('Panel   Docs'), 'Panel Docs');
});
(0, node_test_1.test)('normalizeFolderName rejects empty after trim', () => {
    strict_1.default.equal(normalizeFolderName('   '), '');
});
