import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useI18n } from '../i18n'
import type { PracticeImportSummary } from '../importPractice'
import { importErrorDetail, sectionName } from '../messages'
import { readPdf, type PdfProgress } from '../pdfExtract'
import { parsePdfLines, pdfToPracticeJson, type ParsedPdf } from '../pdfParse'
import { useStore } from '../store'
import { LETTERS } from '../types'

const isPdf = (f: File) => f.type === 'application/pdf' || /\.pdf$/i.test(f.name)

/** Hidden file input + PDF dialog behind every 导入题集 button. JSON goes straight to the store as before. */
export function usePracticeImport(onDone: (r: PracticeImportSummary) => void) {
  const { importPracticeSet } = useStore()
  const { t } = useI18n()
  const inputRef = useRef<HTMLInputElement>(null)
  const [pdf, setPdf] = useState<File | null>(null)

  const ui = (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="application/json,.json,application/pdf,.pdf"
        hidden
        onChange={async (e) => {
          const f = e.target.files?.[0]
          e.target.value = ''
          if (!f) return
          if (isPdf(f)) {
            setPdf(f)
            return
          }
          try {
            onDone(await importPracticeSet(f))
          } catch (err) {
            alert(t.backup.failed(importErrorDetail(err, t)))
          }
        }}
      />
      {pdf &&
        createPortal(
          <PdfImportDialog
            file={pdf}
            onClose={() => setPdf(null)}
            onDone={(r) => {
              setPdf(null)
              onDone(r)
            }}
          />,
          document.body,
        )}
    </>
  )
  return { open: () => inputRef.current?.click(), ui }
}

type State =
  | { step: 'reading'; progress: PdfProgress }
  | { step: 'review'; parsed: ParsedPdf; ocr: boolean; read: number; skipped: number }
  | { step: 'error'; error: unknown }

function PdfImportDialog({ file, onClose, onDone }: { file: File; onClose: () => void; onDone: (r: PracticeImportSummary) => void }) {
  const { t } = useI18n()
  const { importPracticeData } = useStore()
  const [state, setState] = useState<State>({ step: 'reading', progress: { phase: 'open' } })
  const [name, setName] = useState(() => file.name.replace(/\.pdf$/i, '').trim())
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const ctrl = new AbortController()
    readPdf(file, (progress) => setState({ step: 'reading', progress }), ctrl.signal)
      .then((r) => {
        const parsed = parsePdfLines(r.pages)
        const title = r.title || parsed.title
        if (title) setName(title)
        setState({ step: 'review', parsed, ocr: r.ocr, read: r.pages.length, skipped: r.skippedPages })
      })
      .catch((error) => {
        if (!ctrl.signal.aborted) setState({ step: 'error', error })
      })
    return () => ctrl.abort()
  }, [file])

  async function save(parsed: ParsedPdf) {
    setSaving(true)
    try {
      onDone(await importPracticeData(pdfToPracticeJson(parsed, name.trim())))
    } catch (error) {
      setState({ step: 'error', error })
    } finally {
      setSaving(false)
    }
  }

  let body
  let action = null
  if (state.step === 'reading') {
    const p = state.progress
    const text = p.phase === 'open' ? t.pdf.open : p.phase === 'text' ? t.pdf.reading(p.page, p.total) : t.pdf.ocr(p.page, p.total)
    const pct = p.phase === 'open' ? 0 : Math.round(((p.page - 1) / p.total) * 100)
    body = (
      <>
        <div className="ocr-status busy">{text}</div>
        <div className="pdf-progress" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
          <div style={{ width: `${pct}%` }} />
        </div>
      </>
    )
  } else if (state.step === 'error') {
    body = <p className="pdf-error">{t.backup.failed(importErrorDetail(state.error, t))}</p>
  } else {
    const { parsed, ocr, read, skipped } = state
    const qs = parsed.questions
    const withAnswer = qs.filter((q) => q.correct).length
    body = (
      <>
        {qs.length === 0 ? (
          <p className="pdf-error">{t.pdf.noQuestions}</p>
        ) : (
          <>
            <p className="pdf-summary">{t.pdf.found(qs.length, withAnswer)}</p>
            {withAnswer === 0 && <p className="pdf-error">{t.pdf.noAnswers}</p>}
            {withAnswer > 0 && withAnswer < qs.length && <p className="hint warn">{t.pdf.missingAnswers(qs.length - withAnswer)}</p>}
          </>
        )}
        {ocr && <p className="hint warn">{t.pdf.scanned}</p>}
        {skipped > 0 && <p className="hint warn">{t.pdf.skipped(read, skipped)}</p>}
        {withAnswer > 0 && (
          <label>
            {t.pdf.name}
            <input value={name} onChange={(e) => setName(e.target.value)} />
            <span className="hint">{t.pdf.nameHint}</span>
          </label>
        )}
        {qs.length > 0 && (
          <ol className="pdf-preview">
            {qs.map((q, i) => {
              const text = (q.passage ? q.passage + ' ' : '') + q.question
              const hasChoices = q.choices && LETTERS.some((l) => q.choices![l])
              return (
                <li key={i} className={q.correct ? '' : 'skip'}>
                  <span className="set-q-src">{q.source}</span>
                  <span className={`chip ${q.section === 'RW' ? 'rw' : 'math'}`}>{sectionName(t, q.section)}</span>
                  <span className="pdf-preview-text">{text.length > 110 ? text.slice(0, 110) + '…' : text}</span>
                  {!hasChoices && q.correct && /^[A-D]$/.test(q.correct) && <span className="chip">{t.pdf.noChoices}</span>}
                  <span className={q.correct ? 'chip ok' : 'chip'}>{q.correct ? t.pdf.answer(q.correct) : t.pdf.noAnswer}</span>
                </li>
              )
            })}
          </ol>
        )}
      </>
    )
    if (withAnswer > 0) {
      action = (
        <button className="btn primary" disabled={saving || !name.trim()} onClick={() => save(parsed)}>
          {saving ? t.pdf.importing : t.pdf.import(withAnswer)}
        </button>
      )
    }
  }

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && state.step !== 'reading' && onClose()}>
      <div className="modal">
        <div className="modal-head">
          <h2>{t.pdf.title}</h2>
          <span className="hint pdf-file">{file.name}</span>
        </div>
        {body}
        <div className="modal-foot">
          <button className="btn" onClick={onClose}>
            {state.step === 'reading' || action ? t.pdf.cancel : t.common.close}
          </button>
          {action}
        </div>
      </div>
    </div>
  )
}
