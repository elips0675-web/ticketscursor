import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { format, formatDistanceToNow, isToday, isYesterday, differenceInDays } from 'date-fns'
import { ru, enUS, type Locale } from 'date-fns/locale'

const LOCALE_MAP: Record<string, Locale> = { ru, en: enUS }

function getDateLocale() {
  const lang = localStorage.getItem('i18nextLng') || 'ru'
  return LOCALE_MAP[lang] || ru
}

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatDate(dateStr: string): string {
  return format(new Date(dateStr), 'd MMM yyyy', { locale: getDateLocale() })
}

export function formatTime(dateStr: string): string {
  return format(new Date(dateStr), 'HH:mm')
}

export function formatRelativeTime(dateStr: string): string {
  const d = new Date(dateStr)
  const diffDays = differenceInDays(new Date(), d)
  if (diffDays < 1) {
    if (isToday(d)) return formatDistanceToNow(d, { addSuffix: true, locale: getDateLocale() })
    if (isYesterday(d)) return 'вчера'
    return format(d, 'HH:mm')
  }
  if (diffDays < 7) return `${diffDays}д`
  return formatDate(dateStr)
}
