"use strict";
/**
 * Azure Document Intelligence OCR extractor.
 * RAG pipeline — replaces pdf-parse for scanned image PDFs (MSDS/SDS books).
 *
 * Uses the prebuilt-read model which performs true OCR on each page.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.extractPagesWithOCR = extractPagesWithOCR;
const ai_form_recognizer_1 = require("@azure/ai-form-recognizer");
let _client = null;
function getClient() {
    if (_client)
        return _client;
    const endpoint = process.env.AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT;
    const key = process.env.AZURE_DOCUMENT_INTELLIGENCE_KEY;
    if (!endpoint || !key) {
        throw new Error('AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT and AZURE_DOCUMENT_INTELLIGENCE_KEY must be set for OCR extraction');
    }
    _client = new ai_form_recognizer_1.DocumentAnalysisClient(endpoint, new ai_form_recognizer_1.AzureKeyCredential(key));
    return _client;
}
/**
 * Extracts text from a PDF buffer using Azure Document Intelligence OCR.
 * Works on scanned and text-based PDFs. Returns text grouped by page number.
 */
async function extractPagesWithOCR(buffer) {
    const client = getClient();
    const sizeMB = (buffer.length / 1024 / 1024).toFixed(1);
    console.log(`[OCR] Submitting ${sizeMB}MB PDF to Azure Document Intelligence`);
    const poller = await client.beginAnalyzeDocument('prebuilt-read', buffer);
    const result = await poller.pollUntilDone();
    if (!result || !result.pages || result.pages.length === 0) {
        throw new Error('[OCR] Azure Document Intelligence returned no pages');
    }
    console.log(`[OCR] Extracted ${result.pages.length} pages`);
    const pages = result.pages.map((page) => {
        const lines = page.lines?.map((line) => line.content).join(' ') ?? '';
        return {
            page: page.pageNumber,
            text: lines.replace(/\s+/g, ' ').trim(),
        };
    });
    // Filter out pages with no meaningful text (blank cover pages, etc.)
    return pages.filter((p) => p.text.length > 20);
}
