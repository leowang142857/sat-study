import { useMemo, useRef, useState } from 'react'
import type { Letter, Mistake, Section } from '../types'
import { LETTERS } from '../types'
import { QUESTION_TYPES } from '../constants'
import { uid } from '../db'
import { useStore } from '../store'
import { ocrScreenshot } from '../ocr'
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

  async function runOcr(src: string) {
    setOcrBusy(true)
    try {
      const r = await ocrScreenshot(src, setOcrStatus)
      setM((p) => ({
        ...p,
        passage: r.passage || p.passage,
        question: r.question || p.question,
        format: r.choices ? 'mc' : p.format,
        choices: r.choices ?? p.choices,
        myAnswer: p.myAnswer || r.selected,
        figures: p.figures.length ? p.figures : r.figures,
      }))
      const notes = [r.choices ? '识别完成，请核对文字（特别是画线部分和数字）' : '识别完成，但没找到 A–D 选项框，请手动补全选项']
      if (r.figures.length) notes.push('已自动裁出图表，不满意可以删掉后点「框选图表」')
      setOcrStatus(notes.join('；'))
    } catch (e) {
      console.error(e)
      setOcrStatus(`识别失败：${(e as Error).message}`)
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
      .map((t) => t.trim())
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
          <h2>{isNew ? '录入错题' : '编辑错题'}</h2>
          <button className="btn ghost" onClick={onClose}>
            关闭
          </button>
        </div>

        <div className="field">
          <div className="field-label">
            1. 粘贴截图 <span className="hint">会自动识别成文字题目（左栏 → 文章，右栏 → 问题和选项，蓝框 → 你当时的答案）</span>
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
                  识别文字
                </button>
                <button type="button" className="btn tiny" onClick={() => setCropping(src)}>
                  框选图表
                </button>
              </>
            )}
          />
          {ocrStatus && <div className={`ocr-status ${ocrBusy ? 'busy' : ''}`}>{ocrStatus}</div>}
          {m.figures.length > 0 && (
            <div className="figures-row">
              <span className="field-label">练习时显示的图表：</span>
              {m.figures.map((f, i) => (
                <div key={i} className="thumb">
                  <img src={f} alt={`图表 ${i + 1}`} />
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
            模块
            <div className="seg">
              {(['RW', 'Math'] as Section[]).map((s) => (
                <button key={s} type="button" className={m.section === s ? 'on' : ''} onClick={() => setM((p) => ({ ...p, section: s, questionType: '' }))}>
                  {s === 'RW' ? '阅读文法' : '数学'}
                </button>
              ))}
            </div>
          </label>
          <label>
            题型
            <select value={m.questionType} onChange={(e) => set('questionType', e.target.value)}>
              <option value="">未分类</option>
              {QUESTION_TYPES[m.section].map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
          </label>
          <label className="span2">
            来源（卷子 · 模块 · 题号）
            <input list="sources" value={m.source} placeholder="例：2026年10月北美A卷 · RW Module 2 · Q16" onChange={(e) => set('source', e.target.value)} />
            <datalist id="sources">
              {sources.map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
          </label>
        </div>

        <div className="field">
          <div className="field-label">
            2. 文章 / 材料
            <button type="button" className="btn tiny" onClick={wrapUnderline} title="先在下面选中文字，再点这里">
              <u>U</u> 选中文字加下划线
            </button>
            <span className="hint">{'{{…}}'} = 画线部分，______ = 空格，“• ” 开头 = 笔记要点</span>
          </div>
          <textarea ref={passageRef} rows={7} value={m.passage} onChange={(e) => set('passage', e.target.value)} placeholder="识别结果会出现在这里，也可以直接粘贴原文" />
          {m.passage.includes('{{') && <RichText className="passage-preview" text={m.passage} />}
        </div>
        <label className="field">
          问题
          <textarea rows={2} value={m.question} onChange={(e) => set('question', e.target.value)} placeholder="Which choice completes the text with the most logical and precise word or phrase?" />
        </label>

        <div className="field">
          <div className="field-label">
            选项
            <div className="seg inline">
              <button type="button" className={m.format === 'mc' ? 'on' : ''} onClick={() => set('format', 'mc')}>
                选择题
              </button>
              <button type="button" className={m.format === 'spr' ? 'on' : ''} onClick={() => set('format', 'spr')}>
                填空题
              </button>
            </div>
          </div>
          {m.format === 'mc' && (
            <div className="choice-inputs">
              {LETTERS.map((l) => (
                <div key={l} className="choice-input">
                  <span className={`letter-pill ${m.correct === l ? 'correct' : ''} ${m.myAnswer === l && m.correct !== l ? 'wrong' : ''}`}>{l}</span>
                  <textarea rows={2} value={m.choices[l]} onChange={(e) => setChoice(l, e.target.value)} placeholder={`选项 ${l}`} />
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="form-grid">
          <div className="field">
            <div className="field-label">3. 正确答案 *</div>
            {m.format === 'mc' ? (
              <LetterPicker value={m.correct} onChange={(v) => set('correct', v)} tone="correct" />
            ) : (
              <input value={m.correct} onChange={(e) => set('correct', e.target.value)} placeholder="如 4.57 或 3/4" />
            )}
          </div>
          <div className="field">
            <div className="field-label">我当时的答案</div>
            {m.format === 'mc' ? (
              <LetterPicker value={m.myAnswer} onChange={(v) => set('myAnswer', v)} tone="wrong" allowEmpty />
            ) : (
              <input value={m.myAnswer} onChange={(e) => set('myAnswer', e.target.value)} placeholder="留空 = 没作答" />
            )}
          </div>
        </div>

        <label className="field">
          解析 / 我为什么错
          <textarea rows={4} value={m.explanation} onChange={(e) => set('explanation', e.target.value)} placeholder="定位句在哪、陷阱是什么、下次怎么避免" />
        </label>
        <label className="field">
          标签（逗号分隔）
          <input value={tagText} onChange={(e) => setTagText(e.target.value)} placeholder="如：粗心, 时间不够, 生词" />
        </label>

        <div className="modal-foot">
          {!canSave && !ocrBusy && <span className="hint">{hasText ? '还差正确答案' : '需要文字题目：贴截图自动识别，或手动粘贴原文'}</span>}
          {isNew && (
            <button className="btn" disabled={!canSave} onClick={() => save(true)}>
              保存并录入下一题
            </button>
          )}
          <button className="btn primary" disabled={!canSave} onClick={() => save(false)}>
            保存
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
