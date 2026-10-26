import { joinRoom, selfId } from 'trystero'
import { clampPage, cleanFileName, cleanText, isPdf, MAX_COMMENT, MAX_NAME, MAX_PDF_BYTES, normalizeColor } from './text.js'

const APP_ID = 'jp.nikopdf.share'

export function connect({ roomId, role, onEvent }) {
  const clientId = selfId
  let closed = false
  let pdfBytes = null
  let pdfId = ''
  let pdfSeq = 0
  let fileName = ''
  let page = 1
  let slideSeq = 0
  let loadedSeq = 0
  let loadedPdfId = ''
  let lastSlideSeq = 0
  let pendingSlide = null
  let hostSeenAt = 0
  let sawHost = false
  let lastRequestAt = 0
  let lastCommentAt = 0
  let burst = 0
  let burstAt = 0
  const viewers = new Map()
  const bcClients = new Set()
  const rtcSent = new Set()
  const seenComments = new Set()
  const clientToPeer = new Map()

  const bc = new BroadcastChannel(`nikopdf:${roomId}`)
  let room = null
  let signal = null
  let fileAction = null

  try {
    room = joinRoom({
      appId: APP_ID,
      maxReceiveBytes: MAX_PDF_BYTES,
      relayConfig: { redundancy: 3 },
    }, `nikopdf-${roomId}`, {
      onJoinError() {
        emit({ type: 'warn', text: '一部の端末とは直接つながっていません。同じネットワークでも届かない場合があります。' })
      },
    })
    signal = room.makeAction('evt')
    fileAction = room.makeAction('pdf')
    fileAction.onReceive = ({ byteLength, metadata }) => {
      if (role !== 'view') return false
      if (!metadata || metadata.kind !== 'nikopdf') return false
      return byteLength > 0 && byteLength <= MAX_PDF_BYTES
    }
    fileAction.onReceiveProgress = (ratio) => {
      emit({ type: 'progress', direction: 'receive', ratio })
    }
    fileAction.onMessage = (bytes, { metadata }) => {
      hostSeenAt = Date.now()
      sawHost = true
      acceptPdf(bytes, metadata)
      emitPresence()
    }
    signal.onMessage = (data, context) => handle(data, context?.peerId)
    room.onPeerJoin = (peerId) => {
      emitPresence()
      broadcast({ type: 'hello' })
      if (role === 'host') postPdfRtc(peerId)
    }
    room.onPeerLeave = (peerId) => {
      viewers.delete(peerId)
      rtcSent.delete(`${pdfSeq}:${peerId}`)
      emitPresence()
    }
  } catch {
    emit({ type: 'warn', text: 'インターネット経由の接続を開始できませんでした。同じブラウザのタブ同士なら共有できます。' })
  }

  bc.onmessage = (event) => handle(event.data, null)

  function emit(event) {
    if (!closed) onEvent(event)
  }

  function broadcast(message) {
    const payload = { ...message, clientId, from: role }
    try {
      bc.postMessage(payload)
    } catch {
      // The local channel can reject a detached buffer. WebRTC still carries the message.
    }
    if (signal) signal.send(payload).catch(() => {})
  }

  function handle(message, peerId) {
    if (!message || typeof message !== 'object') return
    if (message.clientId && message.clientId === clientId) return
    if (peerId && message.clientId) clientToPeer.set(message.clientId, peerId)
    if (message.type === 'bye') {
      viewers.delete(message.clientId)
      if (message.from === 'host') hostSeenAt = 0
      emitPresence()
      return
    }
    if (message.from === 'host') {
      hostSeenAt = Date.now()
      sawHost = true
      if (role === 'host' && !message._warned) warnOtherHost()
    }
    if (message.from === 'view' && message.clientId) viewers.set(message.clientId, Date.now())
    if (message.type === 'hello') {
      if (role === 'view' && message.from === 'host') catchUpFromHost(message)
      emitPresence()
      return
    }
    if (message.type === 'request') {
      if (role === 'host') deliverTo(message.clientId, peerId, message.haveSeq)
      return
    }
    if (message.type === 'slide') {
      if (message.from === 'host') onSlide(message)
      return
    }
    if (message.type === 'comment') onComment(message)
    if (message.type === 'pdf' && role === 'view' && message.from === 'host') {
      acceptPdf(message.bytes, message)
    }
  }

  let warnedHost = false
  function warnOtherHost() {
    if (warnedHost) return
    warnedHost = true
    emit({ type: 'warn', text: '別のホストがこのルームにいます。ページ操作がぶつかることがあります。' })
  }

  function catchUpFromHost(message) {
    if (message.pdfSeq > loadedSeq) requestPdf()
    else if (message.pdfId && message.pdfId === loadedPdfId && message.slideSeq > lastSlideSeq) {
      onSlide(message)
    }
  }

  function requestPdf() {
    const now = Date.now()
    if (now - lastRequestAt < 2000) return
    lastRequestAt = now
    broadcast({ type: 'request', haveSeq: loadedSeq })
  }

  function onSlide(message) {
    if (!message.pdfId || !message.slideSeq) return
    const nextPage = clampPage(message.page)
    if (loadedPdfId && message.pdfId === loadedPdfId) {
      if (message.slideSeq <= lastSlideSeq) return
      lastSlideSeq = message.slideSeq
      page = nextPage
      emit({ type: 'slide', page: nextPage })
      return
    }
    if (!pendingSlide || message.slideSeq > pendingSlide.slideSeq) {
      pendingSlide = { ...message, page: nextPage }
    }
  }

  function acceptPdf(bytes, meta) {
    const data = asBytes(bytes)
    const seq = Number(meta?.pdfSeq) || 0
    if (!data || !isPdf(data) || !meta?.pdfId || seq <= loadedSeq) return
    loadedSeq = seq
    loadedPdfId = meta.pdfId
    let nextPage = clampPage(meta.page)
    let nextSlideSeq = Number(meta.slideSeq) || 0
    if (pendingSlide && pendingSlide.pdfId === meta.pdfId && pendingSlide.slideSeq >= nextSlideSeq) {
      nextPage = pendingSlide.page
      nextSlideSeq = pendingSlide.slideSeq
    }
    pendingSlide = null
    lastSlideSeq = nextSlideSeq
    page = nextPage
    emit({
      type: 'pdf',
      bytes: data,
      name: cleanFileName(meta.name),
      page: nextPage,
      pdfId: meta.pdfId,
    })
    emit({ type: 'progress', direction: 'receive', ratio: 1 })
  }

  function deliverTo(targetClientId, peerId, haveSeq) {
    if (!pdfBytes || Number(haveSeq) === pdfSeq) return
    if (targetClientId && !bcClients.has(targetClientId)) {
      if (postPdfBc()) bcClients.add(targetClientId)
    }
    const target = peerId || clientToPeer.get(targetClientId)
    if (target) postPdfRtc(target)
  }

  function postPdfBc() {
    if (!pdfBytes) return false
    try {
      bc.postMessage({
        type: 'pdf',
        ...meta(),
        bytes: pdfBytes.slice(),
        clientId,
        from: 'host',
      })
      return true
    } catch {
      return false
    }
  }

  function postPdfRtc(peerId) {
    if (!pdfBytes || !fileAction || !peerId) return
    const key = `${pdfSeq}:${peerId}`
    if (rtcSent.has(key)) return
    rtcSent.add(key)
    fileAction.send(pdfBytes.slice(), {
      target: peerId,
      metadata: { kind: 'nikopdf', ...meta() },
      onProgress: (ratio) => emit({ type: 'progress', direction: 'send', ratio: Number(ratio) || 0 }),
    }).catch(() => {
      rtcSent.delete(key)
    })
  }

  function meta() {
    return {
      pdfId,
      pdfSeq,
      name: fileName,
      page,
      slideSeq,
    }
  }

  function emitPresence() {
    const now = Date.now()
    for (const [id, seen] of viewers) {
      if (now - seen > 12000) viewers.delete(id)
    }
    const hostOnline = role === 'host' || (sawHost && now - hostSeenAt < 12000)
    emit({
      type: 'presence',
      viewers: viewers.size,
      hostOnline,
      peers: room ? Object.keys(room.getPeers()).length : 0,
    })
  }

  function onComment(message) {
    if (!message.id || seenComments.has(message.id)) return
    const text = cleanText(message.text, MAX_COMMENT)
    if (!text || !allowBurst()) return
    seenComments.add(message.id)
    if (seenComments.size > 800) seenComments.delete(seenComments.values().next().value)
    emit({
      type: 'comment',
      comment: {
        id: message.id,
        text,
        color: normalizeColor(message.color),
        name: cleanText(message.name, MAX_NAME),
      },
    })
  }

  function allowBurst() {
    const now = Date.now()
    if (now - burstAt > 1000) {
      burst = 0
      burstAt = now
    }
    burst += 1
    return burst <= 12
  }

  const heartbeat = setInterval(() => {
    broadcast({ type: 'hello', ...meta() })
    emitPresence()
  }, 3000)
  broadcast({ type: 'hello', ...meta() })
  const retry = setInterval(() => {
    if (role === 'view' && loadedSeq === 0) requestPdf()
  }, 2000)
  if (role === 'view') requestPdf()

  return {
    publish(bytes, name) {
      if (role !== 'host' || !isPdf(bytes)) return false
      if (bytes.length > MAX_PDF_BYTES) {
        emit({ type: 'error', text: '32MBまでのPDFにしてください' })
        return false
      }
      pdfBytes = bytes
      fileName = cleanFileName(name)
      pdfId = crypto.randomUUID()
      pdfSeq += 1
      page = 1
      slideSeq += 1
      bcClients.clear()
      rtcSent.clear()
      postPdfBc()
      if (room) {
        for (const peerId of Object.keys(room.getPeers())) postPdfRtc(peerId)
      }
      broadcast({ type: 'slide', ...meta() })
      return true
    },
    setPage(next, pageCount) {
      if (role !== 'host' || !pdfBytes) return page
      const total = Math.max(1, pageCount || 9999)
      page = Math.min(total, clampPage(next))
      slideSeq += 1
      broadcast({ type: 'slide', ...meta() })
      return page
    },
    sendComment(text, color, name) {
      const clean = cleanText(text, MAX_COMMENT)
      if (!clean) return false
      const now = Date.now()
      if (now - lastCommentAt < 700) {
        emit({ type: 'error', text: '少し間を空けてください' })
        return false
      }
      lastCommentAt = now
      const comment = {
        id: crypto.randomUUID(),
        text: clean,
        color: normalizeColor(color),
        name: cleanText(name, MAX_NAME),
      }
      seenComments.add(comment.id)
      emit({ type: 'comment', comment })
      broadcast({ type: 'comment', ...comment })
      return true
    },
    notePdfFailed() {
      loadedPdfId = ''
    },
    destroy() {
      closed = true
      clearInterval(heartbeat)
      clearInterval(retry)
      try {
        broadcast({ type: 'bye' })
      } catch {
        // Closing the channel is enough if the goodbye cannot be cloned.
      }
      try {
        bc.close()
      } catch {
        // Already closed.
      }
      if (room) return room.leave().catch(() => {})
      return Promise.resolve()
    },
  }
}

function asBytes(value) {
  if (value instanceof Uint8Array) return value
  if (value instanceof ArrayBuffer) return new Uint8Array(value)
  return null
}
