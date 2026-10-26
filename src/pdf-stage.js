import * as pdfjs from 'pdfjs-dist'

let workerReady = false

export function configurePdf(base) {
  if (workerReady) return
  pdfjs.GlobalWorkerOptions.workerSrc = `${base}js/pdf.worker.js`
  workerReady = true
}

export function createStage(holder, base) {
  configurePdf(base)
  const canvas = document.createElement('canvas')
  holder.append(canvas)
  const context = canvas.getContext('2d', { alpha: false })
  let doc = null
  let pageNum = 1
  let zoom = 1
  let task = null
  let token = 0
  let loadGen = 0

  async function load(data) {
    const gen = ++loadGen
    token += 1
    if (task) {
      try { task.cancel() } catch { /* already finished */ }
      task = null
    }
    if (doc) {
      const previous = doc
      doc = null
      await previous.destroy().catch(() => {})
    }
    let next
    try {
      next = await pdfjs.getDocument({
        data,
        cMapUrl: `${base}cmaps/`,
        cMapPacked: true,
        standardFontDataUrl: `${base}standard_fonts/`,
      }).promise
    } catch (error) {
      if (error?.name === 'PasswordException') throw new Error('パスワード付きのPDFには対応していません')
      throw new Error('このPDFは開けませんでした')
    }
    if (gen !== loadGen) {
      await next.destroy().catch(() => {})
      return null
    }
    doc = next
    pageNum = 1
    await draw()
    return { pages: doc.numPages }
  }

  async function setPage(nextPage) {
    if (!doc) return pageNum
    pageNum = Math.min(doc.numPages, Math.max(1, Math.floor(nextPage) || 1))
    await draw()
    return pageNum
  }

  async function setZoom(nextZoom) {
    zoom = Math.min(2.5, Math.max(0.75, nextZoom))
    await draw()
    return zoom
  }

  let drawing = false
  let dirty = false
  async function draw() {
    if (!doc) return
    if (drawing) {
      dirty = true
      return
    }
    drawing = true
    try {
      do {
        dirty = false
        await drawOnce()
      } while (dirty && doc)
    } finally {
      drawing = false
    }
  }

  async function drawOnce() {
    if (!doc) return
    holder.dataset.ready = '0'
    const current = ++token
    const pdfPage = await doc.getPage(pageNum)
    if (current !== token || !doc) return
    const bounds = await waitForBox()
    lastBox = `${Math.round(bounds.width)}x${Math.round(bounds.height)}`
    holder.classList.toggle('is-zoomed', zoom > 1.01)
    if (current !== token || !doc) return
    const baseViewport = pdfPage.getViewport({ scale: 1 })
    const fit = Math.min(
      Math.max(bounds.width - 32, 120) / baseViewport.width,
      Math.max(bounds.height - 32, 120) / baseViewport.height,
    )
    const viewport = pdfPage.getViewport({ scale: fit * zoom })
    if (task) {
      try { task.cancel() } catch { /* already finished */ }
    }
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    canvas.width = Math.floor(viewport.width * dpr)
    canvas.height = Math.floor(viewport.height * dpr)
    canvas.style.width = `${viewport.width}px`
    canvas.style.height = `${viewport.height}px`
    context.imageSmoothingEnabled = true
    context.imageSmoothingQuality = 'high'
    const renderParams = { canvasContext: context, viewport }
    if (dpr !== 1) renderParams.transform = [dpr, 0, 0, dpr, 0, 0]
    task = pdfPage.render(renderParams)
    try {
      await task.promise
      if (current === token) {
        holder.dataset.page = String(pageNum)
        holder.dataset.ready = '1'
      }
    } catch (error) {
      if (error?.name !== 'RenderingCancelledException') throw error
    }
  }

  async function waitForBox() {
    for (let attempt = 0; attempt < 12; attempt += 1) {
      const bounds = holder.getBoundingClientRect()
      if (bounds.width > 40 && bounds.height > 40) return bounds
      await new Promise((resolve) => requestAnimationFrame(resolve))
    }
    return holder.getBoundingClientRect()
  }

  let lastBox = ''
  const observer = new ResizeObserver(() => {
    const bounds = holder.getBoundingClientRect()
    const key = `${Math.round(bounds.width)}x${Math.round(bounds.height)}`
    if (!doc || key === lastBox) return
    lastBox = key
    draw().catch(() => {})
  })
  observer.observe(holder)

  return {
    load,
    setPage,
    setZoom,
    get page() { return pageNum },
    get pages() { return doc ? doc.numPages : 0 },
    get zoom() { return zoom },
    destroy() {
      loadGen += 1
      observer.disconnect()
      if (task) {
        try { task.cancel() } catch { /* already finished */ }
      }
      if (doc) doc.destroy().catch(() => {})
      doc = null
    },
  }
}
