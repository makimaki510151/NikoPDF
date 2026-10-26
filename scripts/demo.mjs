import puppeteer from 'puppeteer-core'

const browser = await puppeteer.launch({
  headless: false,
  executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome-stable',
  defaultViewport: null,
  args: [
    '--no-sandbox',
    '--disable-dev-shm-usage',
    '--disable-popup-blocking',
    '--window-size=960,1040',
    '--window-position=0,40',
    '--disable-background-timer-throttling',
    '--disable-renderer-backgrounding',
  ],
})

const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const host = await browser.newPage()
await host.goto('http://127.0.0.1:4173/', { waitUntil: 'domcontentloaded' })
await pause(800)
await host.click('#create')
await host.waitForSelector('[data-action="sample"]')
await pause(600)
await host.click('[data-action="sample"]')
await host.waitForFunction(() => document.querySelector('#holder')?.dataset.page === '1')
await pause(1200)
const viewUrl = await host.$eval('#share-url', (node) => node.textContent.trim())
await host.screenshot({ path: '/opt/cursor/artifacts/host_sample_slide.png' })

const popupPromise = new Promise((resolve) => host.once('popup', resolve))
await host.evaluate((url) => {
  window.open(url, 'nikopdf-view', 'width=960,height=1040,left=960,top=40')
}, viewUrl)
const view = await Promise.race([
  popupPromise,
  new Promise((_, reject) => setTimeout(() => reject(new Error('閲覧ウィンドウを開けませんでした')), 5000)),
])
await view.setViewport({ width: 960, height: 900 })
await view.waitForFunction(() => document.querySelector('#holder')?.dataset.page === '1', { timeout: 15000 })
await pause(1000)

await view.click('#name')
await view.keyboard.type('閲覧A', { delay: 80 })
await view.click('#text')
await view.keyboard.type('ここ大事', { delay: 110 })
await pause(400)
await view.click('#composer button[type="submit"]')
await pause(1600)
await view.screenshot({ path: '/opt/cursor/artifacts/view_comment_flying.png' })
await host.bringToFront()
await pause(1600)
await host.screenshot({ path: '/opt/cursor/artifacts/host_comment_flying.png' })

await host.click('[data-action="next"]')
await host.waitForFunction(() => document.querySelector('#page-input').value === '2')
await pause(700)
await view.bringToFront()
await view.waitForFunction(() => document.querySelector('#holder')?.dataset.page === '2', { timeout: 10000 })
await pause(800)
await view.screenshot({ path: '/opt/cursor/artifacts/view_followed_page.png' })
await pause(600)
await browser.close()
console.log('demo done', viewUrl)
