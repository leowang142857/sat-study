import { createWorker, OEM, PSM, type Page, type Worker } from 'tesseract.js'
import type { Letter } from './types'
import { LETTERS } from './types'

export interface OcrResult {
  passage: string
  question: string
  choices: Record<Letter, string> | null
  /** Choice that was highlighted (blue) in the screenshot, if any. */
  selected: Letter | ''
  /** Charts auto-cropped from the passage pane. */
  figures: string[]
}

export type OcrProgress = (msg: string) => void

const BASE = import.meta.env.BASE_URL
let workerPromise: Promise<Worker> | null = null

function getWorker() {
  workerPromise ??= createWorker('eng', OEM.LSTM_ONLY, {
    workerPath: `${BASE}tesseract/worker.min.js`,
    corePath: `${BASE}tesseract/core`,
    langPath: `${BASE}tesseract/lang`,
    cacheMethod: 'none',
  })
  return workerPromise
}

/* ---------- pixel helpers ---------- */

interface Gray {
  w: number
  h: number
  lum: Uint8ClampedArray
  rgba: Uint8ClampedArray
}

function grayOf(c: HTMLCanvasElement): Gray {
  const { width: w, height: h } = c
  const rgba = c.getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, w, h).data
  const lum = new Uint8ClampedArray(w * h)
  for (let i = 0; i < w * h; i++) lum[i] = 0.299 * rgba[i * 4] + 0.587 * rgba[i * 4 + 1] + 0.114 * rgba[i * 4 + 2]
  return { w, h, lum, rgba }
}

function crop(src: HTMLCanvasElement, x: number, y: number, w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = Math.max(1, Math.round(w))
  c.height = Math.max(1, Math.round(h))
  c.getContext('2d')!.drawImage(src, x, y, w, h, 0, 0, c.width, c.height)
  return c
}

async function loadScaled(dataUrl: string): Promise<HTMLCanvasElement> {
  const img = new Image()
  img.src = dataUrl
  await img.decode()
  // Tesseract is much more accurate on large glyphs; typical screenshots have ~12px text.
  const scale = Math.min(3, Math.max(1, 2400 / img.naturalWidth))
  const c = document.createElement('canvas')
  c.width = Math.round(img.naturalWidth * scale)
  c.height = Math.round(img.naturalHeight * scale)
  const ctx = c.getContext('2d')!
  ctx.imageSmoothingQuality = 'high'
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, c.width, c.height)
  ctx.drawImage(img, 0, 0, c.width, c.height)
  return c
}

/** Bluebook-style layouts have a full-height vertical rule between passage and question. */
function findDivider(g: Gray): [number, number] | null {
  const y0 = Math.round(g.h * 0.08)
  const y1 = Math.round(g.h * 0.95)
  const ratio = (x: number) => {
    let n = 0
    for (let y = y0; y < y1; y++) if (g.lum[y * g.w + x] < 238) n++
    return n / (y1 - y0)
  }
  let best = -1
  let bestR = 0
  for (let x = Math.round(g.w * 0.3); x < g.w * 0.72; x++) {
    const r = ratio(x)
    if (r > bestR) [best, bestR] = [x, r]
  }
  if (bestR < 0.6) return null
  let a = best
  let b = best
  while (a > 0 && ratio(a - 1) > 0.45) a--
  while (b < g.w - 1 && ratio(b + 1) > 0.45) b++
  return [a, b]
}

interface Box {
  top: number
  bottom: number
  left: number
  right: number
  blue: boolean
}

/** Answer choices are drawn as bordered boxes; find their top/bottom edges as long dark horizontal runs. */
function findChoiceBoxes(g: Gray): Box[] | null {
  const rows: number[] = []
  for (let y = 0; y < g.h; y++) {
    let n = 0
    for (let x = 0; x < g.w; x++) if (g.lum[y * g.w + x] < 200) n++
    if (n / g.w > 0.55) rows.push(y)
  }
  const edges: number[][] = []
  for (const y of rows) {
    const last = edges.at(-1)
    if (last && y - last.at(-1)! <= 2) last.push(y)
    else edges.push([y])
  }
  if (edges.length < 8) return null
  const e = edges.slice(-8)
  const boxes: Box[] = []
  for (let i = 0; i < 8; i += 2) {
    const top = e[i].at(-1)!
    const bottom = e[i + 1][0]
    if (bottom - top < 20) return null
    const row = Math.round((e[i][0] + top) / 2)
    let left = 0
    let right = g.w - 1
    while (left < g.w && g.lum[row * g.w + left] >= 200) left++
    while (right > 0 && g.lum[row * g.w + right] >= 200) right--
    const p = (row * g.w + Math.round((left + right) / 2)) * 4
    const blue = g.rgba[p + 2] - g.rgba[p] > 60
    boxes.push({ top, bottom, left, right, blue })
  }
  return boxes
}

/** Find where the circled letter ends so only the choice text is OCR'd. */
function textStartInBox(g: Gray, b: Box): number | null {
  const pad = 4
  const y0 = b.top + pad
  const y1 = b.bottom - pad
  const colHasInk = (x: number) => {
    for (let y = y0; y < y1; y++) if (g.lum[y * g.w + x] < 170) return true
    return false
  }
  let x = b.left + pad
  while (x < b.right && !colHasInk(x)) x++
  const circleStart = x
  let blank = 0
  while (x < b.right && blank < 5) {
    blank = colHasInk(x) ? 0 : blank + 1
    x++
  }
  if (x - circleStart > (b.right - b.left) * 0.15) return null
  return x
}

/* ---------- text assembly ---------- */

const dark = (g: Gray, x: number, y: number, t = 150) => g.lum[y * g.w + x] < t

function rowCoverage(g: Gray, y: number, x0: number, x1: number, threshold = 150) {
  let n = 0
  for (let x = x0; x < x1; x++) if (dark(g, x, y, threshold)) n++
  return n / Math.max(1, x1 - x0)
}

/** A thin dark rule near the baseline spanning the word. Thin = the rows a few px above it are not solid (rules out legend squares). */
function isUnderlined(g: Gray, x0: number, x1: number, lineTop: number, y1: number): boolean {
  if (x1 - x0 < 6) return false
  const from = Math.max(4, Math.round(y1 - (y1 - lineTop) * 0.35))
  const to = Math.min(g.h - 1, y1 + 8)
  for (let y = from; y <= to; y++) {
    if (rowCoverage(g, y, x0, x1) > 0.85 && rowCoverage(g, y - 4, x0, x1) < 0.5) return true
  }
  return false
}

interface Span {
  x0: number
  x1: number
}

/** Fill-in blanks are long horizontal rules that Tesseract usually drops; find rules not under any word. */
function findBlanks(g: Gray, lineTop: number, lineBottom: number, words: Span[]): Span[] {
  const h = lineBottom - lineTop
  const minLen = Math.max(40, h * 2)
  const found: Span[] = []
  for (let y = Math.max(0, Math.round(lineBottom - h * 0.3)); y <= Math.min(g.h - 1, lineBottom + 8); y++) {
    let start = -1
    for (let x = 0; x <= g.w; x++) {
      // Blank rules are 1px in the original, so they come out light grey after upscaling;
      // 228 still sits below Bluebook's yellow highlight (~241).
      const d = x < g.w && dark(g, x, y, 228)
      if (d && start < 0) start = x
      if (!d && start >= 0) {
        const run = { x0: start, x1: x }
        start = -1
        if (run.x1 - run.x0 < minLen) continue
        if (words.some((w) => w.x0 < run.x1 && w.x1 > run.x0)) continue
        if (!found.some((f) => f.x0 < run.x1 && f.x1 > run.x0)) found.push(run)
      }
    }
  }
  return found
}

/** A small dot just left of the line's first word = list bullet (Tesseract tends to drop it). Legend squares are too big to count. */
function hasBulletBefore(g: Gray, lineX0: number, y0: number, y1: number): boolean {
  const h = y1 - y0
  let left = Infinity
  let right = -1
  let top = Infinity
  let bottom = -1
  for (let x = Math.max(0, lineX0 - Math.round(h * 2.5)); x < lineX0 - 2; x++) {
    for (let y = y0; y < y1; y++) {
      if (!dark(g, x, y, 170)) continue
      left = Math.min(left, x)
      right = Math.max(right, x)
      top = Math.min(top, y)
      bottom = Math.max(bottom, y)
    }
  }
  return right >= 0 && right - left < h * 0.55 && bottom - top < h * 0.55
}

const BULLET = /^[•·«*°e]$/
const BLANK = /^[_\-—–]{3,}[.,;:]?$/

interface ParaOut {
  text: string
  confidence: number
  words: number
  bullet: boolean
  y0: number
  y1: number
}

function pageToParagraphs(page: Page, g: Gray | null): ParaOut[] {
  const out: ParaOut[] = []
  for (const block of page.blocks ?? []) {
    for (const para of block.paragraphs) {
      let text = ''
      let inUnderline = false
      let startsWithBullet = false
      for (const [li, line] of para.lines.entries()) {
        type Tok = { text: string; bbox: { x0: number; x1: number; y1: number }; blank?: boolean }
        const words: Tok[] = line.words.map((w) => ({ text: w.text, bbox: w.bbox }))
        if (g) {
          for (const b of findBlanks(g, line.bbox.y0, line.bbox.y1, words.map((w) => w.bbox))) {
            words.push({ text: '______', bbox: { ...b, y1: line.bbox.y1 }, blank: true })
          }
          words.sort((a, b) => a.bbox.x0 - b.bbox.x0)
        }
        const textBullet = words.length > 1 && BULLET.test(words[0].text) && /^[A-Z]/.test(words[1].text)
        if (textBullet) words.shift()
        const bullet = textBullet || (g !== null && words.length > 0 && hasBulletBefore(g, words[0].bbox.x0, line.bbox.y0, line.bbox.y1))
        if (bullet) {
          if (li === 0) startsWithBullet = true
          if (inUnderline) {
            text += '}}'
            inUnderline = false
          }
          text = text.trimEnd() + (text ? '\n' : '') + '• '
        }
        for (const w of words) {
          let t = w.text
          const blank = w.blank || BLANK.test(t)
          if (blank && !w.blank) t = '______' + (t.match(/[.,;:]$/)?.[0] ?? '')
          const ul = !blank && g ? isUnderlined(g, w.bbox.x0, w.bbox.x1, line.bbox.y0, w.bbox.y1) : false
          if (!ul && inUnderline) {
            text = text.trimEnd() + '}}'
            inUnderline = false
          }
          if (ul && !inUnderline) {
            t = '{{' + t
            inUnderline = true
          }
          const hyphenJoin = /[-/]$/.test(text) && !/[—–]$/.test(text)
          const needSpace = text !== '' && !/\s$/.test(text) && !hyphenJoin
          text += (needSpace ? ' ' : '') + t
        }
      }
      if (inUnderline) text += '}}'
      text = text.replace(/\s+\}\}/g, '}}').trim()
      if (text) out.push({ text, confidence: para.confidence, words: text.split(/\s+/).length, bullet: startsWithBullet, y0: para.bbox.y0, y1: para.bbox.y1 })
    }
  }
  return out
}

function joinParagraphs(ps: ParaOut[]): string {
  return ps.map((p, i) => (i === 0 ? '' : p.bullet ? '\n' : '\n\n') + p.text).join('')
}

function pageToText(page: Page, g: Gray | null): string {
  return joinParagraphs(pageToParagraphs(page, g))
}

/** Chart labels/legends OCR as short, low-confidence fragments. Drop them and crop that area as a figure instead. */
function splitProseAndFigure(ps: ParaOut[], pane: HTMLCanvasElement): { passage: string; figure: string | null } {
  const isProse = (p: ParaOut) => p.bullet || p.words >= 12 || (p.confidence >= 80 && p.words >= 4 && /[.?!:;]$/.test(p.text))
  const prose = ps.filter(isProse)
  const junk = ps.filter((p) => !isProse(p))
  if (!prose.length || !junk.length) return { passage: joinParagraphs(ps), figure: null }

  const top = Math.min(...prose.map((p) => p.y0))
  const bottom = Math.max(...prose.map((p) => p.y1))
  const above = junk.filter((p) => p.y1 <= top)
  const below = junk.filter((p) => p.y0 >= bottom)
  let figure: string | null = null
  const pad = 12
  if (above.length) {
    const y1 = Math.max(0, top - pad)
    figure = trimWhite(crop(pane, 0, 0, pane.width, y1))
  } else if (below.length) {
    const y0 = bottom + pad
    figure = trimWhite(crop(pane, 0, y0, pane.width, pane.height - y0))
  }
  return { passage: joinParagraphs(prose), figure }
}

function trimWhite(c: HTMLCanvasElement): string | null {
  const g = grayOf(c)
  let x0 = g.w
  let y0 = g.h
  let x1 = -1
  let y1 = -1
  // Skip Bluebook's coloured dashed header rule if the crop reaches the top of the screenshot (charts are greyscale).
  let startY = 0
  for (let y = 0; y < Math.min(g.h, 40); y++) {
    let colored = 0
    for (let x = 0; x < g.w; x++) {
      const p = (y * g.w + x) * 4
      const r = g.rgba[p]
      const gr = g.rgba[p + 1]
      const b = g.rgba[p + 2]
      if (Math.max(r, gr, b) - Math.min(r, gr, b) > 25) colored++
    }
    // +3 clears the anti-aliased fringe left by upscaling.
    if (colored / g.w > 0.1) startY = y + 3
  }
  for (let y = startY; y < g.h; y++)
    for (let x = 0; x < g.w; x++)
      if (g.lum[y * g.w + x] < 235) {
        if (x < x0) x0 = x
        if (x > x1) x1 = x
        if (y < y0) y0 = y
        if (y > y1) y1 = y
      }
  if (x1 < 0 || x1 - x0 < 40 || y1 - y0 < 40) return null
  const m = 10
  const left = Math.max(0, x0 - m)
  const top = Math.max(startY, y0 - m)
  const out = crop(c, left, top, Math.min(g.w, x1 + m) - left, Math.min(g.h, y1 + m) - top)
  // OCR canvases are upscaled; bring figures back to a sane size.
  return scaleTo(out, Math.min(1, 900 / out.width)).toDataURL('image/webp', 0.9)
}

function scaleTo(c: HTMLCanvasElement, k: number): HTMLCanvasElement {
  if (k >= 1) return c
  const o = document.createElement('canvas')
  o.width = Math.round(c.width * k)
  o.height = Math.round(c.height * k)
  const ctx = o.getContext('2d')!
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(c, 0, 0, o.width, o.height)
  return o
}

function cleanQuestion(text: string): string {
  return text
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !/mark\s*for\s*review/i.test(l) && l.replace(/[^a-z]/gi, '').length > 3)
    .join(' ')
    .replace(/^\d+\s+/, '')
    .replace(/\s+/g, ' ')
    .trim()
}

const MARKERS: Record<string, Letter> = { '@': 'A', '®': 'B', '©': 'C' }

/** Fallback when no choice boxes are found: split on "(A)", "B)", "©" … line markers. */
function splitChoicesFromText(text: string): { question: string; choices: Record<Letter, string> | null } {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean)
  const choices: Record<Letter, string> = { A: '', B: '', C: '', D: '' }
  const q: string[] = []
  let cur: Letter | null = null
  let expect = 0
  for (const line of lines) {
    const m = line.match(/^(?:\(?([A-D])\)|([A-D])[.)]|([@®©]))\s*(.*)$/) ?? line.match(/^([A-D])\s+(.*)$/)
    const letter = m ? ((m[1] || m[2] || MARKERS[m[3]] || m[1]) as Letter) : null
    if (letter && LETTERS.indexOf(letter) === expect) {
      cur = letter
      expect++
      choices[cur] = (m!.at(-1) ?? '').trim()
    } else if (cur) choices[cur] += ' ' + line
    else q.push(line)
  }
  return { question: cleanQuestion(q.join('\n')), choices: expect === 4 ? choices : null }
}

/* ---------- main ---------- */

export async function ocrScreenshot(dataUrl: string, progress: OcrProgress = () => {}): Promise<OcrResult> {
  progress('加载识别引擎…')
  const worker = await getWorker()
  const full = await loadScaled(dataUrl)
  const g = grayOf(full)

  progress('分析版面…')
  const divider = findDivider(g)
  const left = divider ? crop(full, 0, 0, divider[0] - 4, full.height) : null
  const right = divider ? crop(full, divider[1] + 4, 0, full.width - divider[1] - 4, full.height) : full

  let passage = ''
  const figures: string[] = []
  if (left) {
    progress('识别左栏文章…')
    await worker.setParameters({ tessedit_pageseg_mode: PSM.AUTO })
    const { data } = await worker.recognize(left, {}, { blocks: true, text: true })
    const split = splitProseAndFigure(pageToParagraphs(data, grayOf(left)), left)
    passage = split.passage
    if (split.figure) figures.push(split.figure)
  }

  const rg = grayOf(right)
  const boxes = findChoiceBoxes(rg)
  if (boxes) {
    progress('识别问题…')
    await worker.setParameters({ tessedit_pageseg_mode: PSM.AUTO })
    const qCanvas = crop(right, 0, 0, right.width, Math.max(1, boxes[0].top - 4))
    const { data: qd } = await worker.recognize(qCanvas, {}, { blocks: true, text: true })
    const question = cleanQuestion(qd.text)

    const choices: Record<Letter, string> = { A: '', B: '', C: '', D: '' }
    await worker.setParameters({ tessedit_pageseg_mode: PSM.SINGLE_BLOCK })
    for (let i = 0; i < 4; i++) {
      const b = boxes[i]
      progress(`识别选项 ${LETTERS[i]}…`)
      const start = textStartInBox(rg, b)
      const x = start ?? b.left + 4
      const c = crop(right, x, b.top + 4, b.right - 4 - x, b.bottom - b.top - 8)
      const { data } = await worker.recognize(c, {}, { text: true })
      let t = data.text.replace(/\s+/g, ' ').trim()
      if (start === null) t = t.replace(/^[([]?[A-D@®©][)\]]?\s+/, '')
      choices[LETTERS[i]] = t
    }
    const sel = boxes.findIndex((b) => b.blue)
    progress('完成')
    return { passage, question, choices, selected: sel >= 0 ? LETTERS[sel] : '', figures }
  }

  progress('识别右栏…')
  await worker.setParameters({ tessedit_pageseg_mode: PSM.AUTO })
  const { data } = await worker.recognize(right, {}, { blocks: true, text: true })
  const rightText = divider ? data.text : pageToText(data, rg)
  const { question, choices } = splitChoicesFromText(rightText)
  progress('完成')
  return { passage, question: question || (divider ? '' : cleanQuestion(rightText)), choices, selected: '', figures }
}
