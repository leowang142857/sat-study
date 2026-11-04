import { useState } from 'react'

function showSet(name: string, untitled: string) {
  return name === '未命名题集' ? untitled : name
}
import type { Mistake } from '../types'
import { LETTERS } from '../types'
import { qtypeLabel } from '../messages'
import { useI18n } from '../i18n'
import { RichText } from './RichText'

export function PracticeResult({
  items: initialItems,
  pool,
  onAgain,
  onSave,
  onFileWrong,
  againLabel,
}: {
  items: Mistake[]
  pool: 'wrong' | 'practice'
  onAgain: () => void
  onSave: (ms: Mistake[]) => Promise<void>
  onFileWrong?: (m: Mistake) => Promise<'added' | 'exists'>
  againLabel?: string
}) {
  const { t } = useI18n()
  const again = againLabel ?? t.practice.again
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
          <h1>{t.practice.score(right, items.length)}</h1>
          <p className="sub">
            {practice
              ? t.practice.setAccuracy(items.length ? Math.round((right / items.length) * 100) : 0)
              : t.practice.accuracy(items.length ? Math.round((right / items.length) * 100) : 0)}
          </p>
        </div>
        <div className="row-gap">
          <button className="btn" onClick={masterAllCorrect}>
            {t.practice.markAllCorrect}
          </button>
          <button className="btn primary" onClick={onAgain}>
            {again}
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
                  {showSet(m.source || m.setName || '未命名题集', t.sets.untitled)} · {qtypeLabel(t, m.questionType)}
                </span>
                <span>
                  {t.practice.yourAnswer} <b className={last.correct ? 'correct-text' : 'wrong-text'}>{last.answer || t.practice.unanswered}</b> · {t.practice.correct}{' '}
                  <b className="correct-text">{m.correct}</b>
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
                    {filedAs === 'added' ? t.practice.filedAdded : filedAs === 'exists' ? t.practice.filedExists : t.practice.fileWrong}
                  </button>
                )}
                <button
                  className="btn small"
                  onClick={(e) => {
                    e.stopPropagation()
                    toggleMastered(i)
                  }}
                >
                  {m.mastered ? t.practice.masteredCheck : t.practice.markMastered}
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
                      <div className="field-label">{t.practice.explanation}</div>
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
