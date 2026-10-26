import test from 'node:test'
import assert from 'node:assert/strict'
import { computeBase, parseJoinInput, parseRoute } from '../src/router.js'

test('base path keeps the repository prefix', () => {
  assert.equal(computeBase('/'), '/')
  assert.equal(computeBase('/NikoPDF/'), '/NikoPDF/')
  assert.equal(computeBase('/NikoPDF/index.html'), '/NikoPDF/')
  assert.equal(computeBase('/NikoPDF/abcd2345/host'), '/NikoPDF/')
  assert.equal(computeBase('/abcd2345/view'), '/')
})

test('routes split host and view', () => {
  assert.deepEqual(parseRoute('/NikoPDF/abcd2345/host', '/NikoPDF/'), {
    name: 'room',
    roomId: 'abcd2345',
    role: 'host',
  })
  assert.deepEqual(parseRoute('/abcd2345/view', '/'), {
    name: 'room',
    roomId: 'abcd2345',
    role: 'view',
  })
  assert.deepEqual(parseRoute('/NikoPDF/', '/NikoPDF/'), { name: 'home' })
  assert.equal(parseRoute('/NikoPDF/nope', '/NikoPDF/').invalid, true)
})

test('join input accepts a room id or a full url', () => {
  assert.deepEqual(parseJoinInput('ABCD2345'), { roomId: 'abcd2345', role: 'view' })
  assert.deepEqual(parseJoinInput('https://makimaki510151.github.io/NikoPDF/abcd2345/host'), {
    roomId: 'abcd2345',
    role: 'host',
  })
  assert.equal(parseJoinInput('abc'), null)
  assert.equal(parseJoinInput('https://example.com/not-a-room'), null)
})
