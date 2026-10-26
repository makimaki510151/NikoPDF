import test from 'node:test'
import assert from 'node:assert/strict'
import { cleanFileName, cleanText, createRoomId, isPdf, isRoomId, normalizeColor } from '../src/text.js'

test('cleanText drops controls and limits length', () => {
  assert.equal(cleanText('  あいう\nえお  ', 10), 'あいう えお')
  assert.equal(cleanText('abc\u0000def', 10), 'abcdef')
  assert.equal(cleanText('あいうえおかきくけこさしす', 5), 'あいうえお')
  assert.equal(cleanText(null, 5), '')
})

test('file names lose directories', () => {
  assert.equal(cleanFileName('C:\\slides\\発表.pdf'), '発表.pdf')
  assert.equal(cleanFileName('../secret.pdf'), 'secret.pdf')
})

test('room ids are eight unambiguous characters', () => {
  const id = createRoomId()
  assert.equal(isRoomId(id), true)
  assert.equal(/[0o1il]/.test(id), false)
})

test('pdf magic and colors', () => {
  assert.equal(isPdf(new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d])), true)
  assert.equal(isPdf(new Uint8Array([1, 2, 3, 4, 5])), false)
  assert.equal(normalizeColor('#ff5b5b'), '#ff5b5b')
  assert.equal(normalizeColor('red'), '#ffffff')
})
