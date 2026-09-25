// Этап 63 (подфича 2): метаданные сессии (device/ip/UA) для refresh_tokens.
// device_name — компактная строка «Браузер · ОС», заполняется из User-Agent.

export function parseUserAgent(ua = '') {
  if (!ua) return { device: 'Unknown device', isMobile: false }
  let os = 'Unknown OS'
  if (/Windows/i.test(ua)) os = 'Windows'
  else if (/Mac OS X|Macintosh/i.test(ua)) os = 'macOS'
  else if (/Android/i.test(ua)) os = 'Android'
  else if (/iPhone|iPad|iPod/i.test(ua)) os = 'iOS'
  else if (/Linux/i.test(ua)) os = 'Linux'

  let browser = 'Browser'
  if (/Edg\//i.test(ua)) browser = 'Edge'
  else if (/OPR\/|Opera/i.test(ua)) browser = 'Opera'
  else if (/Chrome\//i.test(ua)) browser = 'Chrome'
  else if (/Firefox\//i.test(ua)) browser = 'Firefox'
  else if (/Safari\//i.test(ua)) browser = 'Safari'

  const isMobile = /Mobile|Android|iPhone|iPad|iPod/i.test(ua)
  return { device: `${browser} · ${os}`, isMobile }
}

export function sessionMeta(req) {
  const ua = req?.headers?.['user-agent'] || ''
  const { device } = parseUserAgent(ua)
  return {
    device_name: device,
    ip_address: req?.ip || '',
    user_agent: ua.slice(0, 500),
  }
}