// Controllo "hook dopo un return anticipato": in un componente React gli hook
// (useState, useEffect, ...) devono essere sempre chiamati nello stesso ordine.
// Se compaiono DOPO un `if (...) return` il numero di hook cambia tra un render e
// l'altro e la pagina si rompe ("Rendered more hooks than during the previous
// render"). Lo script lo cerca in tutti i componenti di src/ e fa fallire la
// build (vedi "prebuild" in package.json) se ne trova. Euristica: guarda solo i
// componenti dichiarati con `function Nome(` e gli hook/`return` a indentazione 2.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = new URL('../src', import.meta.url).pathname
const HOOK = /^ {2}(?:const .*= )?(use[A-Z]\w*)\(/
const EARLY_RETURN = /^ {2}if \(.*\) return\b/
const EARLY_BLOCK = /^ {2}if \(.*\) \{$/

function* files(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) yield* files(p)
    else if (p.endsWith('.jsx')) yield p
  }
}

const problems = []
for (const file of files(ROOT)) {
  const lines = readFileSync(file, 'utf8').split('\n')
  for (let i = 0; i < lines.length; i++) {
    if (!/^(export default )?function [A-Z]\w*\(/.test(lines[i])) continue
    let end = i + 1
    while (end < lines.length && !lines[end].startsWith('}')) end++
    let early = null
    for (let k = i + 1; k < end; k++) {
      const line = lines[k]
      if (early === null && EARLY_RETURN.test(line)) early = k
      else if (early === null && EARLY_BLOCK.test(line)) {
        let m = k + 1
        while (m < end && !lines[m].startsWith('  }')) m++
        if (lines.slice(k + 1, m).some(x => /^ {4}return\b/.test(x))) early = k
      } else if (early !== null && HOOK.test(line)) {
        problems.push(`${file.replace(ROOT, 'src')}:${k + 1} — hook dopo il return anticipato di riga ${early + 1}: ${line.trim().slice(0, 70)}`)
      }
    }
    i = end
  }
}

if (problems.length) {
  console.error('\nHook chiamati dopo un return anticipato (rompono la pagina):\n' + problems.map(p => '  ' + p).join('\n') + '\n')
  process.exit(1)
}
console.log('check-hooks: nessun hook dopo un return anticipato')
