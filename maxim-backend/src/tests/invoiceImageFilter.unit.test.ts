import test from 'node:test'
import assert from 'node:assert/strict'
import {
    classifyInvoiceImageAttachment,
    imageTextHasFinancialContent,
    isImageAttachmentType,
    readImageDimensions,
} from '../lib/invoiceImageFilter'

function makePng(width: number, height: number): Buffer {
    const buffer = Buffer.alloc(33)
    buffer[0] = 0x89
    buffer[1] = 0x50
    buffer[2] = 0x4e
    buffer[3] = 0x47
    buffer[4] = 0x0d
    buffer[5] = 0x0a
    buffer[6] = 0x1a
    buffer[7] = 0x0a
    buffer.write('IHDR', 12, 'ascii')
    buffer.writeUInt32BE(width, 16)
    buffer.writeUInt32BE(height, 20)
    return buffer
}

test('isImageAttachmentType detects image mime types and extensions', () => {
    assert.equal(isImageAttachmentType('image/png', 'logo.png'), true)
    assert.equal(isImageAttachmentType('application/octet-stream', 'photo.JPG'), true)
    assert.equal(isImageAttachmentType('application/pdf', 'invoice.pdf'), false)
})

test('readImageDimensions reads PNG width/height from IHDR', () => {
    const dims = readImageDimensions(makePng(1700, 2200))
    assert.deepEqual(dims, { width: 1700, height: 2200 })
})

test('imageTextHasFinancialContent flags money amounts and finance keywords', () => {
    assert.equal(imageTextHasFinancialContent('Total Amount Due: 1,234.56'), true)
    assert.equal(imageTextHasFinancialContent('Invoice Subtotal and HST'), true)
    assert.equal(imageTextHasFinancialContent('Maxim Mechanical — Quality You Can Trust'), false)
})

test('classifyInvoiceImageAttachment accepts an image with invoice content', () => {
    const decision = classifyInvoiceImageAttachment({
        buffer: makePng(1700, 2200),
        ocrText: 'INVOICE\nInvoice No. 28651\nBalance Due $587.60',
    })
    assert.equal(decision.isLikelyInvoice, true)
    assert.equal(decision.reason, 'financial_content')
})

test('classifyInvoiceImageAttachment rejects a small logo with no financial text', () => {
    const decision = classifyInvoiceImageAttachment({
        buffer: makePng(220, 80),
        ocrText: '',
    })
    assert.equal(decision.isLikelyInvoice, false)
    assert.equal(decision.reason, 'image_too_small_for_document')
})

test('classifyInvoiceImageAttachment rejects a readable logo without financial signals', () => {
    const decision = classifyInvoiceImageAttachment({
        buffer: makePng(900, 300),
        ocrText: 'Maxim Mechanical Heating Cooling Refrigeration Serving Ontario Since 1998',
    })
    assert.equal(decision.isLikelyInvoice, false)
    assert.equal(decision.reason, 'image_text_not_financial')
})

test('classifyInvoiceImageAttachment keeps large unreadable images as possible scans', () => {
    const decision = classifyInvoiceImageAttachment({
        buffer: makePng(1654, 2339),
        ocrText: '',
    })
    assert.equal(decision.isLikelyInvoice, true)
    assert.equal(decision.reason, 'large_image_possible_scan')
})
