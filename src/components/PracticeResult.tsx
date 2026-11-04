import { useState } from 'react'
import type { Mistake } from '../types'
import { LETTERS } from '../types'
import { typeLabel } from '../constants'
import { RichText } from './RichText'

export function PracticeResult({
  items: initialItems,
  pool,
  onAgain,
  onSave,
  onFileWrong,
  againLabel = '再练一组',
}: {
  items: Mistake[]
  pool: 'wrong' | 'practice'
  onAgain: () => void
  onSave: (ms: Mistake[]) => Promise<void>
  onFileWrong?: (m: Mistake) => Promise<'added' | 'exists'>
  againLabel?: string
}) {
  const [items, setItems] = useState(initialItems)
  const [open, setOpen] = useState<number | null>(null)
  const [filed, setFiled] = useState<Record<string, 'added' | 'exists'>>({})
  const right = items.filter((m) => m.reviews.at(-1)?.correct).length
  const practice = pool === 'practice'

  async function toggleMastered(i: number) {
    const m = { ...items[i], mastered: !items[i].mastered, updatedAt: Date.now() }
    await onSave([m])
    setItems((l) => l.map((x, j) => (j === i ? m : x)))
  }

  async function masterAllCorrect() {
    const updated = items.map((m) => (m.reviews.at(-1)?.correct ? { ...m, mastered: true, updatedAt: Date.now() } : m))
    await onSave(updated)
    setItems(updated)
  }

  async function fileWrong(i: number) {
    if (!onFileWrong) return
    const status = await onFileWrong(items[i])
    setFiled((f) => ({ ...f, [items[i].id]: status }))
  }

  return (
    <div className="page narrow">
      <div className="page-head">
        <div>
          <h1>
            本次得分 {right} / {items.length}
          </h1>
          <p className="sub">
            正确率 {items.length ? Math.round((right / items.length) * 100) : 0}% · {practice ? '结果记在题集上，不会自动进入错题本' : '结果已记录到每道错题'}
          </p>
        </div>
        <div className="row-gap">
          <button className="btn" onClick={masterAllCorrect}>
            做对的全部标记已掌握
          </button>
          <button className="btn primary" onClick={onAgain}>
            {againLabel}
          </button>
        </div>
      </div>

      <div className="result-list">
        {items.map((m, i) => {
          const last = m.reviews.at(-1)!
          const filedAs = filed[m.id]
          return (
            <div key={m.id} className={`card result ${last.correct ? 'ok' : 'bad'}`}>
              <div className="result-row" onClick={() => setOpen(open === i ? null : i)}>
                <span className="qnum">{i + 1}</span>
                <span className={last.correct ? 'correct-text' : 'wrong-text'}>{last.correct ? '✓' : '✗'}</span>
                <span className="result-src">
                  {m.source || m.setName || '题集'} · {typeLabel(m.section, m.questionType)}
                </span>
                <span>
                  你的答案 <b className={last.correct ? 'correct-text' : 'wrong-text'}>{last.answer || '未作答'}</b> · 正确 <b className="correct-text">{m.correct}</b>
                </span>
                {practice && !last.correct && (
                  <button
                    className="btn small"
                    disabled={!!filedAs}
                    onClick={(e) => {
                      e.stopPropagation()
                      fileWrong(i)
                    }}
                  >
                    {filedAs === 'added' ? '已记入错题本' : filedAs === 'exists' ? '错题本已有' : '记入错题本'}
                  </button>
                )}
                <button
                  className="btn small"
                  onClick={(e) => {
                    e.stopPropagation()
                    toggleMastered(i)
                  }}
                >
                  {m.mastered ? '已掌握 ✓' : '标记已掌握'}
                </button>
              </div>
              {open === i && (
                <div className="mistake-detail">
                  {m.figures.map((src, k) => (
                    <img key={k} className="detail-img" src={src} alt="" />
                  ))}
                  {m.passage && <RichText className="passage-text" text={m.passage} />}
                  {m.question && <p className="question-text">{m.question}</p>}
                  {m.format === 'mc' && (
                    <ul className="detail-choices">
                      {LETTERS.map((l) => (
                        <li key={l} className={l === m.correct ? 'is-correct' : l === last.answer ? 'is-wrong' : ''}>
                          <span className="letter-pill">{l}</span>
                          <span>{m.choices[l]}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                  {m.explanation && (
                    <div className="explanation">
                      <div className="field-label">解析</div>
                      {m.explanation}
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
