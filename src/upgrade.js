const BODY = document.body

function setMode(key, enabled) {
  BODY.classList.toggle(key, enabled)
  try { localStorage.setItem(`dsh_${key}`, enabled ? '1' : '0') } catch {}
}

function readMode(key) {
  try { return localStorage.getItem(`dsh_${key}`) === '1' } catch { return false }
}

function toast(text, ok = true) {
  let el = document.getElementById('dsh-connection-status')
  if (!el) {
    el = document.createElement('div')
    el.id = 'dsh-connection-status'
    document.body.appendChild(el)
  }
  el.textContent = text
  el.className = `show${ok ? ' ok' : ''}`
  clearTimeout(el._timer)
  el._timer = setTimeout(() => { el.classList.remove('show') }, 2600)
}

function findSearch() {
  const inputs = [...document.querySelectorAll('input')]
  return inputs.find(x => /search|поиск/i.test(`${x.placeholder || ''} ${x.getAttribute('aria-label') || ''}`)) || inputs.find(x => !x.disabled && x.offsetParent !== null)
}

function quickSettings() {
  let panel = document.getElementById('dsh-quick-settings')
  if (panel) { panel.remove(); return }
  panel = document.createElement('div')
  panel.id = 'dsh-quick-settings'
  panel.innerHTML = `
    <h3>Быстрые настройки</h3>
    <div class="qsub">Ctrl + , чтобы открыть или закрыть</div>
    ${[['ui-compact','Компактный режим','Меньше вертикальных отступов'],['ui-large-text','Увеличенный текст','Удобнее читать сообщения'],['ui-reduced-motion','Уменьшить анимации','Меньше движения интерфейса']].map(([key,title,desc]) => `
      <div class="dsh-qrow"><div><label>${title}</label><div class="qsub" style="margin:3px 0 0">${desc}</div></div><button class="dsh-toggle ${readMode(key) ? 'on' : ''}" data-mode="${key}" aria-label="${title}"></button></div>`).join('')}
    <button class="dsh-qclose">Закрыть</button>
  `
  document.body.appendChild(panel)
  panel.querySelectorAll('[data-mode]').forEach(btn => btn.addEventListener('click', () => {
    const key = btn.dataset.mode
    const next = !BODY.classList.contains(key)
    setMode(key, next)
    btn.classList.toggle('on', next)
  }))
  panel.querySelector('.dsh-qclose').onclick = () => panel.remove()
}

setMode('ui-compact', readMode('ui-compact'))
setMode('ui-large-text', readMode('ui-large-text'))
setMode('ui-reduced-motion', readMode('ui-reduced-motion'))

window.addEventListener('keydown', e => {
  if (e.ctrlKey && e.key === ',') { e.preventDefault(); quickSettings(); return }
  if (e.ctrlKey && e.key.toLowerCase() === 'k') { e.preventDefault(); findSearch()?.focus(); return }
  if (e.key === 'Escape') document.getElementById('dsh-quick-settings')?.remove()
})

let wasOffline = false
async function checkHealth() {
  try {
    const r = await fetch('/api/health', { cache: 'no-store' })
    if (!r.ok) throw new Error('health')
    if (wasOffline) toast('Соединение восстановлено', true)
    wasOffline = false
  } catch {
    if (!wasOffline) toast('Сервер недоступен. Пытаемся восстановить соединение…', false)
    wasOffline = true
  }
}
checkHealth()
setInterval(checkHealth, 5000)

// Mark the app as ready only after the initial document has rendered.
requestAnimationFrame(() => document.documentElement.classList.add('dsh-ready'))
