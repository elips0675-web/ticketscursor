import { readFileSync, writeFileSync } from 'fs'

for (const file of ['src/i18n/locales/ru.json', 'src/i18n/locales/en.json']) {
  let content = readFileSync(file, 'utf8')
  content = content.replace(/\{(\w+)\}/g, '{{$1}}')
  writeFileSync(file, content)
  console.log(file + ' fixed')
}
