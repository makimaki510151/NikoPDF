import puppeteer from 'puppeteer-core'
import { build } from './build.js'
import { startServer } from './server.js'

const port = Number(process.env.PORT || 4187)
await build({ dev: true })
const server = await startServer({ port })
const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome-stable',
  headless: true,
  protocolTimeout: 20000,
  args: [
    '--no-sandbox',
    '--disable-dev-shm-usage',
    '--disable-background-timer-throttling',
    '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding',
  ],
})

try {
  const log = (message) => console.log(message)
  const host = await browser.newPage()
  await host.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1 })
  const errors = []
  host.on('pageerror', (error) => errors.push(`host ${error.message}`))

  log('home')
  await host.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'domcontentloaded' })
  await host.waitForSelector('#create')
  log('create')
  await host.click('#create')
  await host.waitForFunction(() => location.pathname.endsWith('/host'))
  const viewUrl = await host.$eval('#share-url', (node) => node.textContent.trim())
  log(viewUrl)
  if (!viewUrl.endsWith('/view')) throw new Error(`閲覧URLが違います: ${viewUrl}`)
  log('sample')
  await host.click('[data-action="sample"]')
  await waitReady(host, '1')
  log('host ready')

  const view = await browser.newPage()
  await view.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1 })
  view.on('pageerror', (error) => errors.push(`view ${error.message}`))
  await view.goto(viewUrl, { waitUntil: 'domcontentloaded' })
  await waitReady(view, '1')
  log('view ready')
  const before = await fingerprint(view)

  await host.bringToFront()
  await host.evaluate(() => document.querySelector('[data-action="next"]').click())
  await waitReady(host, '2')
  await waitReady(view, '2')
  const after = await fingerprint(view)
  if (before === after) throw new Error('閲覧側のページ画像が変わっていません')

  const comment = `同期${Date.now()}`
  await view.bringToFront()
  await view.evaluate((text) => {
    document.querySelector('#name').value = '閲覧A'
    document.querySelector('#text').value = text
    document.querySelector('#composer').requestSubmit()
  }, comment)
  await host.bringToFront()
  await waitForText(host, '#history-list', comment)
  await waitForText(view, '#history-list', comment)

  const motion = await host.evaluate((text) => {
    const bullet = [...document.querySelectorAll('.bullet')].find((node) => node.textContent.includes(text))
    const frames = bullet?.getAnimations?.()[0]?.effect?.getKeyframes?.() || []
    return frames.map((frame) => String(frame.transform))
  }, comment)
  const start = Number(String(motion[0] || '').match(/translateX\(([-\d.]+)px\)/)?.[1])
  const end = Number(String(motion[1] || '').match(/translateX\(([-\d.]+)px\)/)?.[1])
  if (!(start > 200 && end < 0)) throw new Error(`コメントが右から流れていません: ${JSON.stringify(motion)}`)
  const copies = await host.$$eval('.bullet', (nodes, text) => (
    nodes.filter((node) => node.textContent.includes(text)).length
  ), comment)
  if (copies !== 1) throw new Error(`コメントが重複しています: ${copies}`)

  await host.evaluate(() => {
    document.querySelector('#text').value = 'ホストから'
    document.querySelector('#composer').requestSubmit()
  })
  await waitForText(view, '#history-list', 'ホストから')
  await host.screenshot({ path: '/tmp/nikopdf-host.png' })
  await view.bringToFront()
  await view.screenshot({ path: '/tmp/nikopdf-view.png' })
  if (errors.length) throw new Error(errors.join('\n'))
  console.log(JSON.stringify({ ok: true, viewUrl, motion }))
} catch (error) {
  console.error(error)
  process.exitCode = 1
} finally {
  await browser.close()
  server.close()
}

async function waitReady(page, pageNumber) {
  await page.bringToFront()
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const state = await page.evaluate(() => ({
      page: document.querySelector('#holder')?.dataset.page || '',
      ready: document.querySelector('#holder')?.dataset.ready || '',
      input: document.querySelector('#page-input')?.value || '',
    }))
    if (state.ready === '1' && state.page === pageNumber && state.input === pageNumber) return
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  throw new Error(`${pageNumber} ページの描画が終わりません`)
}

async function waitForText(page, selector, text) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const found = await page.evaluate((sel, expected) => (
      document.querySelector(sel)?.textContent.includes(expected) || false
    ), selector, text)
    if (found) return
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  throw new Error(`${text} が見つかりません`)
}

async function fingerprint(page) {
  await page.bringToFront()
  return page.evaluate(() => {
    const canvas = document.querySelector('#holder canvas')
    const context = canvas.getContext('2d')
    const y = Math.floor(canvas.height * 0.3)
    const data = context.getImageData(0, y, Math.min(canvas.width, 480), 50).data
    let hash = 0
    for (let index = 0; index < data.length; index += 4) {
      hash = (hash * 33 + data[index] + data[index + 1] + data[index + 2]) >>> 0
    }
    return hash
  })
}
