"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = __importDefault(require("node:test"));
const strict_1 = __importDefault(require("node:assert/strict"));
const toolboxTopicService_1 = require("../services/toolboxTopicService");
(0, node_test_1.default)('extractToolboxTopicsFromHtml returns unique PDF topics', () => {
    const html = `
    <html>
      <body>
        <a href="/resources/pdfs/talk-one.pdf">Talk One</a>
        <a href="https://www.ihsa.ca/resources/pdfs/talk-two.pdf">Talk Two</a>
        <a href="/resources/pdfs/talk-one.pdf">Duplicate Talk One</a>
        <a href="/resources/not-a-pdf.docx">Ignore Me</a>
      </body>
    </html>
  `;
    const result = (0, toolboxTopicService_1.extractToolboxTopicsFromHtml)(html, 'https://www.ihsa.ca/resources/safetytalks.aspx');
    strict_1.default.equal(result.length, 2);
    strict_1.default.ok(result.every((item) => item.sourcePdfUrl.toLowerCase().endsWith('.pdf')));
    strict_1.default.equal(new Set(result.map((item) => item.sourcePdfUrl.toLowerCase())).size, 2);
    strict_1.default.ok(result.some((item) => item.title === 'Talk Two'));
});
(0, node_test_1.default)('buildFallbackSummary creates summary and key points', () => {
    const content = `
    Workers should inspect ladders before use. Use three points of contact.
    Secure ladders on stable ground. Do not overreach while climbing.
    Report damaged ladders to the supervisor immediately.
  `;
    const result = (0, toolboxTopicService_1.buildFallbackSummary)(content);
    strict_1.default.ok(result.summary.length > 0);
    strict_1.default.ok(Array.isArray(result.keyPoints));
    strict_1.default.ok(result.keyPoints.length > 0);
});
