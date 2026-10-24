(function () {
  // Метрики и компоновка повторяют виджет Chatwoot (MIT Expat):
  // https://github.com/chatwoot/chatwoot/blob/develop/app/javascript/sdk/sdk.css
  // Код загрузчика самостоятельный, исходники Chatwoot не копировались.
  if (window.ServiceDeskWidget) return

  var script = document.currentScript
  if (!script) return

  var token = script.getAttribute('data-token')
  if (!token) return

  var origin = new URL(script.src, window.location.href).origin
  var position = String(script.getAttribute('data-position') || 'right').toLowerCase() === 'left' ? 'left' : 'right'
  var accent = script.getAttribute('data-color') || '#1f93ff'
  var openLabel = script.getAttribute('data-open-label') || 'Открыть чат с поддержкой'
  var closeLabel = script.getAttribute('data-close-label') || 'Закрыть чат с поддержкой'
  var frameTitle = script.getAttribute('data-title') || 'Чат с поддержкой'

  var CSS =
    '.sd-widget-holder{position:fixed;z-index:2147483000;overflow:hidden;background:#fff;' +
    'box-shadow:0 5px 40px rgba(0,0,0,.16);border-radius:16px;width:400px;' +
    'height:calc(100% - 140px);max-height:640px;min-height:250px;bottom:104px;' +
    'opacity:0;transform:translateY(12px);pointer-events:none;' +
    'transition:opacity .2s linear,transform .25s linear}' +
    '.sd-widget-holder.sd-open{opacity:1;transform:translateY(0);pointer-events:auto}' +
    '.sd-widget-holder.sd-right{right:20px}' +
    '.sd-widget-holder.sd-left{left:20px}' +
    '.sd-widget-holder iframe{border:0;width:100%;height:100%;display:block;color-scheme:normal}' +
    '.sd-widget-bubble{position:fixed;bottom:20px;z-index:2147483000;width:64px;height:64px;' +
    'border:0;border-radius:100px;padding:0;cursor:pointer;display:flex;align-items:center;' +
    'justify-content:center;box-shadow:0 8px 24px rgba(0,0,0,.16);' +
    'transition:transform .2s ease,background .2s ease}' +
    '.sd-widget-bubble:hover{transform:scale(1.05)}' +
    '.sd-widget-bubble:focus-visible{outline:2px solid #0b5fff;outline-offset:2px}' +
    '.sd-widget-bubble.sd-right{right:20px}' +
    '.sd-widget-bubble.sd-left{left:20px}' +
    '.sd-widget-bubble svg{width:28px;height:28px;fill:#fff}' +
    '.sd-widget-bubble .sd-close{position:relative;width:24px;height:24px;display:none}' +
    '.sd-widget-bubble .sd-close::before,.sd-widget-bubble .sd-close::after{content:"";position:absolute;' +
    'left:11px;top:0;width:2px;height:24px;background:#fff}' +
    '.sd-widget-bubble .sd-close::before{transform:rotate(45deg)}' +
    '.sd-widget-bubble .sd-close::after{transform:rotate(-45deg)}' +
    '.sd-widget-bubble.sd-open svg{display:none}' +
    '.sd-widget-bubble.sd-open .sd-close{display:block}' +
    '@media (max-width:667px){.sd-widget-holder{inset:0;width:100%;height:100%;max-height:none;' +
    'border-radius:0;bottom:0}.sd-widget-holder.sd-left,.sd-widget-holder.sd-right{left:0;right:0}' +
    '.sd-widget-bubble{display:none}}'

  var style = document.createElement('style')
  style.textContent = CSS
  document.head.appendChild(style)

  var holder = document.createElement('div')
  holder.className = 'sd-widget-holder sd-' + position

  var iframe = document.createElement('iframe')
  iframe.title = frameTitle
  iframe.src = origin + '/widget/' + encodeURIComponent(token)
  holder.appendChild(iframe)

  var bubble = document.createElement('button')
  bubble.type = 'button'
  bubble.className = 'sd-widget-bubble sd-' + position
  bubble.setAttribute('aria-label', openLabel)
  bubble.setAttribute('aria-expanded', 'false')
  bubble.style.background = accent
  bubble.innerHTML =
    '<svg viewBox="0 0 24 24" aria-hidden="true">' +
    '<path d="M12 3C6.9 3 3 6.6 3 11c0 2.2 1 4.2 2.7 5.6-.2 1.2-.8 2.4-1.7 3.3 1.6.1 3.2-.4 4.4-1.3 1.1.4 2.4.6 3.6.6 5.1 0 9-3.6 9-8s-3.9-8-9-8z"/>' +
    '</svg><span class="sd-close" aria-hidden="true"></span>'

  var opened = false

  function setOpen(next) {
    opened = next
    holder.classList.toggle('sd-open', opened)
    bubble.classList.toggle('sd-open', opened)
    bubble.setAttribute('aria-expanded', opened ? 'true' : 'false')
    bubble.setAttribute('aria-label', opened ? closeLabel : openLabel)
  }

  bubble.addEventListener('click', function () {
    setOpen(!opened)
  })

  window.addEventListener('message', function (event) {
    if (event.origin !== origin) return
    var data = event.data
    if (data && typeof data === 'object' && data.type === 'sd-widget:close') setOpen(false)
  })

  window.ServiceDeskWidget = {
    open: function () {
      setOpen(true)
    },
    close: function () {
      setOpen(false)
    },
    toggle: function () {
      setOpen(!opened)
    },
    destroy: function () {
      setOpen(false)
      if (holder.parentNode) holder.parentNode.removeChild(holder)
      if (bubble.parentNode) bubble.parentNode.removeChild(bubble)
      delete window.ServiceDeskWidget
    },
  }

  document.body.appendChild(holder)
  document.body.appendChild(bubble)
})()
