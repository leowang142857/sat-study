import { useState } from 'react'
import type { Word } from '../types'
import { uid } from '../db'
import { newSrs, isDue } from '../srs'
import { useI18n } from '../i18n'
import type { Messages } from '../messages'
import { useStore } from '../store'

type Filter = 'all' | 'due' | 'new' | 'hard'
type Draft = Pick<Word, 'word' | 'partOfSpeech' | 'definition' | 'chinese' | 'example' | 'notes' | 'source'>

const emptyDraft = (): Draft => ({ word: '', partOfSpeech: '', definition: '', chinese: '', example: '', notes: '', source: localStorage.getItem('sat-study:last-word-source') ?? '' })

export function VocabPage() {
  const { words, saveWord, saveWords, deleteWord } = useStore()
  const { t } = useI18n()
  const [draft, setDraft] = useState<Draft>(emptyDraft)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [lookup, setLookup] = useState('')
  const [bulkOpen, setBulkOpen] = useState(false)
  const [bulk, setBulk] = useState('')
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState<Filter>('all')

  const set = <K extends keyof Draft>(k: K, v: string) => setDraft((d) => ({ ...d, [k]: v }))
  const duplicate = !editingId && words.some((w) => w.word.toLowerCase() === draft.word.trim().toLowerCase())

  async function lookUp() {
    const w = draft.word.trim()
    if (!w) return
    setLookup(t.vocab.looking)
    try {
      const res = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(w)}`)
      if (!res.ok) throw new Error(t.vocab.notFound)
      const data = (await res.json()) as { meanings: { partOfSpeech: string; definitions: { definition: string; example?: string }[] }[] }[]
      const meaning = data[0]?.meanings[0]
      const def = meaning?.definitions[0]
      const example = data.flatMap((d) => d.meanings.flatMap((mm) => mm.definitions)).find((d) => d.example)?.example
      setDraft((d) => ({
        ...d,
        partOfSpeech: d.partOfSpeech || abbreviate(meaning?.partOfSpeech ?? ''),
        definition: d.definition || def?.definition || '',
        example: d.example || example || '',
      }))
      setLookup('')
    } catch (e) {
      setLookup(t.vocab.lookupFail((e as Error).message))
    }
  }

  async function save() {
    const w = draft.word.trim()
    if (!w) return
    localStorage.setItem('sat-study:last-word-source', draft.source)
    if (editingId) {
      const old = words.find((x) => x.id === editingId)!
      await saveWord({ ...old, ...draft, word: w })
    } else {
      await saveWord({ id: uid(), createdAt: Date.now(), ...draft, word: w, srs: newSrs(), lapses: 0 })
    }
    setDraft({ ...emptyDraft(), source: draft.source })
    setEditingId(null)
    setLookup('')
  }

  async function importBulk() {
    const existing = new Set(words.map((w) => w.word.toLowerCase()))
    const parsed: Word[] = []
    for (const line of bulk.split('\n')) {
      const parts = line.split(/\t|\s*\|\s*/).map((s) => s.trim())
      const w = parts[0]
      if (!w || existing.has(w.toLowerCase())) continue
      existing.add(w.toLowerCase())
      parsed.push({
        id: uid(),
        createdAt: Date.now() + parsed.length,
        word: w,
        chinese: parts[1] ?? '',
        definition: parts[2] ?? '',
        example: parts[3] ?? '',
        partOfSpeech: '',
        notes: '',
        source: draft.source,
        srs: newSrs(),
        lapses: 0,
      })
    }
    await saveWords(parsed)
    alert(t.vocab.imported(parsed.length))
    setBulk('')
    setBulkOpen(false)
  }

  const shown = words.filter((w) => {
    if (filter === 'due' && !(isDue(w.srs) && w.srs.reps > 0)) return false
    if (filter === 'new' && w.srs.reps > 0) return false
    if (filter === 'hard' && w.lapses < 2) return false
    if (q) return `${w.word} ${w.chinese} ${w.definition} ${w.example}`.toLowerCase().includes(q.toLowerCase())
    return true
  })

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>{t.vocab.title}</h1>
          <p className="sub">{t.vocab.summary(words.length, words.filter((w) => w.srs.reps === 0).length, words.filter((w) => isDue(w.srs) && w.srs.reps > 0).length)}</p>
        </div>
        <button className="btn" onClick={() => setBulkOpen((v) => !v)}>
          {t.vocab.bulk}
        </button>
      </div>

      {bulkOpen && (
        <div className="card">
          <div className="field-label">{t.vocab.bulkHint}</div>
          <textarea rows={8} value={bulk} onChange={(e) => setBulk(e.target.value)} placeholder={'ubiquitous | 无处不在的 | present everywhere\nmitigate | 减轻'} />
          <div className="modal-foot">
            <button className="btn" onClick={() => setBulkOpen(false)}>
              {t.vocab.cancel}
            </button>
            <button className="btn primary" disabled={!bulk.trim()} onClick={importBulk}>
              {t.vocab.import}
            </button>
          </div>
        </div>
      )}

      <div className="card word-form">
        <div className="word-form-grid">
          <label>
            {t.vocab.word}
            <div className="row-gap">
              <input value={draft.word} onChange={(e) => set('word', e.target.value)} onKeyDown={(e) => e.key === 'Enter' && lookUp()} placeholder={t.vocab.wordPlaceholder} autoFocus />
              <button className="btn small" onClick={lookUp} disabled={!draft.word.trim()}>
                {t.vocab.lookup}
              </button>
            </div>
            {lookup && <span className="hint">{lookup}</span>}
            {duplicate && <span className="hint warn">{t.vocab.duplicate}</span>}
          </label>
          <label>
            {t.vocab.pos}
            <input value={draft.partOfSpeech} onChange={(e) => set('partOfSpeech', e.target.value)} placeholder={t.vocab.posPlaceholder} />
          </label>
          <label>
            {t.vocab.chinese}
            <input value={draft.chinese} onChange={(e) => set('chinese', e.target.value)} placeholder={t.vocab.chinesePlaceholder} />
          </label>
          <label className="span3">
            {t.vocab.definition}
            <input value={draft.definition} onChange={(e) => set('definition', e.target.value)} />
          </label>
          <label className="span3">
            {t.vocab.example}
            <input value={draft.example} onChange={(e) => set('example', e.target.value)} />
          </label>
          <label>
            {t.vocab.source}
            <input value={draft.source} onChange={(e) => set('source', e.target.value)} placeholder={t.vocab.sourcePlaceholder} />
          </label>
          <label className="span2">
            {t.vocab.notes}
            <input value={draft.notes} onChange={(e) => set('notes', e.target.value)} placeholder={t.vocab.notesPlaceholder} />
          </label>
        </div>
        <div className="modal-foot">
          {editingId && (
            <button
              className="btn"
              onClick={() => {
                setEditingId(null)
                setDraft(emptyDraft())
              }}
            >
              {t.vocab.cancelEdit}
            </button>
          )}
          <button className="btn primary" disabled={!draft.word.trim() || duplicate} onClick={save}>
            {editingId ? t.vocab.saveEdit : t.vocab.add}
          </button>
        </div>
      </div>

      <div className="filters">
        <input className="search" placeholder={t.vocab.search} value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="seg">
          {(
            [
              ['all', t.vocab.filterAll],
              ['new', t.vocab.filterNew],
              ['due', t.vocab.filterDue],
              ['hard', t.vocab.filterHard],
            ] as [Filter, string][]
          ).map(([v, label]) => (
            <button key={v} className={filter === v ? 'on' : ''} onClick={() => setFilter(v)}>
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="word-list">
        {shown.map((w) => (
          <div key={w.id} className="card word-row">
            <div className="word-head">
              <span className="word">{w.word}</span>
              {w.partOfSpeech && <span className="pos">{w.partOfSpeech}</span>}
              <span className="zh">{w.chinese}</span>
              <span className={`due ${isDue(w.srs) && w.srs.reps > 0 ? 'now' : ''}`}>{dueLabel(w, t)}</span>
            </div>
            {w.definition && <div className="def">{w.definition}</div>}
            {w.example && <div className="example">“{w.example}”</div>}
            {(w.notes || w.source) && (
              <div className="word-meta">
                {w.notes} {w.source && <span className="chip">{w.source}</span>}
              </div>
            )}
            <div className="card-actions">
              <button
                className="btn small"
                onClick={() => {
                  setEditingId(w.id)
                  setDraft({ word: w.word, partOfSpeech: w.partOfSpeech, definition: w.definition, chinese: w.chinese, example: w.example, notes: w.notes, source: w.source })
                  window.scrollTo({ top: 0, behavior: 'smooth' })
                }}
              >
                {t.vocab.edit}
              </button>
              <button className="btn small danger" onClick={() => confirm(t.vocab.confirmDelete(w.word)) && deleteWord(w.id)}>
                {t.vocab.delete}
              </button>
            </div>
          </div>
        ))}
        {shown.length === 0 && <div className="empty">{t.vocab.empty}</div>}
      </div>
    </div>
  )
}

function dueLabel(w: Word, t: Messages) {
  if (w.srs.reps === 0) return t.vocab.fresh
  const days = Math.ceil((w.srs.due - Date.now()) / 86400000)
  if (days <= 0) return t.vocab.due
  return t.vocab.reviewIn(days)
}

function abbreviate(pos: string) {
  return ({ noun: 'n.', verb: 'v.', adjective: 'adj.', adverb: 'adv.', preposition: 'prep.', conjunction: 'conj.' } as Record<string, string>)[pos] ?? pos
}
