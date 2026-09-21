import { getSettings } from './settings.js'

const DEFAULT_WORKING_DAYS = [1, 2, 3, 4, 5]
const DEFAULT_WORKING_HOURS_START = 9
const DEFAULT_WORKING_HOURS_END = 18

function getBusinessSettings(settings) {
  const workingDays = settings.BUSINESS_WORKING_DAYS
    ? JSON.parse(settings.BUSINESS_WORKING_DAYS)
    : DEFAULT_WORKING_DAYS
  const startHour = Number(settings.BUSINESS_HOURS_START) || DEFAULT_WORKING_HOURS_START
  const endHour = Number(settings.BUSINESS_HOURS_END) || DEFAULT_WORKING_HOURS_END
  return { workingDays, startHour, endHour }
}

function isWorkingDay(date, workingDays) {
  const day = date.getDay()
  return workingDays.includes(day)
}

function getWorkEndToday(date, endHour) {
  const end = new Date(date)
  end.setHours(endHour, 0, 0, 0)
  return end
}

function getWorkStartToday(date, startHour) {
  const start = new Date(date)
  start.setHours(startHour, 0, 0, 0)
  return start
}

function getNextWorkStart(date, workingDays, startHour) {
  const next = new Date(date)
  next.setHours(startHour, 0, 0, 0)
  while (!isWorkingDay(next, workingDays) || next <= date) {
    next.setDate(next.getDate() + 1)
    next.setHours(startHour, 0, 0, 0)
  }
  return next
}

export function addBusinessHours(startDate, hoursToAdd, settings = {}) {
  const { workingDays, startHour, endHour } = getBusinessSettings(settings)
  let remaining = hoursToAdd * 60 * 60 * 1000
  let current = new Date(startDate)

  while (remaining > 0) {
    if (!isWorkingDay(current, workingDays)) {
      current = getNextWorkStart(current, workingDays, startHour)
      continue
    }

    const workStart = getWorkStartToday(current, startHour)
    const workEnd = getWorkEndToday(current, endHour)

    if (current < workStart) {
      current = workStart
      continue
    }

    if (current >= workEnd) {
      current.setDate(current.getDate() + 1)
      current.setHours(startHour, 0, 0, 0)
      continue
    }

    const availableMs = workEnd.getTime() - current.getTime()
    if (remaining <= availableMs) {
      return new Date(current.getTime() + remaining)
    }

    remaining -= availableMs
    current.setDate(current.getDate() + 1)
    current.setHours(startHour, 0, 0, 0)
  }

  return current
}

export function getRemainingBusinessMs(from, dueAt, settings = {}) {
  const { workingDays, startHour, endHour } = getBusinessSettings(settings)
  let remaining = 0
  let current = new Date(from)

  while (current < dueAt) {
    if (!isWorkingDay(current, workingDays)) {
      current = getNextWorkStart(current, workingDays, startHour)
      continue
    }

    const workStart = getWorkStartToday(current, startHour)
    const workEnd = getWorkEndToday(current, endHour)

    if (current < workStart) {
      current = workStart
      continue
    }

    if (current >= workEnd) {
      current.setDate(current.getDate() + 1)
      current.setHours(startHour, 0, 0, 0)
      continue
    }

    const slotEnd = workEnd < dueAt ? workEnd : dueAt
    remaining += slotEnd.getTime() - current.getTime()
    current = new Date(slotEnd)

    if (current.getTime() === workEnd.getTime()) {
      current.setDate(current.getDate() + 1)
      current.setHours(startHour, 0, 0, 0)
    }
  }

  return remaining
}

export function isWithinBusinessHours(date, settings = {}) {
  const { workingDays, startHour, endHour } = getBusinessSettings(settings)
  if (!isWorkingDay(date, workingDays)) return false
  const hour = date.getHours()
  return hour >= startHour && hour < endHour
}
