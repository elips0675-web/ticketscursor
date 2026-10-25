/**
 * messages-archive-measure.mjs — замер перед архивацией сообщений (CHW-09).
 *
 * Правило из бэклога: воркер архивации строится ТОЛЬКО если в закрытых тикетах
 * старше 90 дней накопилось ≥ 100 000 сообщений. Порог не «на глаз»: ниже него
 * перенос строк в архивную таблицу даёт лишний код, лишний крон и лишнюю точку
 * отказа без выигрыша по объёму.
 *
 * Замер 25.10.2026 (dev-БД servicedesk): всего 9 сообщений, из них 2 в закрытых
 * тикетах старше 90 дней → архивация НЕ нужна. Решение и цифры — в
 * «Что сделано.txt» («CHW-09: архивация сообщений…»). Флаг `messages_archive`
 * не заводится: флаг без воркера — мёртвая конфигурация.
 *
 * Запуск:
 *   node scripts/messages-archive-measure.mjs            # живой замер (нужен mysql)
 *   node scripts/messages-archive-measure.mjs --offline   # только правило, без БД
 *
 * Переменные окружения: DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME, MYSQL_BIN.
 * Отсутствие mysql — FAIL, а не пропуск: «нет инструмента» не значит «нет данных».
 */
import { execFileSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'

export const ARCHIVE_THRESHOLD = 100_000
export const ARCHIVE_AGE_DAYS = 90

export const CANDIDATES_SQL = `SELECT COUNT(*) FROM ticket_messages m
  JOIN tickets t ON t.id = m.ticket_id
 WHERE t.status IN ('closed', 'resolved')
   AND m.created_at < NOW() - INTERVAL ${ARCHIVE_AGE_DAYS} DAY`

/**
 * Решение по замеру. Принимает число, а не читает БД: тест гоняет правило без mysql.
 * Невалидный вход — исключение, а не «не требуется»: молчаливый ноль на сломанном
 * замере выглядел бы как «архивация не нужна».
 */
export function decideArchive({ candidates, threshold = ARCHIVE_THRESHOLD } = {}) {
  if (!Number.isFinite(candidates) || candidates < 0) {
    throw new Error(`decideArchive: ожидалось неотрицательное число сообщений, получено ${candidates}`)
  }
  if (!Number.isFinite(threshold) || threshold <= 0) {
    throw new Error(`decideArchive: порог должен быть положительным числом, получено ${threshold}`)
  }

  const required = candidates >= threshold
  return {
    required,
    verdict: required ? 'required' : 'not-required',
    candidates,
    threshold,
    message: required
      ? `порог перейдён: ${candidates} ≥ ${threshold} — CHW-09 пора делать (архивация + флаг messages_archive)`
      : `порог не перейдён: ${candidates} < ${threshold} — архивация не нужна, замер повторить при росте объёма`,
  }
}

/** Вывод mysql в режиме `-N -B` — одна строка со счётом; мусор в выводе = падение. */
export function parseCount(stdout) {
  const line = String(stdout ?? '')
    .split(/\r?\n/)
    .map((part) => part.trim())
    .filter(Boolean)
    .pop()
  const value = Number(line)
  if (line === undefined || !Number.isFinite(value)) {
    throw new Error(`parseCount: ожидалось число, получено ${JSON.stringify(stdout)}`)
  }
  return value
}

/** Код выхода: перейдённый порог — сигнал «делать», а не молчаливый успех. */
export function exitCodeFor(decision) {
  return decision.required ? 1 : 0
}

function mysqlBin() {
  return process.env.MYSQL_BIN || 'mysql'
}

function runLive() {
  const args = [
    '-h',
    process.env.DB_HOST || '127.0.0.1',
    '-P',
    process.env.DB_PORT || '3306',
    '-u',
    process.env.DB_USER || 'root',
  ]
  const password = process.env.DB_PASSWORD
  if (password) args.push(`-p${password}`)
  args.push('-N', '-B', '-e', CANDIDATES_SQL, process.env.DB_NAME || 'servicedesk')

  let stdout
  try {
    stdout = execFileSync(mysqlBin(), args, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] })
  } catch (error) {
    throw new Error(
      `живой замер не выполнен (${error.code || error.message}). Это FAIL, а не пропуск: ` +
        'запустите с рабочей БД и MYSQL_BIN или осознанно с --offline',
      { cause: error },
    )
  }

  const decision = decideArchive({ candidates: parseCount(stdout) })
  console.log(`Сообщений в закрытых тикетах старше ${ARCHIVE_AGE_DAYS} дней: ${decision.candidates}`)
  console.log(`Порог архивации: ${decision.threshold}`)
  console.log(`Решение: ${decision.message}`)
  return exitCodeFor(decision)
}

function runOffline() {
  console.log(`Порог архивации: ${ARCHIVE_THRESHOLD} сообщений в закрытых тикетах старше ${ARCHIVE_AGE_DAYS} дней`)
  console.log('• статический режим (--offline): фактическое число сообщений в БД НЕ проверено')
  console.log('• цифры разового замера — в «Что сделано.txt» («CHW-09: архивация сообщений…»)')
  return 0
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const offline = process.argv.includes('--offline')
    process.exitCode = offline ? runOffline() : runLive()
  } catch (error) {
    console.error(`[messages-archive-measure] ${error.message}`)
    process.exitCode = 1
  }
}
