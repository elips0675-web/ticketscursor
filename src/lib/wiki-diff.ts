// Построчный diff (LCS) для «Истории версий» Wiki (Этап 65).
// Никаких зависимостей: чистые функции, легко тестируются в jsdom/vitest.

export type DiffLine = { type: 'same' | 'add' | 'del'; text: string }

/** LCS-таблица для построчного сравнения. */
export function computeLcs(a: string[], b: string[]): number[][] {
  const n = a.length
  const m = b.length
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0))
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1])
    }
  }
  return dp
}

/** Построчный diff между oldText и newText. */
export function diffLines(oldText: string, newText: string): DiffLine[] {
  const a = oldText === '' ? [] : oldText.split('\n')
  const b = newText === '' ? [] : newText.split('\n')
  const dp = computeLcs(a, b)
  const out: DiffLine[] = []
  let i = 0
  let j = 0
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) {
      out.push({ type: 'same', text: a[i] })
      i++
      j++
    } else if (j < b.length && (i >= a.length || dp[i + 1][j] <= dp[i][j + 1])) {
      out.push({ type: 'add', text: b[j] })
      j++
    } else if (i < a.length) {
      out.push({ type: 'del', text: a[i] })
      i++
    }
  }
  return out
}

/** Короткая статистика изменений: { added, removed } — для подписи «+3 / −2». */
export function diffStats(diff: DiffLine[]): { added: number; removed: number } {
  return {
    added: diff.filter((l) => l.type === 'add').length,
    removed: diff.filter((l) => l.type === 'del').length,
  }
}

/** Возвращает текстовое представление diff (для CSV/тестов), маркеры +/−. */
export function diffToPlain(diff: DiffLine[]): string {
  return diff
    .map((l) => (l.type === 'add' ? `+ ${l.text}` : l.type === 'del' ? `- ${l.text}` : `  ${l.text}`))
    .join('\n')
}
