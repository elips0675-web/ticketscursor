import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { format, formatDistanceToNow, formatRelative, isToday, isYesterday, differenceInDays } from 'date-fns'
import { ru } from 'date-fns/locale'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatDate(dateStr: string): string {
  return format(new Date(dateStr), 'd MMM yyyy', { locale: ru })
}

export function formatTime(dateStr: string): string {
  return format(new Date(dateStr), 'HH:mm')
}

export function formatRelativeTime(dateStr: string): string {
  const d = new Date(dateStr)
  const diffDays = differenceInDays(new Date(), d)
  if (diffDays < 1) {
    if (isToday(d)) return formatDistanceToNow(d, { addSuffix: true, locale: ru })
    if (isYesterday(d)) return 'вчера'
    return format(d, 'HH:mm')
  }
  if (diffDays < 7) return `${diffDays}д`
  return formatDate(dateStr)
}
