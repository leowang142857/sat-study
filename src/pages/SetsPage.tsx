import { useMemo, useRef, useState } from 'react'
import type { Mistake, Section } from '../types'
import { LETTERS } from '../types'
import { qtypeLabel, importErrorDetail } from '../messages'
import { useI18n } from '../i18n'
import { isCorrect } from '../grade'
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
}

export function SetsPage({ onExamChange }: { onExamChange: (v: boolean) => void }) {
  const { mistakes, saveMistake, saveMistakes, deleteMistake, importPracticeSet } = useStore()
  const { t } = useI18n()
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
    alert(t.backup.practiceImport(r))
    setOpenSet(r.name)
  }

  async function removeSet(name: string, items: Mistake[]) {
    if (!confirm(t.sets.confirmDeleteSet(showSet(name, t.sets.untitled), items.length))) return
    for (const m of items) await deleteMistake(m.id)
    if (openSet === name) setOpenSet(null)
  }

  if (session) {
    const limit = session.timer === 'countdown' ? session.items.length * SECONDS_PER_Q[session.section] : null
    return (
      <ExamRunner
        title={t.sets.examTitle(showSet(practiceSetName(session.items[0]), t.sets.untitled))}
        items={session.items}
        timeLimit={limit}
        showTimer
        onSubmit={finish}
        onExit={() => {
          if (!confirm(t.practice.confirmExit)) return
          setSession(null)
          onExamChange(false)
        }}
      />
    )
  }

  if (result) {
    return (
      <PracticeResult items={result} pool="practice" againLabel={t.practice.againSet} onAgain={() => setResult(null)} onSave={saveMistakes} onFileWrong={fileWrong} />
    )
  }

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>{t.sets.title}</h1>
          <p className="sub">{t.sets.summary(practice.length, groups.length)}</p>
        </div>
        <div className="row-gap">
          <button className="btn" onClick={() => fileRef.current?.click()}>
            {t.sets.import}
          </button>
          <button className="btn primary" onClick={() => setEditing({ m: blankMistake('practice'), isNew: true })}>
            {t.sets.add}
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
                alert(t.backup.failed(importErrorDetail(err, t)))
              }
            }}
          />
        </div>
      </div>

      <details className="card format-card">
        <summary>{t.sets.format}</summary>
        <p className="sub">{t.sets.formatHint}</p>
        <pre className="format-sample">{SAMPLE}</pre>
      </details>

      {groups.length === 0 ? (
        <div className="empty">{t.sets.empty}</div>
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
                      <span className="chip practice">{t.sets.chip}</span>
                      {rw > 0 && <span className="chip rw">{t.sets.rwCount(rw)}</span>}
                      {math > 0 && <span className="chip math">{t.sets.mathCount(math)}</span>}
                    </div>
                    <h2 className="set-name">{showSet(g.name, t.sets.untitled)}</h2>
                    <p className="sub">{t.sets.progress(g.items.length, g.items.filter((m) => m.reviews.length > 0).length)}</p>
                  </div>
                  <div className="row-gap">
                    <button className="btn small" onClick={() => setOpenSet(open ? null : g.name)}>
                      {open ? t.sets.collapse : t.sets.view}
                    </button>
                    <button
                      className="btn small"
                      onClick={() => {
                        const m = blankMistake('practice')
                        m.setName = g.name
                        setEditing({ m, isNew: true })
                      }}
                    >
                      {t.sets.addOne}
                    </button>
                    <button className="btn small danger" onClick={() => removeSet(g.name, g.items)}>
                      {t.sets.deleteSet}
                    </button>
                    <button className="btn small primary" disabled={g.items.every((m) => !m.passage.trim() && !m.question.trim())} onClick={() => start(g.items.filter((m) => m.passage.trim() || m.question.trim()))}>
                      {t.sets.start}
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
                        onDelete={() => confirm(t.sets.confirmDeleteQuestion) && deleteMistake(m.id)}
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

function showSet(name: string, untitled: string) {
  return name === '未命名题集' ? untitled : name
}

function SetQuestion({ m, index, onEdit, onDelete }: { m: Mistake; index: number; onEdit: () => void; onDelete: () => void }) {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  const preview = (m.passage || m.question).replace(/\{\{|\}\}/g, '')
  const last = m.reviews.at(-1)
  return (
    <div className="set-question">
      <button type="button" className="set-question-top" onClick={() => setOpen((v) => !v)}>
        <span className="qnum">{index + 1}</span>
        <span className="set-q-src">{m.source || t.common.noSource}</span>
        {m.questionType && <span className="chip">{qtypeLabel(t, m.questionType)}</span>}
        <span className="preview">{preview.length > 90 ? preview.slice(0, 90) + '…' : preview}</span>
        {last && <span className={last.correct ? 'correct-text' : 'wrong-text'}>{last.correct ? t.practice.lastOk : t.practice.lastBad}</span>}
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
              <div className="field-label">{t.sets.correct}</div>
              {m.correct}
            </div>
          )}
          {m.explanation && (
            <div className="explanation">
              <div className="field-label">{t.common.explanation}</div>
              {m.explanation}
            </div>
          )}
          <div className="card-actions">
            <button className="btn small" onClick={onEdit}>
              {t.common.edit}
            </button>
            <button className="btn small danger" onClick={onDelete}>
              {t.common.delete}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
