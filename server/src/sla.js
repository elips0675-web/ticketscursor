import { getSettings } from './settings.js'

const DEFAULT_WORKING_DAYS = [1, 2, 3, 4, 5]
const DEFAULT_WORKING_HOURS_START = 9
const DEFAULT_WORKING_HOURS_END = 18

const WEEKDAY_INDEX = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }

function getBusinessSettings(settings) {
  const workingDays = settings.BUSINESS_WORKING_DAYS
    ? JSON.parse(settings.BUSINESS_WORKING_DAYS)
    : DEFAULT_WORKING_DAYS
  const startHour = Number(settings.BUSINESS_HOURS_START) || DEFAULT_WORKING_HOURS_START
  const endHour = Number(settings.BUSINESS_HOURS_END) || DEFAULT_WORKING_HOURS_END
  let timeZone = settings.TIMEZONE ? String(settings.TIMEZONE) : null
  if (timeZone) {
    try {
      new Intl.DateTimeFormat('en-US', { timeZone })
    } catch {
      timeZone = null
    }
  }
  return { workingDays, startHour, endHour, timeZone }
}

function zonedParts(date, timeZone) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'short',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(date)
  const map = {}
  for (const p of parts) map[p.type] = p.value
  const hour = map.hour === '24' ? '0' : map.hour
  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    hour: Number(hour),
    minute: Number(map.minute),
    second: Number(map.second),
    dayOfWeek: WEEKDAY_INDEX[map.weekday],
  }
}

function utcFromWallTime(wall, timeZone) {
  let ms = Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute, wall.second || 0)
  for (let i = 0; i < 4; i++) {
    const z = zonedParts(new Date(ms), timeZone)
    if (
      z.year === wall.year && z.month === wall.month && z.day === wall.day &&
      z.hour === wall.hour && z.minute === (wall.minute || 0)
    ) {
      return new Date(ms)
    }
    const diffMin = (z.hour * 60 + z.minute) - (wall.hour * 60 + (wall.minute || 0))
    ms -= diffMin * 60000
    const z2 = zonedParts(new Date(ms), timeZone)
    const dayDiff = (Date.UTC(z2.year, z2.month - 1, z2.day) - Date.UTC(wall.year, wall.month - 1, wall.day)) / 86400000
    if (dayDiff !== 0) ms -= Math.round(dayDiff) * 86400000
  }
  return new Date(ms)
}

function wallStartOfDay(date, startHour, timeZone) {
  const parts = zonedParts(date, timeZone)
  return { year: parts.year, month: parts.month, day: parts.day, hour: startHour, minute: 0, second: 0 }
}

function isWorkingDay(date, workingDays, timeZone) {
  const day = timeZone ? zonedParts(date, timeZone).dayOfWeek : date.getDay()
  return workingDays.includes(day)
}

function getWorkStartToday(date, startHour, timeZone) {
  if (timeZone) return utcFromWallTime(wallStartOfDay(date, startHour, timeZone), timeZone)
  const start = new Date(date)
  start.setHours(startHour, 0, 0, 0)
  return start
}

function getWorkEndToday(date, endHour, timeZone) {
  if (timeZone) return utcFromWallTime(wallStartOfDay(date, endHour, timeZone), timeZone)
  const end = new Date(date)
  end.setHours(endHour, 0, 0, 0)
  return end
}

function getNextWorkStart(date, workingDays, startHour, timeZone) {
  if (timeZone) {
    const wall = wallStartOfDay(date, startHour, timeZone)
    let candidate = utcFromWallTime(wall, timeZone)
    while (!isWorkingDay(candidate, workingDays, timeZone) || candidate <= date) {
      wall.day += 1
      candidate = utcFromWallTime(wall, timeZone)
    }
    return candidate
  }
  const next = new Date(date)
  next.setHours(startHour, 0, 0, 0)
  while (!isWorkingDay(next, workingDays, null) || next <= date) {
    next.setDate(next.getDate() + 1)
    next.setHours(startHour, 0, 0, 0)
  }
  return next
}

export function addBusinessHours(startDate, hoursToAdd, settings = {}) {
  const { workingDays, startHour, endHour, timeZone } = getBusinessSettings(settings)
  let remaining = hoursToAdd * 60 * 60 * 1000
  let current = new Date(startDate)

  while (remaining > 0) {
    if (!isWorkingDay(current, workingDays, timeZone)) {
      current = getNextWorkStart(current, workingDays, startHour, timeZone)
      continue
    }

    const workStart = getWorkStartToday(current, startHour, timeZone)
    const workEnd = getWorkEndToday(current, endHour, timeZone)

    if (current < workStart) {
      current = workStart
      continue
    }

    if (current >= workEnd) {
      current = getNextWorkStart(current, workingDays, startHour, timeZone)
      continue
    }

    const availableMs = workEnd.getTime() - current.getTime()
    if (remaining <= availableMs) {
      return new Date(current.getTime() + remaining)
    }

    remaining -= availableMs
    current = getNextWorkStart(workEnd, workingDays, startHour, timeZone)
  }

  return current
}

export function getRemainingBusinessMs(from, dueAt, settings = {}) {
  const { workingDays, startHour, endHour, timeZone } = getBusinessSettings(settings)
  let remaining = 0
  let current = new Date(from)

  while (current < dueAt) {
    if (!isWorkingDay(current, workingDays, timeZone)) {
      current = getNextWorkStart(current, workingDays, startHour, timeZone)
      continue
    }

    const workStart = getWorkStartToday(current, startHour, timeZone)
    const workEnd = getWorkEndToday(current, endHour, timeZone)

    if (current < workStart) {
      current = workStart
      continue
    }

    if (current >= workEnd) {
      current = getNextWorkStart(current, workingDays, startHour, timeZone)
      continue
    }

    const slotEnd = workEnd < dueAt ? workEnd : dueAt
    remaining += slotEnd.getTime() - current.getTime()
    current = new Date(slotEnd)

    if (current.getTime() === workEnd.getTime()) {
      current = getNextWorkStart(workEnd, workingDays, startHour, timeZone)
    }
  }

  return remaining
}

export function isWithinBusinessHours(date, settings = {}) {
  const { workingDays, startHour, endHour, timeZone } = getBusinessSettings(settings)
  if (!isWorkingDay(date, workingDays, timeZone)) return false
  const hour = timeZone ? zonedParts(date, timeZone).hour : date.getHours()
  return hour >= startHour && hour < endHour
}