import { useMemo, useRef, useState } from 'react'
import type { Mistake, Section } from '../types'
import { LETTERS } from '../types'
import { typeLabel } from '../constants'
import { isCorrect } from '../grade'
import { formatPracticeImport } from '../importPractice'
import { asWrongCopy, isPracticeItem, practiceSetName, sameQuestion } from '../questions'
import { useStore } from '../store'
import { ExamRunner, type ExamAnswer } from '../components/ExamRunner'
import { MistakeEditor, blankMistake } from '../components/MistakeEditor'
import { PracticeResult } from '../components/PracticeResult'
import { RichText } from '../components/RichText'

const SECONDS_PER_Q: Record<Section, number> = { RW: 71, Math: 95 }

const SAMPLE = `{
  "name": "2024年3月 Practice Test 6",
  "questions": [
    {
      "section": "RW",
      "source": "Module 1 · Q1",
      "questionType": "words-in-context",
      "passage": "The scientist tried to ______ the rumor.",
      "question": "Which choice completes the text with the most logical and precise word or phrase?",
      "choices": { "A": "spread", "B": "dispel", "C": "invent", "D": "ignore" },
      "correct": "B",
      "explanation": "可选"
    }
  ]
}`

interface Session {
  items: Mistake[]
  section: Section
  timer: 'countdown' | 'countup'
  title: string
}

export function SetsPage({ onExamChange }: { onExamChange: (v: boolean) => void }) {
  const { mistakes, saveMistake, saveMistakes, deleteMistake, importPracticeSet } = useStore()
  const practice = useMemo(() => mistakes.filter(isPracticeItem), [mistakes])
  const [openSet, setOpenSet] = useState<string | null>(null)
  const [editing, setEditing] = useState<{ m: Mistake; isNew: boolean } | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [result, setResult] = useState<Mistake[] | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const groups = useMemo(() => {
    const map = new Map<string, Mistake[]>()
    for (const m of practice) {
      const name = practiceSetName(m)
      const list = map.get(name) ?? []
      list.push(m)
      map.set(name, list)
    }
    return [...map.entries()]
      .map(([name, items]) => ({
        name,
        items: items.sort((a, b) => a.source.localeCompare(b.source, 'zh') || a.createdAt - b.createdAt),
      }))
      .sort((a, b) => Math.max(...b.items.map((m) => m.createdAt)) - Math.max(...a.items.map((m) => m.createdAt)))
  }, [practice])

  function start(items: Mistake[]) {
    if (items.length === 0) return
    const sections = new Set(items.map((m) => m.section))
    const section: Section = sections.size === 1 ? items[0].section : 'RW'
    setResult(null)
    setSession({
      items,
      section,
      timer: sections.size === 1 ? 'countdown' : 'countup',
      title: `题集: ${practiceSetName(items[0])}`,
    })
    onExamChange(true)
  }

  async function finish(answers: ExamAnswer[]) {
    if (!session) return
    const now = Date.now()
    const updated = session.items.map((m, i) => {
      const a = answers[i].answer.trim()
      return { ...m, reviews: [...m.reviews, { at: now, correct: isCorrect(m, a), answer: a }] }
    })
    await saveMistakes(updated)
    setResult(updated)
    setSession(null)
    onExamChange(false)
  }

  async function fileWrong(m: Mistake) {
    const answer = m.reviews.at(-1)?.answer ?? ''
    if (mistakes.some((x) => !isPracticeItem(x) && sameQuestion(x, m))) return 'exists' as const
    await saveMistake(asWrongCopy(m, answer))
    return 'added' as const
  }

  async function onFile(f: File) {
    const r = await importPracticeSet(f)
    alert(formatPracticeImport(r))
    setOpenSet(r.name)
  }

  async function removeSet(name: string, items: Mistake[]) {
    if (!confirm(`确定删除题集「${name}」的 ${items.length} 道题？错题本不受影响。`)) return
    for (const m of items) await deleteMistake(m.id)
    if (openSet === name) setOpenSet(null)
  }

  if (session) {
    const limit = session.timer === 'countdown' ? session.items.length * SECONDS_PER_Q[session.section] : null
    return (
      <ExamRunner
        title={session.title}
        items={session.items}
        timeLimit={limit}
        showTimer
        onSubmit={finish}
        onExit={() => {
          if (!confirm('退出后本次作答不会保存，确定退出？')) return
          setSession(null)
          onExamChange(false)
        }}
      />
    )
  }

  if (result) {
    return (
      <PracticeResult items={result} pool="practice" againLabel="返回题集" onAgain={() => setResult(null)} onSave={saveMistakes} onFileWrong={fileWrong} />
    )
  }

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>题集</h1>
          <p className="sub">
            共 {practice.length} 道练习题 · {groups.length} 个题集。这里的题不是错题，不会出现在错题本和错题统计里。
          </p>
        </div>
        <div className="row-gap">
          <button className="btn" onClick={() => fileRef.current?.click()}>
            导入题集
          </button>
          <button className="btn primary" onClick={() => setEditing({ m: blankMistake('practice'), isNew: true })}>
            + 录入练习题
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={async (e) => {
              const f = e.target.files?.[0]
              e.target.value = ''
              if (!f) return
              try {
                await onFile(f)
              } catch (err) {
                alert(`导入失败：${(err as Error).message}`)
              }
            }}
          />
        </div>
      </div>

      <details className="card format-card">
        <summary>题集 JSON 格式</summary>
        <p className="sub">
          用「导入题集」会把题目存成练习题。同一文件再导入会跳过重复题。错题备份请用右上角「导入备份」，两条路径互不覆盖。
        </p>
        <pre className="format-sample">{SAMPLE}</pre>
      </details>

      {groups.length === 0 ? (
        <div className="empty">还没有题集。点「导入题集」选一个 JSON，或「录入练习题」逐题添加。</div>
      ) : (
        <div className="set-list">
          {groups.map((g) => {
            const rw = g.items.filter((m) => m.section === 'RW').length
            const math = g.items.length - rw
            const open = openSet === g.name
            return (
              <div key={g.name} className="card set-card">
                <div className="set-top">
                  <div>
                    <div className="meta">
                      <span className="chip practice">题集</span>
                      {rw > 0 && <span className="chip rw">阅读文法 {rw}</span>}
                      {math > 0 && <span className="chip math">数学 {math}</span>}
                    </div>
                    <h2 className="set-name">{g.name}</h2>
                    <p className="sub">{g.items.length} 题 · 已练 {g.items.filter((m) => m.reviews.length > 0).length} 题</p>
                  </div>
                  <div className="row-gap">
                    <button className="btn small" onClick={() => setOpenSet(open ? null : g.name)}>
                      {open ? '收起' : '查看题目'}
                    </button>
                    <button
                      className="btn small"
                      onClick={() => {
                        const m = blankMistake('practice')
                        m.setName = g.name
                        setEditing({ m, isNew: true })
                      }}
                    >
                      加一题
                    </button>
                    <button className="btn small danger" onClick={() => removeSet(g.name, g.items)}>
                      删除题集
                    </button>
                    <button className="btn small primary" disabled={g.items.every((m) => !m.passage.trim() && !m.question.trim())} onClick={() => start(g.items.filter((m) => m.passage.trim() || m.question.trim()))}>
                      开始练习
                    </button>
                  </div>
                </div>
                {open && (
                  <div className="set-questions">
                    {g.items.map((m, i) => (
                      <SetQuestion
                        key={m.id}
                        m={m}
                        index={i}
                        onEdit={() => setEditing({ m, isNew: false })}
                        onDelete={() => confirm('确定从题集删除这道题？') && deleteMistake(m.id)}
                      />
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {editing && <MistakeEditor key={editing.m.id} initial={editing.m} isNew={editing.isNew} onClose={() => setEditing(null)} />}
    </div>
  )
}

function SetQuestion({ m, index, onEdit, onDelete }: { m: Mistake; index: number; onEdit: () => void; onDelete: () => void }) {
  const [open, setOpen] = useState(false)
  const preview = (m.passage || m.question).replace(/\{\{|\}\}/g, '')
  const last = m.reviews.at(-1)
  return (
    <div className="set-question">
      <button type="button" className="set-question-top" onClick={() => setOpen((v) => !v)}>
        <span className="qnum">{index + 1}</span>
        <span className="set-q-src">{m.source || '未填来源'}</span>
        {m.questionType && <span className="chip">{typeLabel(m.section, m.questionType)}</span>}
        <span className="preview">{preview.length > 90 ? preview.slice(0, 90) + '…' : preview}</span>
        {last && <span className={last.correct ? 'correct-text' : 'wrong-text'}>{last.correct ? '上次 ✓' : '上次 ✗'}</span>}
      </button>
      {open && (
        <div className="mistake-detail">
          {m.passage && <RichText className="passage-text" text={m.passage} />}
          {m.question && <p className="question-text">{m.question}</p>}
          {m.format === 'mc' && LETTERS.some((l) => m.choices[l]) && (
            <ul className="detail-choices">
              {LETTERS.map((l) => (
                <li key={l} className={l === m.correct ? 'is-correct' : ''}>
                  <span className="letter-pill">{l}</span>
                  <span>{m.choices[l]}</span>
                </li>
              ))}
            </ul>
          )}
          {m.format === 'spr' && (
            <div className="explanation">
              <div className="field-label">正确答案</div>
              {m.correct}
            </div>
          )}
          {m.explanation && (
            <div className="explanation">
              <div className="field-label">解析</div>
              {m.explanation}
            </div>
          )}
          <div className="card-actions">
            <button className="btn small" onClick={onEdit}>
              编辑
            </button>
            <button className="btn small danger" onClick={onDelete}>
              删除
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
