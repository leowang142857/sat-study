import { useMemo, useRef, useState } from 'react'
import type { Letter, Mistake, Section } from '../types'
import { LETTERS } from '../types'
import { QUESTION_TYPES } from '../constants'
import { qtypeLabel } from '../messages'
import { useI18n } from '../i18n'
import { uid } from '../db'
import { useStore } from '../store'
import { ocrScreenshot, type OcrStatus } from '../ocr'
import { ImageDropZone } from './ImageDropZone'
import { FigureCropper } from './FigureCropper'
import { RichText } from './RichText'

const LAST_SOURCE_KEY = 'sat-study:last-source'
const stripQ = (s: string) => s.replace(/\s*·\s*Q\d+$/, '')

export function blankMistake(): Mistake {
  const now = Date.now()
  return {
    id: uid(),
    createdAt: now,
    updatedAt: now,
    section: 'RW',
    source: localStorage.getItem(LAST_SOURCE_KEY) ?? '',
    questionType: '',
    format: 'mc',
    passage: '',
    question: '',
    choices: { A: '', B: '', C: '', D: '' },
    correct: '',
    myAnswer: '',
    explanation: '',
    images: [],
    figures: [],
    tags: [],
    mastered: false,
    reviews: [],
  }
}

interface Props {
  initial: Mistake
  isNew: boolean
  onClose: () => void
}

export function MistakeEditor({ initial, isNew, onClose }: Props) {
  const { mistakes, saveMistake } = useStore()
  const { t } = useI18n()
  const [m, setM] = useState<Mistake>(initial)
  const [tagText, setTagText] = useState(initial.tags.join(', '))
  const [ocrStatus, setOcrStatus] = useState('')
  const [ocrBusy, setOcrBusy] = useState(false)
  const [cropping, setCropping] = useState<string | null>(null)
  const passageRef = useRef<HTMLTextAreaElement>(null)
  const sources = useMemo(() => [...new Set(mistakes.map((x) => stripQ(x.source)).filter(Boolean))], [mistakes])

  const set = <K extends keyof Mistake>(k: K, v: Mistake[K]) => setM((p) => ({ ...p, [k]: v }))
  const setChoice = (l: Letter, v: string) => setM((p) => ({ ...p, choices: { ...p.choices, [l]: v } }))

  const hasText = !!(m.passage.trim() || m.question.trim())
  const canSave = hasText && !!m.correct.trim() && !ocrBusy

  function showOcr(status: OcrStatus) {
    if (status.startsWith('choice:')) {
      setOcrStatus(t.ocr.choice(status.slice('choice:'.length)))
      return
    }
    const label: Record<Exclude<OcrStatus, `choice:${string}`>, string> = {
      engine: t.ocr.engine,
      layout: t.ocr.layout,
      passage: t.ocr.passage,
      question: t.ocr.question,
      right: t.ocr.right,
      done: t.ocr.done,
    }
    setOcrStatus(label[status as Exclude<OcrStatus, `choice:${string}`>])
  }

  async function runOcr(src: string) {
    setOcrBusy(true)
    try {
      const r = await ocrScreenshot(src, showOcr)
      setM((p) => ({
        ...p,
        passage: r.passage || p.passage,
        question: r.question || p.question,
        format: r.choices ? 'mc' : p.format,
        choices: r.choices ?? p.choices,
        myAnswer: p.myAnswer || r.selected,
        figures: p.figures.length ? p.figures : r.figures,
      }))
      const notes = [r.choices ? t.editor.ocrOk : t.editor.ocrNoChoices]
      if (r.figures.length) notes.push(t.editor.ocrFigures)
      setOcrStatus(notes.join(t.editor.listSep))
    } catch (e) {
      console.error(e)
      setOcrStatus(t.editor.ocrFailed((e as Error).message))
    } finally {
      setOcrBusy(false)
    }
  }

  function wrapUnderline() {
    const ta = passageRef.current
    if (!ta || ta.selectionStart === ta.selectionEnd) return
    const { selectionStart: a, selectionEnd: b, value } = ta
    set('passage', value.slice(0, a) + '{{' + value.slice(a, b) + '}}' + value.slice(b))
  }

  async function save(addAnother: boolean) {
    if (!canSave) return
    const tags = tagText
      .split(/[,，]/)
      .map((tag) => tag.trim())
      .filter(Boolean)
    await saveMistake({ ...m, tags, updatedAt: Date.now() })
    localStorage.setItem(LAST_SOURCE_KEY, stripQ(m.source))
    if (addAnother) {
      const next = blankMistake()
      next.section = m.section
      next.source = stripQ(m.source)
      setM(next)
      setTagText('')
      setOcrStatus('')
    } else onClose()
  }

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal wide">
        <div className="modal-head">
          <h2>{isNew ? t.editor.addTitle : t.editor.editTitle}</h2>
          <button className="btn ghost" onClick={onClose}>
            {t.editor.close}
          </button>
        </div>

        <div className="field">
          <div className="field-label">
            {t.editor.paste} <span className="hint">{t.editor.pasteHint}</span>
          </div>
          <ImageDropZone
            images={m.images}
            onChange={(imgs) => set('images', imgs)}
            onAdded={(added) => {
              if (!m.passage.trim() && !m.question.trim()) runOcr(added[0])
            }}
            renderActions={(src) => (
              <>
                <button type="button" className="btn tiny" disabled={ocrBusy} onClick={() => runOcr(src)}>
                  {t.editor.recognize}
                </button>
                <button type="button" className="btn tiny" onClick={() => setCropping(src)}>
                  {t.editor.crop}
                </button>
              </>
            )}
          />
          {ocrStatus && <div className={`ocr-status ${ocrBusy ? 'busy' : ''}`}>{ocrStatus}</div>}
          {m.figures.length > 0 && (
            <div className="figures-row">
              <span className="field-label">{t.editor.figures}</span>
              {m.figures.map((f, i) => (
                <div key={i} className="thumb">
                  <img src={f} alt={t.common.figureAlt(i + 1)} />
                  <button type="button" className="thumb-remove" onClick={() => set('figures', m.figures.filter((_, j) => j !== i))}>
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="form-grid">
          <label>
            {t.editor.module}
            <div className="seg">
              {(['RW', 'Math'] as Section[]).map((s) => (
                <button key={s} type="button" className={m.section === s ? 'on' : ''} onClick={() => setM((p) => ({ ...p, section: s, questionType: '' }))}>
                  {s === 'RW' ? t.common.sectionRW : t.common.sectionMath}
                </button>
              ))}
            </div>
          </label>
          <label>
            {t.editor.type}
            <select value={m.questionType} onChange={(e) => set('questionType', e.target.value)}>
              <option value="">{t.editor.uncategorized}</option>
              {QUESTION_TYPES[m.section].map((id) => (
                <option key={id} value={id}>
                  {qtypeLabel(t, id)}
                </option>
              ))}
            </select>
          </label>
          <label className="span2">
            {t.editor.source}
            <input list="sources" value={m.source} placeholder={t.editor.sourcePlaceholder} onChange={(e) => set('source', e.target.value)} />
            <datalist id="sources">
              {sources.map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
          </label>
        </div>

        <div className="field">
          <div className="field-label">
            {t.editor.passage}
            <button type="button" className="btn tiny" onClick={wrapUnderline} title={t.editor.underlineTitle}>
              <u>U</u> {t.editor.underline}
            </button>
            <span className="hint">{t.editor.markupHint}</span>
          </div>
          <textarea ref={passageRef} rows={7} value={m.passage} onChange={(e) => set('passage', e.target.value)} placeholder={t.editor.passagePlaceholder} />
          {m.passage.includes('{{') && <RichText className="passage-preview" text={m.passage} />}
        </div>
        <label className="field">
          {t.editor.question}
          <textarea rows={2} value={m.question} onChange={(e) => set('question', e.target.value)} placeholder="Which choice completes the text with the most logical and precise word or phrase?" />
        </label>

        <div className="field">
          <div className="field-label">
            {t.editor.choices}
            <div className="seg inline">
              <button type="button" className={m.format === 'mc' ? 'on' : ''} onClick={() => set('format', 'mc')}>
                {t.editor.mc}
              </button>
              <button type="button" className={m.format === 'spr' ? 'on' : ''} onClick={() => set('format', 'spr')}>
                {t.editor.spr}
              </button>
            </div>
          </div>
          {m.format === 'mc' && (
            <div className="choice-inputs">
              {LETTERS.map((l) => (
                <div key={l} className="choice-input">
                  <span className={`letter-pill ${m.correct === l ? 'correct' : ''} ${m.myAnswer === l && m.correct !== l ? 'wrong' : ''}`}>{l}</span>
                  <textarea rows={2} value={m.choices[l]} onChange={(e) => setChoice(l, e.target.value)} placeholder={t.editor.choicePlaceholder(l)} />
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="form-grid">
          <div className="field">
            <div className="field-label">{t.editor.correct}</div>
            {m.format === 'mc' ? (
              <LetterPicker value={m.correct} onChange={(v) => set('correct', v)} tone="correct" />
            ) : (
              <input value={m.correct} onChange={(e) => set('correct', e.target.value)} placeholder={t.editor.correctPlaceholder} />
            )}
          </div>
          <div className="field">
            <div className="field-label">{t.editor.mine}</div>
            {m.format === 'mc' ? (
              <LetterPicker value={m.myAnswer} onChange={(v) => set('myAnswer', v)} tone="wrong" allowEmpty />
            ) : (
              <input value={m.myAnswer} onChange={(e) => set('myAnswer', e.target.value)} placeholder={t.editor.minePlaceholder} />
            )}
          </div>
        </div>

        <label className="field">
          {t.editor.explanation}
          <textarea rows={4} value={m.explanation} onChange={(e) => set('explanation', e.target.value)} placeholder={t.editor.explanationPlaceholder} />
        </label>
        <label className="field">
          {t.editor.tags}
          <input value={tagText} onChange={(e) => setTagText(e.target.value)} placeholder={t.editor.tagsPlaceholder} />
        </label>

        <div className="modal-foot">
          {!canSave && !ocrBusy && <span className="hint">{hasText ? t.editor.needCorrect : t.editor.needText}</span>}
          {isNew && (
            <button className="btn" disabled={!canSave} onClick={() => save(true)}>
              {t.editor.saveNext}
            </button>
          )}
          <button className="btn primary" disabled={!canSave} onClick={() => save(false)}>
            {t.editor.save}
          </button>
        </div>
      </div>

      {cropping && (
        <FigureCropper
          src={cropping}
          onCancel={() => setCropping(null)}
          onDone={(fig) => {
            set('figures', [...m.figures, fig])
            setCropping(null)
          }}
        />
      )}
    </div>
  )
}

function LetterPicker({ value, onChange, tone, allowEmpty }: { value: string; onChange: (v: string) => void; tone: 'correct' | 'wrong'; allowEmpty?: boolean }) {
  return (
    <div className="letter-picker">
      {LETTERS.map((l) => (
        <button key={l} type="button" className={`letter-pill big ${value === l ? tone : ''}`} onClick={() => onChange(allowEmpty && value === l ? '' : l)}>
          {l}
        </button>
      ))}
    </div>
  )
}
