import { test } from 'node:test'
import assert from 'node:assert/strict'

function normalizeFolderName(name: string): string {
    return name.trim().replace(/\s+/g, ' ')
}

test('normalizeFolderName trims and collapses whitespace', () => {
    assert.equal(normalizeFolderName('  Transmittals  '), 'Transmittals')
    assert.equal(normalizeFolderName('Panel   Docs'), 'Panel Docs')
})

test('normalizeFolderName rejects empty after trim', () => {
    assert.equal(normalizeFolderName('   '), '')
})
