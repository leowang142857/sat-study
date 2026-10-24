// Copies the OCR worker, wasm core and English language data into public/ so OCR works offline.
import { cpSync, existsSync, mkdirSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const root = new URL('..', import.meta.url).pathname
const out = join(root, 'public', 'tesseract')
mkdirSync(join(out, 'core'), { recursive: true })
mkdirSync(join(out, 'lang'), { recursive: true })

cpSync(join(root, 'node_modules/tesseract.js/dist/worker.min.js'), join(out, 'worker.min.js'))

const coreDir = join(root, 'node_modules/tesseract.js-core')
for (const f of readdirSync(coreDir)) {
  if (f.includes('lstm') && (f.endsWith('.wasm.js') || f.endsWith('.wasm'))) cpSync(join(coreDir, f), join(out, 'core', f))
}

const lang = join(root, 'node_modules/@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz')
if (existsSync(lang)) cpSync(lang, join(out, 'lang', 'eng.traineddata.gz'))

console.log('OCR assets copied to public/tesseract')
