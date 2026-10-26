export function createDanmaku(layer) {
  const laneReady = []

  function spawn(comment, attempt = 0) {
    if (!layer.isConnected) return
    if (!layer.clientWidth || !layer.clientHeight) {
      if (attempt < 8) requestAnimationFrame(() => spawn(comment, attempt + 1))
      return
    }
    const item = document.createElement('div')
    item.className = 'bullet'
    item.style.color = comment.color
    if (comment.name) {
      const name = document.createElement('span')
      name.className = 'bullet-name'
      name.textContent = comment.name
      item.append(name)
    }
    const text = document.createElement('span')
    text.textContent = comment.text
    item.append(text)
    layer.append(item)

    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduce) {
      item.classList.add('bullet-static')
      window.setTimeout(() => item.remove(), 6000)
      return
    }

    const lanes = Math.max(6, Math.min(12, Math.floor(layer.clientHeight / 48)))
    while (laneReady.length < lanes) laneReady.push(0)
    let lane = 0
    for (let index = 1; index < lanes; index += 1) {
      if (laneReady[index] < laneReady[lane]) lane = index
    }
    const laneHeight = layer.clientHeight / lanes
    item.style.top = `${lane * laneHeight + Math.max(0, (laneHeight - item.offsetHeight) / 2)}px`
    const width = item.offsetWidth
    const speed = 150
    const duration = ((layer.clientWidth + width) / speed) * 1000
    laneReady[lane] = performance.now() + ((width + 64) / speed) * 1000
    const animation = item.animate(
      [
        { transform: `translateX(${layer.clientWidth}px)` },
        { transform: `translateX(${-width}px)` },
      ],
      { duration, easing: 'linear', fill: 'forwards' },
    )
    animation.onfinish = () => item.remove()
  }

  return { spawn }
}
