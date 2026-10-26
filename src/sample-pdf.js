const PAGE_WIDTH = 960
const PAGE_HEIGHT = 540

const SLIDES = [
  {
    kicker: '01  /  HOST',
    title: 'PDFを開く',
    body: 'ホストが開いたページを、閲覧側の画面へそのまま映します。',
  },
  {
    kicker: '02  /  PAGE',
    title: '一緒にめくる',
    body: 'ページ送りはホストだけ。矢印キーでも次のスライドへ進めます。',
  },
  {
    kicker: '03  /  COMMENT',
    title: 'コメントを流す',
    body: '閲覧画面から送ると、右から左へ、全員の画面を通ります。',
  },
]

export function pdfFromJpegs(pages, pageWidth = PAGE_WIDTH, pageHeight = PAGE_HEIGHT) {
  if (!pages.length) throw new Error('PDFにページがありません')
  const enc = (value) => new TextEncoder().encode(value)
  const pieces = []
  let cursor = 0
  const offsets = [0]
  const push = (bytes) => {
    pieces.push(bytes)
    cursor += bytes.length
  }
  const addObject = (body) => {
    const id = offsets.length
    offsets.push(cursor)
    push(enc(`${id} 0 obj\n`))
    push(body)
    push(enc('\nendobj\n'))
    return id
  }

  push(enc('%PDF-1.4\n%\xFF\xFF\xFF\xFF\n'))
  const pageIds = pages.map((_, index) => 3 + index * 3)
  addObject(enc('<< /Type /Catalog /Pages 2 0 R >>'))
  addObject(enc(`<< /Type /Pages /Count ${pages.length} /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] >>`))

  pages.forEach((page, index) => {
    const pageId = 3 + index * 3
    const imageId = pageId + 1
    const contentId = pageId + 2
    const content = `q\n${pageWidth} 0 0 ${pageHeight} 0 0 cm\n/Im${index} Do\nQ\n`
    const contentBytes = enc(content)
    const pageDict = enc(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /XObject << /Im${index} ${imageId} 0 R >> >> /Contents ${contentId} 0 R >>`)
    const imageBody = concatBytes([
      enc(`<< /Type /XObject /Subtype /Image /Width ${page.width} /Height ${page.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${page.jpeg.length} >>\nstream\n`),
      page.jpeg,
      enc('\nendstream'),
    ])
    const contentObj = concatBytes([
      enc(`<< /Length ${contentBytes.length} >>\nstream\n`),
      contentBytes,
      enc('endstream'),
    ])
    if (addObject(pageDict) !== pageId || addObject(imageBody) !== imageId || addObject(contentObj) !== contentId) {
      throw new Error('PDFのオブジェクト番号がずれました')
    }
  })

  const xrefAt = cursor
  let xref = `xref\n0 ${offsets.length}\n0000000000 65535 f \n`
  for (let id = 1; id < offsets.length; id += 1) {
    xref += `${String(offsets[id]).padStart(10, '0')} 00000 n \n`
  }
  xref += `trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${xrefAt}\n%%EOF\n`
  push(enc(xref))
  return concatBytes(pieces)
}

export async function createSamplePdf() {
  const width = 1920
  const height = 1080
  if (document.fonts?.load) {
    await Promise.race([
      Promise.all([
        document.fonts.load('700 92px "Shippori Mincho"'),
        document.fonts.load('500 36px "Zen Kaku Gothic New"'),
      ]),
      new Promise((resolve) => setTimeout(resolve, 1500)),
    ])
  }
  const pages = []
  for (let index = 0; index < SLIDES.length; index += 1) {
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    paintSlide(canvas.getContext('2d'), SLIDES[index], index, SLIDES.length)
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.86))
    if (!blob) throw new Error('サンプルPDFを作れませんでした')
    pages.push({
      jpeg: new Uint8Array(await blob.arrayBuffer()),
      width,
      height,
    })
  }
  return pdfFromJpegs(pages)
}

function paintSlide(ctx, slide, index, total) {
  const { width, height } = ctx.canvas
  ctx.fillStyle = '#241f1b'
  ctx.fillRect(0, 0, width, height)
  ctx.fillStyle = '#e23b2f'
  ctx.fillRect(0, 0, 28, height)
  ctx.fillStyle = '#e7c27a'
  ctx.font = '700 34px "Zen Kaku Gothic New", "Hiragino Sans", sans-serif'
  ctx.fillText(slide.kicker, 110, 180)
  ctx.fillStyle = '#f6f1e8'
  ctx.font = '700 108px "Shippori Mincho", "Yu Mincho", serif'
  ctx.fillText(slide.title, 110, 340)
  ctx.fillStyle = '#d9cfc2'
  ctx.font = '500 42px "Zen Kaku Gothic New", "Hiragino Sans", sans-serif'
  wrapText(ctx, slide.body, 110, 460, width - 220, 68)
  ctx.fillStyle = '#8d8276'
  ctx.font = '500 28px "Zen Kaku Gothic New", "Hiragino Sans", sans-serif'
  ctx.fillText(`NikoPDF     ${index + 1} / ${total}`, 110, height - 90)
}

function wrapText(ctx, text, x, y, maxWidth, lineHeight) {
  let line = ''
  let top = y
  for (const char of text) {
    const next = line + char
    if (ctx.measureText(next).width > maxWidth && line) {
      ctx.fillText(line, x, top)
      line = char
      top += lineHeight
    } else {
      line = next
    }
  }
  if (line) ctx.fillText(line, x, top)
}

function concatBytes(parts) {
  const size = parts.reduce((total, part) => total + part.length, 0)
  const out = new Uint8Array(size)
  let offset = 0
  for (const part of parts) {
    out.set(part, offset)
    offset += part.length
  }
  return out
}
