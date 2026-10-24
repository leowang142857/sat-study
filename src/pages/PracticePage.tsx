import { useEffect, useMemo, useState } from 'react'
import type { Mistake, Section } from '../types'
import { LETTERS } from '../types'
import { QUESTION_TYPES, typeLabel } from '../constants'
import { useStore } from '../store'
import { ExamRunner, type ExamAnswer } from '../components/ExamRunner'
import { RichText } from '../components/RichText'

type TimerMode = 'none' | 'countdown' | 'countup'
const SECONDS_PER_Q: Record<Section, number> = { RW: 71, Math: 95 }

interface Session {
  items: Mistake[]
  section: Section
  timer: TimerMode
}

export function PracticePage({ onExamChange }: { onExamChange: (v: boolean) => void }) {
  const { mistakes, saveMistakes } = useStore()
  const [section, setSection] = useState<Section>('RW')
  const [types, setTypes] = useState<string[]>([])
  const [source, setSource] = useState('all')
  const [onlyOpen, setOnlyOpen] = useState(true)
  const [shuffle, setShuffle] = useState(true)
  const [count, setCount] = useState(27)
  const [timer, setTimer] = useState<TimerMode>('countdown')
  const [session, setSession] = useState<Session | null>(null)
  const [result, setResult] = useState<{ items: Mistake[]; answers: ExamAnswer[] } | null>(null)

  useEffect(() => onExamChange(!!session), [session, onExamChange])

  const practicable = (m: Mistake) => !!(m.passage.trim() || m.question.trim())
  const sources = useMemo(() => [...new Set(mistakes.map((m) => m.source.replace(/\s*·\s*Q\d+$/, '')).filter(Boolean))], [mistakes])
  const pool = mistakes.filter(
    (m) =>
      m.section === section &&
      practicable(m) &&
      (!onlyOpen || !m.mastered) &&
      (types.length === 0 || types.includes(m.questionType)) &&
      (source === 'all' || m.source.startsWith(source)),
  )
  const imageOnly = mistakes.filter((m) => m.section === section && !practicable(m)).length

  function start() {
    let items = [...pool]
    if (shuffle) items.sort(() => Math.random() - 0.5)
    else items.sort((a, b) => a.createdAt - b.createdAt)
    items = items.slice(0, count)
    setResult(null)
    setSession({ items, section, timer })
  }

  async function finish(answers: ExamAnswer[]) {
    if (!session) return
    const now = Date.now()
    const updated = session.items.map((m, i) => {
      const a = answers[i].answer.trim()
      return { ...m, reviews: [...m.reviews, { at: now, correct: isCorrect(m, a), answer: a }] }
    })
    await saveMistakes(updated)
    setResult({ items: updated, answers })
    setSession(null)
  }

  if (session) {
    const limit = session.timer === 'countdown' ? session.items.length * SECONDS_PER_Q[session.section] : null
    return (
      <ExamRunner
        title={`错题重做: ${session.section === 'RW' ? 'Reading and Writing' : 'Math'}`}
        items={session.items}
        timeLimit={limit}
        showTimer={session.timer !== 'none'}
        onSubmit={finish}
        onExit={() => confirm('退出后本次作答不会保存，确定退出？') && setSession(null)}
      />
    )
  }

  if (result) return <ResultView result={result} onAgain={() => setResult(null)} onSave={saveMistakes} />

  return (
    <div className="page narrow">
      <div className="page-head">
        <div>
          <h1>重做练习</h1>
          <p className="sub">用考试界面重做错题，交卷后自动记录对错</p>
        </div>
      </div>

      <div className="card setup">
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
              const n = mistakes.filter((m) => m.section === section && m.questionType === t.id && practicable(m) && (!onlyOpen || !m.mastered)).length
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
          <span className="setup-label">来源</span>
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
            {imageOnly > 0 && <span className="hint"> · 有 {imageOnly} 道错题还没有文字，先去错题本点「识别文字」</span>}
          </span>
          <button className="btn primary" disabled={pool.length === 0} onClick={start}>
            开始练习
          </button>
        </div>
      </div>
    </div>
  )
}

function isCorrect(m: Mistake, answer: string): boolean {
  if (!answer) return false
  if (m.format === 'mc') return answer.toUpperCase() === m.correct.toUpperCase()
  const norm = (s: string) => s.replace(/\s/g, '').toLowerCase()
  const num = (s: string) => {
    const t = norm(s)
    if (/^-?\d+\/\d+$/.test(t)) {
      const [a, b] = t.split('/').map(Number)
      return b ? a / b : NaN
    }
    return Number(t)
  }
  return m.correct
    .split(/[,，;；]|\bor\b/)
    .map((c) => c.trim())
    .filter(Boolean)
    .some((c) => norm(c) === norm(answer) || (!isNaN(num(c)) && Math.abs(num(c) - num(answer)) < 1e-3))
}

function ResultView({ result, onAgain, onSave }: { result: { items: Mistake[]; answers: ExamAnswer[] }; onAgain: () => void; onSave: (ms: Mistake[]) => Promise<void> }) {
  const [items, setItems] = useState(result.items)
  const [open, setOpen] = useState<number | null>(null)
  const right = items.filter((m) => m.reviews.at(-1)?.correct).length

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

  return (
    <div className="page narrow">
      <div className="page-head">
        <div>
          <h1>
            本次得分 {right} / {items.length}
          </h1>
          <p className="sub">正确率 {items.length ? Math.round((right / items.length) * 100) : 0}% · 结果已记录到每道错题</p>
        </div>
        <div className="row-gap">
          <button className="btn" onClick={masterAllCorrect}>
            做对的全部标记已掌握
          </button>
          <button className="btn primary" onClick={onAgain}>
            再练一组
          </button>
        </div>
      </div>

      <div className="result-list">
        {items.map((m, i) => {
          const last = m.reviews.at(-1)!
          return (
            <div key={m.id} className={`card result ${last.correct ? 'ok' : 'bad'}`}>
              <div className="result-row" onClick={() => setOpen(open === i ? null : i)}>
                <span className="qnum">{i + 1}</span>
                <span className={last.correct ? 'correct-text' : 'wrong-text'}>{last.correct ? '✓' : '✗'}</span>
                <span className="result-src">
                  {m.source} · {typeLabel(m.section, m.questionType)}
                </span>
                <span>
                  你的答案 <b className={last.correct ? 'correct-text' : 'wrong-text'}>{last.answer || '未作答'}</b> · 正确 <b className="correct-text">{m.correct}</b>
                </span>
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
