import { useEffect, useMemo, useState } from 'react'
import type { Mistake, Section } from '../types'
import { QUESTION_TYPES } from '../constants'
import { qtypeLabel } from '../messages'
import { useI18n } from '../i18n'
import { isCorrect } from '../grade'
import { isPracticeItem, practiceSetName, sameQuestion, sourceRoot, asWrongCopy } from '../questions'
import { useStore } from '../store'
import { ExamRunner, type ExamAnswer } from '../components/ExamRunner'
import { PracticeResult } from '../components/PracticeResult'

type TimerMode = 'none' | 'countdown' | 'countup'
type Pool = 'wrong' | 'practice'
const SECONDS_PER_Q: Record<Section, number> = { RW: 71, Math: 95 }

interface Session {
  items: Mistake[]
  section: Section
  timer: TimerMode
  pool: Pool
  source: string
}

export function PracticePage({ onExamChange }: { onExamChange: (v: boolean) => void }) {
  const { mistakes, saveMistake, saveMistakes } = useStore()
  const { t } = useI18n()
  const [poolKind, setPoolKind] = useState<Pool>('wrong')
  const [section, setSection] = useState<Section>('RW')
  const [types, setTypes] = useState<string[]>([])
  const [source, setSource] = useState('all')
  const [onlyOpen, setOnlyOpen] = useState(true)
  const [shuffle, setShuffle] = useState(true)
  const [count, setCount] = useState(27)
  const [timer, setTimer] = useState<TimerMode>('countdown')
  const [session, setSession] = useState<Session | null>(null)
  const [result, setResult] = useState<{ items: Mistake[]; pool: Pool } | null>(null)

  useEffect(() => onExamChange(!!session), [session, onExamChange])

  const bank = useMemo(() => mistakes.filter((m) => (poolKind === 'practice' ? isPracticeItem(m) : !isPracticeItem(m))), [mistakes, poolKind])
  const practicable = (m: Mistake) => !!(m.passage.trim() || m.question.trim())
  const sources = useMemo(() => {
    if (poolKind === 'practice') return [...new Set(bank.map((m) => practiceSetName(m)))]
    return [...new Set(bank.map((m) => sourceRoot(m.source)).filter(Boolean))]
  }, [bank, poolKind])
  const pool = bank.filter(
    (m) =>
      m.section === section &&
      practicable(m) &&
      (!onlyOpen || !m.mastered) &&
      (types.length === 0 || types.includes(m.questionType)) &&
      (source === 'all' || (poolKind === 'practice' ? practiceSetName(m) === source : m.source.startsWith(source))),
  )
  const imageOnly = bank.filter((m) => m.section === section && !practicable(m)).length

  function choosePool(next: Pool) {
    setPoolKind(next)
    setSource('all')
    setTypes([])
    setOnlyOpen(next === 'wrong')
  }

  function start() {
    let items = [...pool]
    if (shuffle) items.sort(() => Math.random() - 0.5)
    else items.sort((a, b) => a.createdAt - b.createdAt)
    items = items.slice(0, count)
    setResult(null)
    setSession({ items, section, timer, pool: poolKind, source })
  }

  async function finish(answers: ExamAnswer[]) {
    if (!session) return
    const now = Date.now()
    const updated = session.items.map((m, i) => {
      const a = answers[i].answer.trim()
      return { ...m, reviews: [...m.reviews, { at: now, correct: isCorrect(m, a), answer: a }] }
    })
    await saveMistakes(updated)
    setResult({ items: updated, pool: session.pool })
    setSession(null)
  }

  async function fileWrong(m: Mistake) {
    const answer = m.reviews.at(-1)?.answer ?? ''
    if (mistakes.some((x) => !isPracticeItem(x) && sameQuestion(x, m))) return 'exists' as const
    await saveMistake(asWrongCopy(m, answer))
    return 'added' as const
  }

  if (session) {
    const limit = session.timer === 'countdown' ? session.items.length * SECONDS_PER_Q[session.section] : null
    return (
      <ExamRunner
        title={
          session.pool === 'practice'
            ? t.practice.setExamTitle(session.source === 'all' ? (session.section === 'RW' ? t.common.sectionRW : t.common.sectionMath) : session.source === '未命名题集' ? t.sets.untitled : session.source)
            : t.practice.examTitle(session.section)
        }
        items={session.items}
        timeLimit={limit}
        showTimer={session.timer !== 'none'}
        onSubmit={finish}
        onExit={() => confirm(t.practice.confirmExit) && setSession(null)}
      />
    )
  }

  if (result) {
    return (
      <PracticeResult
        items={result.items}
        pool={result.pool}
        onAgain={() => setResult(null)}
        onSave={saveMistakes}
        onFileWrong={result.pool === 'practice' ? fileWrong : undefined}
      />
    )
  }

  const practice = poolKind === 'practice'

  return (
    <div className="page narrow">
      <div className="page-head">
        <div>
          <h1>{practice ? t.practice.setPractice : t.practice.title}</h1>
          <p className="sub">{practice ? t.practice.setSubtitle : t.practice.subtitle}</p>
        </div>
      </div>

      <div className="card setup">
        <div className="setup-row">
          <span className="setup-label">{t.practice.content}</span>
          <div className="seg">
            <button className={poolKind === 'wrong' ? 'on' : ''} onClick={() => choosePool('wrong')}>
              {t.practice.redo}
            </button>
            <button className={poolKind === 'practice' ? 'on' : ''} onClick={() => choosePool('practice')}>
              {t.practice.setPractice}
            </button>
          </div>
        </div>

        <div className="setup-row">
          <span className="setup-label">{t.practice.module}</span>
          <div className="seg">
            {(['RW', 'Math'] as Section[]).map((s) => (
              <button key={s} className={section === s ? 'on' : ''} onClick={() => (setSection(s), setTypes([]))}>
                {s === 'RW' ? t.common.sectionRW : t.common.sectionMath}
              </button>
            ))}
          </div>
        </div>

        <div className="setup-row top">
          <span className="setup-label">{t.practice.type}</span>
          <div className="chips-select">
            <button className={`chip-btn ${types.length === 0 ? 'on' : ''}`} onClick={() => setTypes([])}>
              {t.common.all}
            </button>
            {QUESTION_TYPES[section].map((id) => {
              const n = bank.filter((m) => m.section === section && m.questionType === id && practicable(m) && (!onlyOpen || !m.mastered)).length
              return (
                <button
                  key={id}
                  className={`chip-btn ${types.includes(id) ? 'on' : ''}`}
                  disabled={n === 0}
                  onClick={() => setTypes((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]))}
                >
                  {qtypeLabel(t, id)} <span className="count">{n}</span>
                </button>
              )
            })}
          </div>
        </div>

        <div className="setup-row">
          <span className="setup-label">{practice ? t.practice.set : t.practice.source}</span>
          <select value={source} onChange={(e) => setSource(e.target.value)}>
            <option value="all">{t.common.all}</option>
            {sources.map((s) => (
              <option key={s} value={s}>
                {s === '未命名题集' ? t.sets.untitled : s}
              </option>
            ))}
          </select>
        </div>

        <div className="setup-row">
          <span className="setup-label">{t.practice.scope}</span>
          <label className="check">
            <input type="checkbox" checked={onlyOpen} onChange={(e) => setOnlyOpen(e.target.checked)} /> {t.practice.onlyOpen}
          </label>
          <label className="check">
            <input type="checkbox" checked={shuffle} onChange={(e) => setShuffle(e.target.checked)} /> {t.practice.shuffle}
          </label>
          <label className="check">
            {t.practice.upTo} <input type="number" min={1} max={200} value={count} onChange={(e) => setCount(Math.max(1, +e.target.value || 1))} className="num" /> {t.practice.questions}
          </label>
        </div>

        <div className="setup-row">
          <span className="setup-label">{t.practice.timing}</span>
          <div className="seg">
            {(
              [
                ['countdown', t.practice.countdown(SECONDS_PER_Q[section])],
                ['countup', t.practice.countUp],
                ['none', t.practice.noTimer],
              ] as [TimerMode, string][]
            ).map(([v, label]) => (
              <button key={v} className={timer === v ? 'on' : ''} onClick={() => setTimer(v)}>
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="setup-foot">
          <span>
            {t.practice.pool(pool.length, Math.min(pool.length, count))}
            {imageOnly > 0 && <span className="hint">{practice ? t.practice.imageOnlySet(imageOnly) : t.practice.imageOnly(imageOnly)}</span>}
          </span>
          <button className="btn primary" disabled={pool.length === 0} onClick={start}>
            {t.practice.start}
          </button>
        </div>
      </div>
    </div>
  )
}
