import test from 'node:test'
import assert from 'node:assert/strict'
import { buildFallbackSummary, extractToolboxTopicsFromHtml } from '../services/toolboxTopicService'

test('extractToolboxTopicsFromHtml returns unique PDF topics', () => {
  const html = `
    <html>
      <body>
        <a href="/resources/pdfs/talk-one.pdf">Talk One</a>
        <a href="https://www.ihsa.ca/resources/pdfs/talk-two.pdf">Talk Two</a>
        <a href="/resources/pdfs/talk-one.pdf">Duplicate Talk One</a>
        <a href="/resources/not-a-pdf.docx">Ignore Me</a>
      </body>
    </html>
  `
  const result = extractToolboxTopicsFromHtml(html, 'https://www.ihsa.ca/resources/safetytalks.aspx')
  assert.equal(result.length, 2)
  assert.ok(result.every((item) => item.sourcePdfUrl.toLowerCase().endsWith('.pdf')))
  assert.equal(new Set(result.map((item) => item.sourcePdfUrl.toLowerCase())).size, 2)
  assert.ok(result.some((item) => item.title === 'Talk Two'))
})

test('buildFallbackSummary creates summary and key points', () => {
  const content = `
    Workers should inspect ladders before use. Use three points of contact.
    Secure ladders on stable ground. Do not overreach while climbing.
    Report damaged ladders to the supervisor immediately.
  `
  const result = buildFallbackSummary(content)
  assert.ok(result.summary.length > 0)
  assert.ok(Array.isArray(result.keyPoints))
  assert.ok(result.keyPoints.length > 0)
})
