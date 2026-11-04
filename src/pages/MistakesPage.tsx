import { useMemo, useState } from 'react'
import type { Mistake, Section } from '../types'
import { LETTERS } from '../types'
import { QUESTION_TYPES } from '../constants'
import { qtypeLabel } from '../messages'
import { useI18n } from '../i18n'
import { isPracticeItem } from '../questions'
import { useStore } from '../store'
import { MistakeEditor, blankMistake } from '../components/MistakeEditor'
import { RichText } from '../components/RichText'

type Status = 'all' | 'open' | 'mastered'

export function MistakesPage() {
  const { mistakes: all, saveMistake, deleteMistake } = useStore()
  const { t } = useI18n()
  const mistakes = all.filter((m) => !isPracticeItem(m))
  const [editing, setEditing] = useState<{ m: Mistake; isNew: boolean } | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [q, setQ] = useState('')
  const [section, setSection] = useState<Section | 'all'>('all')
  const [type, setType] = useState('all')
  const [source, setSource] = useState('all')
  const [status, setStatus] = useState<Status>('open')

  const sources = useMemo(() => [...new Set(mistakes.map((m) => sourceRoot(m.source)).filter(Boolean))], [mistakes])

  const filtered = mistakes.filter((m) => {
    if (section !== 'all' && m.section !== section) return false
    if (type !== 'all' && m.questionType !== type) return false
    if (source !== 'all' && sourceRoot(m.source) !== source) return false
    if (status === 'open' && m.mastered) return false
    if (status === 'mastered' && !m.mastered) return false
    if (q) {
      const hay = `${m.source} ${m.passage} ${m.question} ${m.explanation} ${m.tags.join(' ')} ${Object.values(m.choices).join(' ')}`.toLowerCase()
      if (!hay.includes(q.toLowerCase())) return false
    }
    return true
  })

  const typeOptions = section === 'all' ? [...QUESTION_TYPES.RW, ...QUESTION_TYPES.Math] : QUESTION_TYPES[section]

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>{t.mistakes.title}</h1>
          <p className="sub">{t.mistakes.summary(mistakes.length, mistakes.filter((m) => !m.mastered).length)}</p>
        </div>
        <button className="btn primary" onClick={() => setEditing({ m: blankMistake(), isNew: true })}>
          {t.mistakes.add}
        </button>
      </div>

      <div className="filters">
        <input className="search" placeholder={t.mistakes.search} value={q} onChange={(e) => setQ(e.target.value)} />
        <select value={section} onChange={(e) => (setSection(e.target.value as Section | 'all'), setType('all'))}>
          <option value="all">{t.mistakes.allSections}</option>
          <option value="RW">{t.common.sectionRW}</option>
          <option value="Math">{t.common.sectionMath}</option>
        </select>
        <select value={type} onChange={(e) => setType(e.target.value)}>
          <option value="all">{t.mistakes.allTypes}</option>
          {typeOptions.map((id) => (
            <option key={id} value={id}>
              {qtypeLabel(t, id)}
            </option>
          ))}
        </select>
        <select value={source} onChange={(e) => setSource(e.target.value)}>
          <option value="all">{t.mistakes.allSources}</option>
          {sources.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <div className="seg">
          {(
            [
              ['open', t.mistakes.statusOpen],
              ['mastered', t.mistakes.statusMastered],
              ['all', t.mistakes.statusAll],
            ] as [Status, string][]
          ).map(([v, label]) => (
            <button key={v} className={status === v ? 'on' : ''} onClick={() => setStatus(v)}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="empty">{mistakes.length === 0 ? t.mistakes.emptyNone : t.mistakes.emptyFiltered}</div>
      ) : (
        <div className="mistake-list">
          {filtered.map((m) => (
            <MistakeCard
              key={m.id}
              m={m}
              open={expanded === m.id}
              onToggle={() => setExpanded(expanded === m.id ? null : m.id)}
              onEdit={() => setEditing({ m, isNew: false })}
              onDelete={() => confirm(t.mistakes.confirmDelete) && deleteMistake(m.id)}
              onMastered={() => saveMistake({ ...m, mastered: !m.mastered, updatedAt: Date.now() })}
            />
          ))}
        </div>
      )}

      {editing && <MistakeEditor key={editing.m.id} initial={editing.m} isNew={editing.isNew} onClose={() => setEditing(null)} />}
    </div>
  )
}

function sourceRoot(s: string) {
  return s.replace(/\s*·\s*Q\d+$/, '').trim()
}

function MistakeCard({ m, open, onToggle, onEdit, onDelete, onMastered }: { m: Mistake; open: boolean; onToggle: () => void; onEdit: () => void; onDelete: () => void; onMastered: () => void }) {
  const { t } = useI18n()
  const redoCorrect = m.reviews.filter((r) => r.correct).length
  const last = m.reviews.at(-1)
  const preview = (m.passage || m.question).replace(/\{\{|\}\}/g, '')

  return (
    <div className={`card mistake ${m.mastered ? 'mastered' : ''}`}>
      <div className="mistake-top" onClick={onToggle}>
        <div className="mistake-main">
          <div className="meta">
            <span className={`chip ${m.section === 'RW' ? 'rw' : 'math'}`}>{m.section === 'RW' ? t.common.sectionRW : t.common.sectionMath}</span>
            {m.questionType && <span className="chip">{qtypeLabel(t, m.questionType)}</span>}
            {m.tags.map((t) => (
              <span key={t} className="chip tag">
                {t}
              </span>
            ))}
            {m.mastered && <span className="chip ok">{t.mistakes.mastered}</span>}
          </div>
          <div className="source">{m.source || t.common.noSource}</div>
          <div className="preview">{preview.length > 160 ? preview.slice(0, 160) + '…' : preview}</div>
        </div>
        <div className="answers">
          <div>
            {t.mistakes.mine} <b className="wrong-text">{m.myAnswer || '—'}</b>
          </div>
          <div>
            {t.mistakes.correct} <b className="correct-text">{m.correct}</b>
          </div>
          {m.reviews.length > 0 && (
            <div className="redo">
              {t.mistakes.redo(redoCorrect, m.reviews.length)}
              {last && <span className={last.correct ? 'correct-text' : 'wrong-text'}> {last.correct ? '✓' : '✗'}</span>}
            </div>
          )}
        </div>
      </div>

      {open && (
        <div className="mistake-detail">
          {m.figures.map((src, i) => (
            <img key={i} className="detail-img" src={src} alt={t.common.figureAlt(i + 1)} />
          ))}
          {m.passage && <RichText className="passage-text" text={m.passage} />}
          {m.question && <p className="question-text">{m.question}</p>}
          {m.format === 'mc' && LETTERS.some((l) => m.choices[l]) && (
            <ul className="detail-choices">
              {LETTERS.map((l) => (
                <li key={l} className={l === m.correct ? 'is-correct' : l === m.myAnswer ? 'is-wrong' : ''}>
                  <span className="letter-pill">{l}</span>
                  <span>{m.choices[l]}</span>
                </li>
              ))}
            </ul>
          )}
          {m.explanation && (
            <div className="explanation">
              <div className="field-label">{t.mistakes.explanation}</div>
              {m.explanation}
            </div>
          )}
          {m.images.length > 0 && (
            <details className="originals">
              <summary>{t.mistakes.originals(m.images.length)}</summary>
              {m.images.map((src, i) => (
                <img key={i} className="detail-img" src={src} alt={t.common.screenshotAlt(i + 1)} />
              ))}
            </details>
          )}
          <div className="card-actions">
            <button className="btn small" onClick={onMastered}>
              {m.mastered ? t.mistakes.backToOpen : t.mistakes.markMastered}
            </button>
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
