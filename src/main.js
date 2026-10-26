import { createDanmaku } from './danmaku.js'
import { createStage } from './pdf-stage.js'
import { parseJoinInput, parseRoute } from './router.js'
import { createSamplePdf } from './sample-pdf.js'
import { connect } from './session.js'
import { COMMENT_COLORS, MAX_COMMENT, MAX_NAME, MAX_PDF_BYTES, createRoomId, isPdf, normalizeColor } from './text.js'

const base = window.__NIKOPDF_BASE__ || '/'
const storageName = 'nikopdf-name'
const storageColor = 'nikopdf-color'

let cleanup = async () => {}
let renderGen = 0

window.addEventListener('popstate', () => {
  void render()
})

void render()

async function render() {
  const gen = ++renderGen
  const previous = cleanup
  cleanup = async () => {}
  await previous()
  if (gen !== renderGen) return
  const route = parseRoute(location.pathname, base)
  if (route.name === 'home') {
    document.title = 'NikoPDF'
    renderHome(route)
    return
  }
  document.title = route.role === 'host' ? 'NikoPDF ホスト' : 'NikoPDF 閲覧'
  cleanup = renderRoom(route)
}

function renderHome(route) {
  const app = document.querySelector('#app')
  app.innerHTML = `
    <main class="home">
      <header class="home-bar">
        <div class="brand">NikoPDF</div>
        <p>PDFを共有して、コメントを流す</p>
      </header>
      <section class="hero">
        <div class="hero-copy">
          <p class="eyebrow">画面共有するスライド</p>
          <h1>開いて、渡して、<br>コメントを流す。</h1>
          <p class="lead">URLの末尾が <code>/host</code> の人がPDFを開きます。末尾が <code>/view</code> の人は同じページを見て、コメントを送れます。コメントは右から左へ、ホストとすべての閲覧画面を流れていきます。</p>
          <button class="seal" id="create" type="button">ホストとして始める</button>
          <form class="join" id="join">
            <label for="join-input">閲覧として入る</label>
            <div class="join-row">
              <input id="join-input" name="room" placeholder="ルームID または URL" autocomplete="off">
              <button class="ghost" type="submit">入室</button>
            </div>
            <p class="form-error" id="join-error" hidden></p>
          </form>
        </div>
        <div class="preview" aria-hidden="true">
          <div class="preview-slide">
            <span>01  /  HOST</span>
            <strong>今週の報告</strong>
            <p>詳細は次のページ。コメントは資料の上を流れていきます。</p>
          </div>
          <span class="fly fly-a">ここ大事</span>
          <span class="fly fly-b">3ページ見たい</span>
          <span class="fly fly-c">わかりやすい</span>
        </div>
      </section>
      <section class="steps">
        <article><b>1</b><h2>ホスト</h2><p>PDFを開いてページを送ります。閲覧用のURLを渡してください。</p></article>
        <article><b>2</b><h2>閲覧</h2><p>受け取ったURLを開くと、ホストと同じページが映ります。</p></article>
        <article><b>3</b><h2>コメント</h2><p>短い言葉を送ると、共有中の画面を右から左へ流れます。</p></article>
      </section>
      <p class="fine" id="home-note"></p>
      <footer class="fine">PDFはこのサイトには保存されません。表示中のブラウザ同士で直接送られます。URLを知っている人が入室できます。</footer>
    </main>
  `
  const note = document.querySelector('#home-note')
  if (route.invalid) note.textContent = 'そのアドレスは見つかりませんでした。新しくホストを始めるか、ルームIDを入力してください。'
  document.querySelector('#create').addEventListener('click', () => navigate(`${createRoomId()}/host`))
  document.querySelector('#join').addEventListener('submit', (event) => {
    event.preventDefault()
    const parsed = parseJoinInput(new FormData(event.currentTarget).get('room'))
    const error = document.querySelector('#join-error')
    if (!parsed) {
      error.hidden = false
      error.textContent = '8文字のルームIDか、末尾が /host または /view のURLを入力してください。'
      return
    }
    navigate(`${parsed.roomId}/${parsed.role}`)
  })
}

function renderRoom(route) {
  const { roomId, role } = route
  const app = document.querySelector('#app')
  app.innerHTML = `
    <div class="room" data-role="${role}">
      <header class="topbar">
        <button class="brand-btn" type="button" data-action="home">NikoPDF</button>
        <span class="badge" id="role-badge"></span>
        <p class="status" id="status" aria-live="polite">接続を準備しています</p>
        <span class="count" id="count">閲覧 0</span>
      </header>
      <div class="sharebar">
        <div class="share-item">
          <span id="link-label">閲覧URL</span>
          <code id="share-url"></code>
          <button class="ghost tiny" type="button" data-action="copy">コピー</button>
          <button class="ghost tiny host-only" type="button" data-action="open-view">閲覧を開く</button>
        </div>
        <p class="share-note" id="share-note"></p>
      </div>
      <div class="stage" id="stage">
        <div class="canvas-holder" id="holder"></div>
        <div class="empty" id="empty"></div>
        <div class="danmaku" id="danmaku" aria-hidden="true"></div>
        <div class="progress" id="progress" hidden>
          <span id="progress-label"></span>
          <div class="progress-track"><div id="progress-bar"></div></div>
        </div>
      </div>
      <aside class="history">
        <div class="history-head">
          <h2>流れたコメント</h2>
          <button class="ghost tiny" type="button" data-action="history" id="history-toggle">閉じる</button>
        </div>
        <ol id="history-list"></ol>
        <p class="history-empty" id="history-empty">まだコメントはありません</p>
      </aside>
      <footer class="dock">
        <div class="pager">
          <button class="ghost tiny" type="button" data-action="prev" aria-label="前のページ">前へ</button>
          <label class="page-label">
            <input id="page-input" inputmode="numeric" aria-label="ページ">
            <span>/ <span id="page-total">0</span></span>
          </label>
          <button class="ghost tiny" type="button" data-action="next" aria-label="次のページ">次へ</button>
          <button class="ghost tiny" type="button" data-action="zoom-out" aria-label="縮小">−</button>
          <button class="ghost tiny" type="button" data-action="zoom-in" aria-label="拡大">＋</button>
          <button class="ghost tiny" type="button" data-action="history">履歴</button>
          <button class="ghost tiny host-only" type="button" data-action="browse">PDFを差し替え</button>
          <span class="filename" id="filename"></span>
        </div>
        <form class="composer" id="composer">
          <input id="name" maxlength="${MAX_NAME}" placeholder="名前" autocomplete="nickname" aria-label="名前">
          <input id="text" maxlength="${MAX_COMMENT}" placeholder="コメントを流す" aria-label="コメント" required>
          <div class="swatches" id="swatches" role="radiogroup" aria-label="コメントの色"></div>
          <button class="seal" type="submit">流す</button>
        </form>
      </footer>
      <p class="toast" id="toast" hidden></p>
      <div class="sr-only" id="live" aria-live="polite"></div>
      <input id="file" type="file" accept="application/pdf,.pdf" hidden>
    </div>
  `

  const viewUrl = roomUrl(roomId, 'view')
  const hostUrl = roomUrl(roomId, 'host')
  document.querySelector('#role-badge').textContent = role === 'host' ? 'ホスト' : '閲覧'
  document.querySelector('#share-url').textContent = role === 'host' ? viewUrl : `${viewUrl}`
  document.querySelector('#link-label').textContent = role === 'host' ? '閲覧URL' : 'この画面'
  document.querySelector('#share-note').textContent = role === 'host'
    ? `ホスト用のURLは別々に控えてください。 ${hostUrl}`
    : 'コメントは、ホストと他の閲覧画面にも右から流れていきます。'
  document.querySelector('#empty').append(role === 'host' ? hostEmpty() : viewEmpty())

  const holder = document.querySelector('#holder')
  const stage = createStage(holder, base)
  const danmaku = createDanmaku(document.querySelector('#danmaku'))
  const pageInput = document.querySelector('#page-input')
  const nameInput = document.querySelector('#name')
  const textInput = document.querySelector('#text')
  const fileInput = document.querySelector('#file')
  nameInput.value = localStorage.getItem(storageName) || ''
  let color = normalizeColor(localStorage.getItem(storageColor))
  let pageCount = 0
  let currentPage = 1
  let hasPdf = false
  let presence = { viewers: 0, hostOnline: false, peers: 0 }
  let progressText = ''
  const history = []

  const swatches = document.querySelector('#swatches')
  for (const value of COMMENT_COLORS) {
    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'swatch'
    button.dataset.color = value
    button.style.background = value
    button.setAttribute('role', 'radio')
    button.setAttribute('aria-label', value === '#ffffff' ? '白' : value)
    button.addEventListener('click', () => {
      color = value
      localStorage.setItem(storageColor, color)
      paintSwatches()
    })
    swatches.append(button)
  }
  paintSwatches()

  const session = connect({
    roomId,
    role,
    onEvent(event) {
      if (event.type === 'presence') {
        presence = event
        paintStatus()
      } else if (event.type === 'progress') {
        const percent = Math.max(0, Math.min(100, Math.round((event.ratio || 0) * 100)))
        progressText = percent >= 100
          ? ''
          : event.direction === 'send'
            ? `PDFを送っています ${percent}%`
            : `PDFを受信しています ${percent}%`
        paintProgress(percent)
        paintStatus()
      } else if (event.type === 'pdf' && role === 'view') {
        void showRemotePdf(event)
      } else if (event.type === 'slide' && role === 'view') {
        void showPage(event.page, false)
      } else if (event.type === 'comment') {
        addComment(event.comment)
      } else if (event.type === 'error') {
        flash(event.text)
      } else if (event.type === 'warn') {
        flash(event.text)
      }
    },
  })

  function paintSwatches() {
    for (const button of swatches.querySelectorAll('.swatch')) {
      button.setAttribute('aria-checked', button.dataset.color === color ? 'true' : 'false')
    }
  }

  function paintStatus() {
    const status = document.querySelector('#status')
    const count = document.querySelector('#count')
    count.textContent = `閲覧 ${presence.viewers}`
    count.classList.toggle('is-on', presence.viewers > 0)
    count.hidden = role === 'view' && presence.viewers === 0
    if (progressText) {
      status.textContent = progressText
      return
    }
    if (role === 'host') {
      status.textContent = presence.viewers > 0 ? '共有中' : '閲覧者を待っています'
      return
    }
    if (!hasPdf && presence.hostOnline) status.textContent = 'ホストがPDFを開くのを待っています'
    else if (!hasPdf) status.textContent = 'ホストを待っています'
    else if (!presence.hostOnline) status.textContent = 'ホストとの接続が切れました'
    else status.textContent = 'ホストの画面を表示中'
  }

  function paintProgress(percent) {
    const wrap = document.querySelector('#progress')
    wrap.hidden = !progressText
    document.querySelector('#progress-label').textContent = progressText
    document.querySelector('#progress-bar').style.width = `${percent}%`
  }

  async function showRemotePdf(event) {
    try {
      const info = await stage.load(event.bytes.slice())
      if (!info) return
      hasPdf = true
      pageCount = info.pages
      document.querySelector('#empty').hidden = true
      document.querySelector('#filename').textContent = event.name
      await showPage(event.page, false)
      progressText = ''
      paintProgress(100)
      paintStatus()
    } catch (error) {
      session.notePdfFailed()
      hasPdf = false
      document.querySelector('#empty').hidden = false
      flash(error.message || 'PDFを表示できませんでした')
    }
  }

  async function showPage(nextPage, broadcast) {
    if (role === 'host' && !hasPdf) return
    const requested = role === 'host' && broadcast ? session.setPage(nextPage, pageCount) : nextPage
    const shown = await stage.setPage(requested)
    currentPage = shown
    pageInput.value = String(shown)
    document.querySelector('#page-total').textContent = String(pageCount || stage.pages || 0)
    syncPager()
  }

  async function openBytes(bytes, name) {
    if (role !== 'host') return
    if (!isPdf(bytes)) {
      flash('PDFファイルを選んでください')
      return
    }
    if (bytes.length > MAX_PDF_BYTES) {
      flash('32MBまでのPDFにしてください')
      return
    }
    try {
      const info = await stage.load(bytes.slice())
      if (!info) return
      if (!session.publish(bytes, name)) return
      hasPdf = true
      pageCount = info.pages
      currentPage = 1
      document.querySelector('#empty').hidden = true
      document.querySelector('#filename').textContent = name
      pageInput.value = '1'
      document.querySelector('#page-total').textContent = String(pageCount)
      progressText = ''
      syncPager()
      paintStatus()
    } catch (error) {
      flash(error.message || 'PDFを開けませんでした')
    }
  }

  async function readFile(file) {
    if (!file) return
    const bytes = new Uint8Array(await file.arrayBuffer())
    await openBytes(bytes, file.name)
  }

  document.querySelector('#composer').addEventListener('submit', (event) => {
    event.preventDefault()
    const sent = session.sendComment(textInput.value, color, nameInput.value)
    if (!sent) return
    localStorage.setItem(storageName, nameInput.value.trim())
    textInput.value = ''
    textInput.focus()
  })

  document.querySelector('.room').addEventListener('click', async (event) => {
    const action = event.target.closest('[data-action]')?.dataset.action
    if (!action) return
    if (action === 'home') {
      if (role === 'host' && hasPdf && !window.confirm('共有を終了して最初の画面に戻りますか？')) return
      navigate('')
    } else if (action === 'copy') {
      const ok = await copyText(role === 'host' ? viewUrl : location.href)
      flash(ok ? 'コピーしました' : 'コピーできませんでした。URLを選択してコピーしてください。')
    } else if (action === 'open-view') {
      window.open(viewUrl, '_blank', 'noopener')
    } else if (action === 'prev' && role === 'host') {
      await showPage(currentPage - 1, true)
    } else if (action === 'next' && role === 'host') {
      await showPage(currentPage + 1, true)
    } else if (action === 'zoom-out') {
      await stage.setZoom(stage.zoom - 0.25)
    } else if (action === 'zoom-in') {
      await stage.setZoom(stage.zoom + 0.25)
    } else if (action === 'browse') {
      fileInput.click()
    } else if (action === 'sample') {
      const button = event.target.closest('button')
      button.disabled = true
      button.textContent = '作成しています'
      try {
        await openBytes(await createSamplePdf(), 'NikoPDF-sample.pdf')
      } finally {
        button.disabled = false
        button.textContent = 'サンプルを開く'
      }
    } else if (action === 'history') {
      document.querySelector('.history').classList.toggle('is-open')
    }
  })

  pageInput.readOnly = role !== 'host'
  function syncPager() {
    const locked = role !== 'host' || !hasPdf
    document.querySelector('[data-action="prev"]').disabled = locked
    document.querySelector('[data-action="next"]').disabled = locked
    pageInput.disabled = role !== 'host'
  }
  syncPager()
  pageInput.addEventListener('change', () => {
    if (role === 'host') void showPage(pageInput.value, true)
  })
  fileInput.addEventListener('change', () => {
    const file = fileInput.files?.[0]
    fileInput.value = ''
    void readFile(file)
  })

  const stageEl = document.querySelector('#stage')
  stageEl.addEventListener('dragover', (event) => {
    if (role !== 'host') return
    event.preventDefault()
    stageEl.classList.add('is-dragover')
  })
  stageEl.addEventListener('dragleave', () => stageEl.classList.remove('is-dragover'))
  stageEl.addEventListener('drop', (event) => {
    if (role !== 'host') return
    event.preventDefault()
    stageEl.classList.remove('is-dragover')
    void readFile(event.dataTransfer?.files?.[0])
  })

  function onKey(event) {
    if (role !== 'host') return
    const tag = event.target?.tagName
    if (tag === 'INPUT' || tag === 'TEXTAREA' || event.target?.isContentEditable) return
    if (event.key === 'ArrowRight' || event.key === 'PageDown' || event.key === ' ') {
      event.preventDefault()
      void showPage(currentPage + 1, true)
    } else if (event.key === 'ArrowLeft' || event.key === 'PageUp') {
      event.preventDefault()
      void showPage(currentPage - 1, true)
    }
  }
  document.addEventListener('keydown', onKey)

  function addComment(comment) {
    danmaku.spawn(comment)
    history.unshift(comment)
    if (history.length > 40) history.pop()
    const list = document.querySelector('#history-list')
    const item = document.createElement('li')
    const swatch = document.createElement('i')
    swatch.style.background = comment.color
    const body = document.createElement('span')
    body.textContent = comment.name ? `${comment.name}  ${comment.text}` : comment.text
    item.append(swatch, body)
    list.prepend(item)
    while (list.children.length > 40) list.lastElementChild.remove()
    document.querySelector('#history-empty').hidden = list.children.length > 0
    const live = document.querySelector('#live')
    live.textContent = comment.name ? `${comment.name} ${comment.text}` : comment.text
  }

  paintStatus()
  pageInput.value = '0'

  return async () => {
    document.removeEventListener('keydown', onKey)
    stage.destroy()
    await Promise.race([
      session.destroy(),
      new Promise((resolve) => setTimeout(resolve, 1200)),
    ])
  }
}

function hostEmpty() {
  const wrap = document.createElement('div')
  wrap.className = 'empty-card'
  wrap.innerHTML = `
    <strong>PDFをここにドロップ</strong>
    <p>閲覧URLを開いた画面に、同じページが映ります。</p>
    <div class="empty-actions">
      <button class="seal" type="button" data-action="browse">ファイルを選ぶ</button>
      <button class="ghost" type="button" data-action="sample">サンプルを開く</button>
    </div>
  `
  return wrap
}

function viewEmpty() {
  const wrap = document.createElement('div')
  wrap.className = 'empty-card'
  wrap.innerHTML = `
    <strong>ホストのPDFを待っています</strong>
    <p>共有が始まると、この画面に同じページが映ります。コメントは下の欄から流せます。</p>
  `
  return wrap
}

function roomUrl(roomId, role) {
  return `${location.origin}${base}${roomId}/${role}`
}

function navigate(path) {
  const next = `${base}${String(path || '').replace(/^\//, '')}`
  const current = `${location.pathname}${location.search}`
  if (current !== next) history.pushState(null, '', next)
  void render()
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    const area = document.createElement('textarea')
    area.value = text
    area.setAttribute('readonly', '')
    document.body.append(area)
    area.select()
    const ok = document.execCommand('copy')
    area.remove()
    return ok
  }
}

let toastTimer = 0
function flash(text) {
  const toast = document.querySelector('#toast')
  if (!toast) return
  toast.hidden = false
  toast.textContent = text
  window.clearTimeout(toastTimer)
  toastTimer = window.setTimeout(() => {
    toast.hidden = true
  }, 2600)
}
