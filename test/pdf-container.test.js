import test from 'node:test'
import assert from 'node:assert/strict'
import { pdfFromJpegs } from '../src/sample-pdf.js'

test('jpeg pages become a readable pdf container', () => {
  const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xd9])
  const pdf = pdfFromJpegs([
    { jpeg, width: 4, height: 2 },
    { jpeg, width: 4, height: 2 },
    { jpeg, width: 4, height: 2 },
  ])
  const latin = Buffer.from(pdf).toString('latin1')
  assert.equal(latin.startsWith('%PDF-1.4'), true)
  assert.equal(latin.includes('/Count 3'), true)
  assert.equal(latin.includes('/Filter /DCTDecode'), true)
  const marker = latin.lastIndexOf('startxref')
  const offset = Number(latin.slice(marker).match(/startxref\n(\d+)/)[1])
  assert.equal(latin.slice(offset, offset + 4), 'xref')
  assert.equal(latin.trimEnd().endsWith('%%EOF'), true)
})
