import { useCallback, useEffect, useRef, useState } from 'react'
import type { Letter, Mistake } from '../types'
import { LETTERS } from '../types'
import { LanguageToggle, useI18n } from '../i18n'
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
  const { t } = useI18n()
  const [answers, setAnswers] = useState<ExamAnswer[]>(() => items.map(() => ({ answer: '', marked: false, eliminated: [] })))
  const [idx, setIdx] = useState(0)
  const [reviewPage, setReviewPage] = useState(false)
  const [navOpen, setNavOpen] = useState(false)
  const [eliminator, setEliminator] = useState(false)
  const [timerHidden, setTimerHidden] = useState(false)
  const [directionsOpen, setDirectionsOpen] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [name, setName] = useState(() => localStorage.getItem(NAME_KEY) || '')
  const submitted = useRef(false)

  const submit = useCallback(() => {
    if (submitted.current) return
    submitted.current = true
    onSubmit(answers)
  }, [answers, onSubmit])

  useEffect(() => {
    const timer = setInterval(() => setElapsed((e) => e + 1), 1000)
    return () => clearInterval(timer)
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
  const shownName = name || t.exam.defaultName

  return (
    <div className="exam">
      <header className="exam-head">
        <div className="exam-title">
          <div className="exam-section">{title}</div>
          <button className="link-btn" onClick={() => setDirectionsOpen((v) => !v)}>
            {t.exam.directions} {directionsOpen ? '▴' : '▾'}
          </button>
        </div>
        <div className="exam-timer">
          {showTimer && (
            <>
              <div className={`clock ${lowTime ? 'low' : ''}`}>{timerHidden ? <span className="clock-hidden">⏱</span> : clock}</div>
              <button className="pill-btn" onClick={() => setTimerHidden((v) => !v)}>
                {timerHidden ? t.exam.show : t.exam.hide}
              </button>
            </>
          )}
        </div>
        <div className="exam-tools">
          <LanguageToggle />
          <button className="tool-btn" onClick={onExit}>
            <span className="tool-icon">⎋</span>
            {t.exam.exit}
          </button>
        </div>
      </header>
      <div className="exam-dashes" />

      {directionsOpen && (
        <div className="directions">
          {t.exam.directionsBody}
          <div className="directions-close">
            <button className="pill-btn" onClick={() => setDirectionsOpen(false)}>
              {t.exam.close}
            </button>
          </div>
        </div>
      )}

      {reviewPage ? (
        <div className="exam-review">
          <h2>{t.exam.checkWork}</h2>
          <p>{t.exam.checkBody}</p>
          <div className="review-card">
            <div className="review-card-head">
              <b>{title}</b>
              <span className="legend">
                <span className="lg current">{t.exam.current}</span>
                <span className="lg unanswered">{t.exam.unanswered}</span>
                <span className="lg marked">{t.exam.forReview}</span>
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
            {t.exam.submit}
          </button>
        </div>
      ) : (
        <div className={`exam-body ${hasLeft ? '' : 'single'}`}>
          {hasLeft && (
            <section className="exam-left">
              {m.figures.map((src, i) => (
                <img key={i} className="exam-figure" src={src} alt={t.common.figureAlt(i + 1)} />
              ))}
              {m.passage && <RichText className="exam-passage" text={m.passage} />}
            </section>
          )}
          {hasLeft && <div className="exam-divider" />}
          <section className="exam-right">
            <div className="q-bar">
              <span className="q-num">{idx + 1}</span>
              <button className={`mark-btn ${a.marked ? 'on' : ''}`} onClick={() => update({ marked: !a.marked })}>
                <span className="bookmark">{a.marked ? '🔖' : '🏷'}</span> {t.exam.mark}
              </button>
              {m.format === 'mc' && (
                <button className={`abc-btn ${eliminator ? 'on' : ''}`} onClick={() => setEliminator((v) => !v)} title={t.exam.eliminator}>
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
                        <span className="choice-text">{m.choices[l] || <i className="muted">{t.exam.noChoice}</i>}</span>
                      </button>
                      {eliminator &&
                        (crossed ? (
                          <button className="undo-btn" onClick={() => toggleEliminate(l)}>
                            {t.exam.undo}
                          </button>
                        ) : (
                          <button className="strike-btn" onClick={() => toggleEliminate(l)} title={t.exam.crossOut(l)}>
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
                <div className="spr-preview">
                  {t.exam.preview} {a.answer}
                </div>
              </div>
            )}
          </section>
        </div>
      )}

      <footer className="exam-foot">
        <button
          className="student-name"
          onClick={() => {
            const n = prompt(t.exam.namePrompt, shownName)?.trim()
            if (n) {
              setName(n)
              localStorage.setItem(NAME_KEY, n)
            }
          }}
        >
          {shownName}
        </button>
        {reviewPage && <div />}
        {!reviewPage && (
          <div className="nav-center">
            <button className="nav-toggle" onClick={() => setNavOpen((v) => !v)}>
              {t.exam.questionOf(idx + 1, items.length)} {navOpen ? '▴' : '▾'}
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
                  <span className="lg current">{t.exam.current}</span>
                  <span className="lg unanswered">{t.exam.unanswered}</span>
                  <span className="lg marked">{t.exam.forReview}</span>
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
                  {t.exam.goReview}
                </button>
              </div>
            )}
          </div>
        )}
        <div className="nav-right">
          {(idx > 0 || reviewPage) && (
            <button className="pill-btn primary" onClick={goBack}>
              {t.exam.back}
            </button>
          )}
          {!reviewPage && (
            <button className="pill-btn primary" onClick={goNext}>
              {t.exam.next}
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
