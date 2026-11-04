import type { TextItem } from 'pdfjs-dist/types/src/display/api'
import { ocrPageText } from './ocr'

export type PdfProgress = { phase: 'open' } | { phase: 'text'; page: number; total: number } | { phase: 'ocr'; page: number; total: number }

export interface PdfPages {
  pages: string[][]
  /** Document-info title, when the PDF has a meaningful one. */
  title: string
  ocr: boolean
  /** Scanned pages past the OCR cap that were not read. */
  skippedPages: number
}

/** Scanned PDFs are OCR'd page by page with Tesseract (~seconds per page), so cap the work. */
export const MAX_OCR_PAGES = 30

const BASE = import.meta.env.BASE_URL

async function loadPdfjs() {
  const [pdfjs, worker] = await Promise.all([import('pdfjs-dist/legacy/build/pdf.mjs'), import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url')])
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default
  return pdfjs
}

/** Rebuild reading-order lines from positioned text runs; a large vertical gap becomes a blank line (paragraph break). */
function itemsToLines(items: TextItem[]): string[] {
  const runs = items
    .filter((it) => it.str.trim())
    .map((it) => ({ str: it.str, x: it.transform[4] as number, y: it.transform[5] as number, w: it.width, h: Math.abs(it.height) || Math.abs(it.transform[3] as number) || 10 }))
  if (!runs.length) return []
  runs.sort((a, b) => b.y - a.y || a.x - b.x)
  const lines: { y: number; h: number; runs: typeof runs }[] = []
  for (const r of runs) {
    const line = lines.find((l) => Math.abs(l.y - r.y) <= Math.max(2, Math.min(l.h, r.h) * 0.5))
    if (line) line.runs.push(r)
    else lines.push({ y: r.y, h: r.h, runs: [r] })
  }
  lines.sort((a, b) => b.y - a.y)
  const heights = lines.map((l) => l.h).sort((a, b) => a - b)
  const lineH = heights[Math.floor(heights.length / 2)]
  const out: string[] = []
  let prevY: number | null = null
  for (const l of lines) {
    l.runs.sort((a, b) => a.x - b.x)
    let text = ''
    let end = -Infinity
    for (const r of l.runs) {
      const gap = r.x - end
      if (text && !/\s$/.test(text) && !/^\s/.test(r.str) && gap > r.h * 0.15) text += ' '
      text += r.str
      end = r.x + r.w
    }
    if (prevY !== null && prevY - l.y > lineH * 1.9) out.push('')
    out.push(text.replace(/\s+/g, ' ').trim())
    prevY = l.y
  }
  return out
}

function usefulTitle(info: unknown): string {
  const title = typeof (info as { Title?: unknown })?.Title === 'string' ? ((info as { Title: string }).Title).trim() : ''
  if (!title || /^(untitled|microsoft word\b|document\d*$)/i.test(title) || /\.[a-z0-9]{2,5}$/i.test(title)) return ''
  return title
}

export async function readPdf(file: File, progress: (p: PdfProgress) => void, signal: AbortSignal): Promise<PdfPages> {
  progress({ phase: 'open' })
  const pdfjs = await loadPdfjs()
  const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()), cMapUrl: `${BASE}pdfjs/cmaps/`, cMapPacked: true })
  const abort = () => void task.destroy()
  signal.addEventListener('abort', abort)
  let doc
  try {
    doc = await task.promise
  } catch (err) {
    if (signal.aborted) throw new DOMException('aborted', 'AbortError')
    const name = (err as { name?: string })?.name
    throw new Error(name === 'PasswordException' ? 'pdf-password' : 'pdf-invalid')
  }
  try {
    const total = doc.numPages
    const pages: string[][] = []
    let chars = 0
    for (let i = 1; i <= total; i++) {
      if (signal.aborted) throw new DOMException('aborted', 'AbortError')
      progress({ phase: 'text', page: i, total })
      const page = await doc.getPage(i)
      const content = await page.getTextContent()
      const lines = itemsToLines(content.items.filter((it): it is TextItem => 'str' in it))
      chars += lines.join('').replace(/\s/g, '').length
      pages.push(lines)
      page.cleanup()
    }
    const title = usefulTitle((await doc.getMetadata().catch(() => null))?.info)

    if (chars >= Math.max(40, total * 25)) return { pages, title, ocr: false, skippedPages: 0 }

    const count = Math.min(total, MAX_OCR_PAGES)
    const ocrPages: string[][] = []
    for (let i = 1; i <= count; i++) {
      if (signal.aborted) throw new DOMException('aborted', 'AbortError')
      progress({ phase: 'ocr', page: i, total: count })
      const page = await doc.getPage(i)
      const base = page.getViewport({ scale: 1 })
      const viewport = page.getViewport({ scale: Math.min(3, 2000 / base.width) })
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(viewport.width)
      canvas.height = Math.round(viewport.height)
      await page.render({ canvas, viewport }).promise
      const text = await ocrPageText(canvas)
      ocrPages.push(text.split('\n').map((l) => l.trim()))
      page.cleanup()
    }
    if (!ocrPages.some((p) => p.join('').replace(/\s/g, '').length > 20)) throw new Error('pdf-no-text')
    return { pages: ocrPages, title, ocr: true, skippedPages: total - count }
  } finally {
    signal.removeEventListener('abort', abort)
    void task.destroy()
  }
}
