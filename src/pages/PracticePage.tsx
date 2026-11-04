import { useEffect, useMemo, useState } from 'react'
import type { Mistake, Section } from '../types'
import { QUESTION_TYPES } from '../constants'
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
  title: string
}

export function PracticePage({ onExamChange }: { onExamChange: (v: boolean) => void }) {
  const { mistakes, saveMistake, saveMistakes } = useStore()
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
    const title =
      poolKind === 'practice'
        ? `题集练习: ${source === 'all' ? (section === 'RW' ? 'Reading and Writing' : 'Math') : source}`
        : `错题重做: ${section === 'RW' ? 'Reading and Writing' : 'Math'}`
    setResult(null)
    setSession({ items, section, timer, pool: poolKind, title })
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
        title={session.title}
        items={session.items}
        timeLimit={limit}
        showTimer={session.timer !== 'none'}
        onSubmit={finish}
        onExit={() => confirm('退出后本次作答不会保存，确定退出？') && setSession(null)}
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
          <h1>{practice ? '题集练习' : '重做练习'}</h1>
          <p className="sub">{practice ? '按题集做整组练习。做对做错都留在题集里，不会自动变成错题。' : '用考试界面重做错题，交卷后自动记录对错'}</p>
        </div>
      </div>

      <div className="card setup">
        <div className="setup-row">
          <span className="setup-label">内容</span>
          <div className="seg">
            <button className={poolKind === 'wrong' ? 'on' : ''} onClick={() => choosePool('wrong')}>
              错题重做
            </button>
            <button className={poolKind === 'practice' ? 'on' : ''} onClick={() => choosePool('practice')}>
              题集练习
            </button>
          </div>
        </div>

        <div className="setup-row">
          <span className="setup-label">模块</span>
          <div className="seg">
            {(['RW', 'Math'] as Section[]).map((s) => (
              <button key={s} className={section === s ? 'on' : ''} onClick={() => (setSection(s), setTypes([]))}>
                {s === 'RW' ? '阅读文法' : '数学'}
              </button>
            ))}
          </div>
        </div>

        <div className="setup-row top">
          <span className="setup-label">题型</span>
          <div className="chips-select">
            <button className={`chip-btn ${types.length === 0 ? 'on' : ''}`} onClick={() => setTypes([])}>
              全部
            </button>
            {QUESTION_TYPES[section].map((t) => {
              const n = bank.filter((m) => m.section === section && m.questionType === t.id && practicable(m) && (!onlyOpen || !m.mastered)).length
              return (
                <button
                  key={t.id}
                  className={`chip-btn ${types.includes(t.id) ? 'on' : ''}`}
                  disabled={n === 0}
                  onClick={() => setTypes((p) => (p.includes(t.id) ? p.filter((x) => x !== t.id) : [...p, t.id]))}
                >
                  {t.label} <span className="count">{n}</span>
                </button>
              )
            })}
          </div>
        </div>

        <div className="setup-row">
          <span className="setup-label">{practice ? '题集' : '来源'}</span>
          <select value={source} onChange={(e) => setSource(e.target.value)}>
            <option value="all">全部</option>
            {sources.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>

        <div className="setup-row">
          <span className="setup-label">范围</span>
          <label className="check">
            <input type="checkbox" checked={onlyOpen} onChange={(e) => setOnlyOpen(e.target.checked)} /> 只练未掌握的
          </label>
          <label className="check">
            <input type="checkbox" checked={shuffle} onChange={(e) => setShuffle(e.target.checked)} /> 打乱顺序
          </label>
          <label className="check">
            最多 <input type="number" min={1} max={200} value={count} onChange={(e) => setCount(Math.max(1, +e.target.value || 1))} className="num" /> 题
          </label>
        </div>

        <div className="setup-row">
          <span className="setup-label">计时</span>
          <div className="seg">
            {(
              [
                ['countdown', `倒计时（每题 ${SECONDS_PER_Q[section]} 秒，同真考）`],
                ['countup', '正计时'],
                ['none', '不计时'],
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
            符合条件 <b>{pool.length}</b> 题，本次练 <b>{Math.min(pool.length, count)}</b> 题
            {imageOnly > 0 && (
              <span className="hint">
                {practice ? ` · 有 ${imageOnly} 道题还没有文字，无法练习` : ` · 有 ${imageOnly} 道错题还没有文字，先去错题本点「识别文字」`}
              </span>
            )}
          </span>
          <button className="btn primary" disabled={pool.length === 0} onClick={start}>
            开始练习
          </button>
        </div>
      </div>
    </div>
  )
}
