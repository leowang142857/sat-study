import { useCallback, useEffect, useRef, useState } from 'react'
import type { Letter, Mistake } from '../types'
import { LETTERS } from '../types'
import { RichText } from './RichText'

export interface ExamAnswer {
  answer: string
  marked: boolean
  eliminated: Letter[]
}

const NAME_KEY = 'sat-study:name'

interface Props {
  title: string
  items: Mistake[]
  /** seconds; null = count up */
  timeLimit: number | null
  showTimer: boolean
  onSubmit: (answers: ExamAnswer[]) => void
  onExit: () => void
}

export function ExamRunner({ title, items, timeLimit, showTimer, onSubmit, onExit }: Props) {
  const [answers, setAnswers] = useState<ExamAnswer[]>(() => items.map(() => ({ answer: '', marked: false, eliminated: [] })))
  const [idx, setIdx] = useState(0)
  const [reviewPage, setReviewPage] = useState(false)
  const [navOpen, setNavOpen] = useState(false)
  const [eliminator, setEliminator] = useState(false)
  const [timerHidden, setTimerHidden] = useState(false)
  const [directionsOpen, setDirectionsOpen] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [name, setName] = useState(() => localStorage.getItem(NAME_KEY) || '学生')
  const submitted = useRef(false)

  const submit = useCallback(() => {
    if (submitted.current) return
    submitted.current = true
    onSubmit(answers)
  }, [answers, onSubmit])

  useEffect(() => {
    const t = setInterval(() => setElapsed((e) => e + 1), 1000)
    return () => clearInterval(t)
  }, [])

  const remaining = timeLimit === null ? null : Math.max(0, timeLimit - elapsed)
  useEffect(() => {
    if (remaining === 0) submit()
  }, [remaining, submit])

  const m = items[idx]
  const a = answers[idx]
  const update = (patch: Partial<ExamAnswer>, i = idx) => setAnswers((l) => l.map((x, j) => (j === i ? { ...x, ...patch } : x)))

  const choose = (l: Letter) => {
    if (a.eliminated.includes(l)) update({ answer: l, eliminated: a.eliminated.filter((x) => x !== l) })
    else update({ answer: l })
  }
  const toggleEliminate = (l: Letter) => {
    const on = a.eliminated.includes(l)
    update({ eliminated: on ? a.eliminated.filter((x) => x !== l) : [...a.eliminated, l], answer: !on && a.answer === l ? '' : a.answer })
  }

  const goNext = () => (idx < items.length - 1 ? setIdx(idx + 1) : setReviewPage(true))
  const goBack = () => (reviewPage ? setReviewPage(false) : idx > 0 && setIdx(idx - 1))

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement
      if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || reviewPage) return
      if (e.key === 'ArrowRight') goNext()
      else if (e.key === 'ArrowLeft') goBack()
      else if (m.format === 'mc' && /^[a-d]$/i.test(e.key) && !e.metaKey && !e.ctrlKey) choose(e.key.toUpperCase() as Letter)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const clock = fmt(remaining ?? elapsed)
  const lowTime = remaining !== null && remaining <= 300
  const hasLeft = !!(m.passage.trim() || m.figures.length)

  return (
    <div className="exam">
      <header className="exam-head">
        <div className="exam-title">
          <div className="exam-section">{title}</div>
          <button className="link-btn" onClick={() => setDirectionsOpen((v) => !v)}>
            Directions {directionsOpen ? '▴' : '▾'}
          </button>
        </div>
        <div className="exam-timer">
          {showTimer && (
            <>
              <div className={`clock ${lowTime ? 'low' : ''}`}>{timerHidden ? <span className="clock-hidden">⏱</span> : clock}</div>
              <button className="pill-btn" onClick={() => setTimerHidden((v) => !v)}>
                {timerHidden ? 'Show' : 'Hide'}
              </button>
            </>
          )}
        </div>
        <div className="exam-tools">
          <button className="tool-btn" onClick={onExit}>
            <span className="tool-icon">⎋</span>
            退出
          </button>
        </div>
      </header>
      <div className="exam-dashes" />

      {directionsOpen && (
        <div className="directions">
          The questions in this section address a number of important reading and writing skills. Each question includes one or more passages, which may include a table or graph. Read each passage and question carefully, and then choose the best answer to the question based on the passage(s).
          <div className="directions-close">
            <button className="pill-btn" onClick={() => setDirectionsOpen(false)}>
              Close
            </button>
          </div>
        </div>
      )}

      {reviewPage ? (
        <div className="exam-review">
          <h2>Check Your Work</h2>
          <p>On test day, you won't be able to move on to the next module until time expires. For these practice questions, you can click Submit when you're ready.</p>
          <div className="review-card">
            <div className="review-card-head">
              <b>{title}</b>
              <span className="legend">
                <span className="lg current">⌖ Current</span>
                <span className="lg unanswered">Unanswered</span>
                <span className="lg marked">🔖 For Review</span>
              </span>
            </div>
            <QuestionGrid
              answers={answers}
              current={-1}
              onPick={(i) => {
                setIdx(i)
                setReviewPage(false)
              }}
            />
          </div>
          <button className="btn primary submit-btn" onClick={submit}>
            Submit
          </button>
        </div>
      ) : (
        <div className={`exam-body ${hasLeft ? '' : 'single'}`}>
          {hasLeft && (
            <section className="exam-left">
              {m.figures.map((src, i) => (
                <img key={i} className="exam-figure" src={src} alt={`Figure ${i + 1}`} />
              ))}
              {m.passage && <RichText className="exam-passage" text={m.passage} />}
            </section>
          )}
          {hasLeft && <div className="exam-divider" />}
          <section className="exam-right">
            <div className="q-bar">
              <span className="q-num">{idx + 1}</span>
              <button className={`mark-btn ${a.marked ? 'on' : ''}`} onClick={() => update({ marked: !a.marked })}>
                <span className="bookmark">{a.marked ? '🔖' : '🏷'}</span> Mark for Review
              </button>
              {m.format === 'mc' && (
                <button className={`abc-btn ${eliminator ? 'on' : ''}`} onClick={() => setEliminator((v) => !v)} title="Option eliminator">
                  <s>ABC</s>
                </button>
              )}
            </div>
            <div className="q-text">{m.question}</div>

            {m.format === 'mc' ? (
              <div className="choices">
                {LETTERS.map((l) => {
                  const crossed = a.eliminated.includes(l)
                  const selected = a.answer === l
                  return (
                    <div key={l} className="choice-row">
                      <button className={`choice ${selected ? 'selected' : ''} ${crossed ? 'crossed' : ''}`} onClick={() => choose(l)}>
                        <span className="choice-letter">{l}</span>
                        <span className="choice-text">{m.choices[l] || <i className="muted">（没有录入选项文字）</i>}</span>
                      </button>
                      {eliminator &&
                        (crossed ? (
                          <button className="undo-btn" onClick={() => toggleEliminate(l)}>
                            Undo
                          </button>
                        ) : (
                          <button className="strike-btn" onClick={() => toggleEliminate(l)} title={`Cross out ${l}`}>
                            <s>{l}</s>
                          </button>
                        ))}
                    </div>
                  )
                })}
              </div>
            ) : (
              <div className="spr">
                <input value={a.answer} onChange={(e) => update({ answer: e.target.value.slice(0, 6) })} placeholder="" />
                <div className="spr-preview">Answer Preview: {a.answer}</div>
              </div>
            )}
          </section>
        </div>
      )}

      <footer className="exam-foot">
        <button
          className="student-name"
          onClick={() => {
            const n = prompt('显示的名字', name)?.trim()
            if (n) {
              setName(n)
              localStorage.setItem(NAME_KEY, n)
            }
          }}
        >
          {name}
        </button>
        {reviewPage && <div />}
        {!reviewPage && (
          <div className="nav-center">
            <button className="nav-toggle" onClick={() => setNavOpen((v) => !v)}>
              Question {idx + 1} of {items.length} {navOpen ? '▴' : '▾'}
            </button>
            {navOpen && (
              <div className="nav-pop">
                <div className="nav-pop-head">
                  <b>{title}</b>
                  <button className="link-btn" onClick={() => setNavOpen(false)}>
                    ✕
                  </button>
                </div>
                <div className="legend">
                  <span className="lg current">⌖ Current</span>
                  <span className="lg unanswered">Unanswered</span>
                  <span className="lg marked">🔖 For Review</span>
                </div>
                <QuestionGrid
                  answers={answers}
                  current={idx}
                  onPick={(i) => {
                    setIdx(i)
                    setNavOpen(false)
                  }}
                />
                <button
                  className="pill-btn outline"
                  onClick={() => {
                    setNavOpen(false)
                    setReviewPage(true)
                  }}
                >
                  Go to Review Page
                </button>
              </div>
            )}
          </div>
        )}
        <div className="nav-right">
          {(idx > 0 || reviewPage) && (
            <button className="pill-btn primary" onClick={goBack}>
              Back
            </button>
          )}
          {!reviewPage && (
            <button className="pill-btn primary" onClick={goNext}>
              Next
            </button>
          )}
        </div>
      </footer>
    </div>
  )
}

function QuestionGrid({ answers, current, onPick }: { answers: ExamAnswer[]; current: number; onPick: (i: number) => void }) {
  return (
    <div className="q-grid">
      {answers.map((a, i) => (
        <button key={i} className={`q-cell ${a.answer ? 'answered' : ''} ${i === current ? 'current' : ''}`} onClick={() => onPick(i)}>
          {i === current && <span className="pin">⌖</span>}
          {a.marked && <span className="flag">🔖</span>}
          {i + 1}
        </button>
      ))}
    </div>
  )
}

function fmt(s: number) {
  const m = Math.floor(s / 60)
  return `${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}
