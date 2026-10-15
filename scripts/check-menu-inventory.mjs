// Гейт «menu-inventory» (пункт 1 разбора внешних аудитов, «Что-доделать.txt»).
//
// Правило: пункт меню — это не «картинка в сайдбаре», а контракт из четырёх
// частей, которые обязаны сойтись:
//   1. маршрут `to` объявлен в `src/App.tsx` (иначе пункт ведёт в 404/редирект);
//   2. ключ перевода `labelKey` есть и в ru, и в en (иначе raw key пользователю);
//   3. каждая роль из `roles` входит в тип `EmployeeRole`;
//   4. флаг фичи из `feature` объявлен в миграциях и читается файлом меню через
//      `useFeature` (иначе пункт не появится никогда).
//
// Список пунктов НЕ хардкодится: он читается из самих TSX-файлов меню
// (`scripts/menu-inventory.mjs`), поэтому переименование массива — это FAIL
// («проверял пустоту»), а не тихий зелёный.
//
// Использование: node scripts/check-menu-inventory.mjs   (exit 0 — целостно, 1 — расхождение)

import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { loadMenuModel, auditMenu, ROUTES_FILE } from './menu-inventory.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

export { loadMenuModel, auditMenu, ROUTES_FILE }

function main() {
  const model = loadMenuModel(ROOT)
  const findings = auditMenu(model)

  const byFile = new Map()
  for (const item of model.menu.items) byFile.set(item.file, (byFile.get(item.file) ?? 0) + 1)
  for (const [file, count] of byFile) console.log(`• ${file} — ${count} пункт(ов)`)
  console.log(
    `  маршрутов в ${ROUTES_FILE}: ${model.routes.size}; ролей: ${(model.roles ?? []).length}; флагов фич: ${model.flags.size}`,
  )

  if (findings.length > 0) {
    for (const f of findings) console.error(`✗ ${f.msg}`)
    console.error(`\nИтог: FAIL — инвентарь меню разошёлся с кодом (${findings.length} находок).`)
    process.exit(1)
  }
  console.log(`\nИтог: инвентарь меню целостен (${model.menu.items.length} пунктов) ✓`)
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main()
}
