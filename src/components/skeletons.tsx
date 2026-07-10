import { Skeleton } from '@/components/ui/skeleton'

export function SkeletonCard() {
  return (
    <div className="rounded-xl border bg-card p-4 space-y-3">
      <Skeleton className="h-5 w-3/4" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-1/2" />
      <div className="flex gap-2 pt-2">
        <Skeleton className="h-5 w-16 rounded-full" />
        <Skeleton className="h-5 w-16 rounded-full" />
      </div>
    </div>
  )
}

export function SkeletonCardGrid({ count = 6, cols = 3 }: { count?: number; cols?: 1 | 2 | 3 }) {
  const gridCols = { 1: 'grid-cols-1', 2: 'grid-cols-1 sm:grid-cols-2', 3: 'grid-cols-1 sm:grid-cols-2 xl:grid-cols-3' }
  return (
    <div className={`grid ${gridCols[cols]} gap-4`}>
      {Array.from({ length: count }).map((_, i) => <SkeletonCard key={i} />)}
    </div>
  )
}

export function SkeletonTableRow({ cols = 4 }: { cols?: number }) {
  return (
    <div className="flex items-center gap-4 p-3 border-b">
      {Array.from({ length: cols }).map((_, i) => (
        <Skeleton key={i} className={`h-4 ${i === 0 ? 'w-1/4' : 'w-1/6'}`} />
      ))}
    </div>
  )
}

export function SkeletonChatRow() {
  return (
    <div className="flex items-center gap-3 p-3">
      <Skeleton className="h-10 w-10 rounded-full shrink-0" />
      <div className="flex-1 space-y-2">
        <Skeleton className="h-4 w-1/3" />
        <Skeleton className="h-3 w-2/3" />
      </div>
    </div>
  )
}
