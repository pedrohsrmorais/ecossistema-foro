// Roda depois do build: gera ../backend/dist/prerender.json com o HTML das páginas públicas (lido pelo server.js).
import { writeFileSync, rmSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import path from 'node:path'

const ssrDir = path.resolve('.prerender-build')
const mod = await import(pathToFileURL(path.join(ssrDir, 'prerender.mjs')).href)
const pages = mod.renderAll()
for (const [k, p] of Object.entries(pages)) {
  if (!p.html || p.html.length < 500) throw new Error(`pré-renderização vazia: ${k}`)
}
writeFileSync(path.resolve('../backend/dist/prerender.json'), JSON.stringify(pages))
rmSync(ssrDir, { recursive: true, force: true })
console.log('prerender:', Object.entries(pages).map(([k, p]) => `${k} (${p.html.length} bytes)`).join(', '))
