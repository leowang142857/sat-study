import { useState } from 'react'
import type { Word } from '../types'
import { uid } from '../db'
import { newSrs, isDue } from '../srs'
import { useStore } from '../store'

type Filter = 'all' | 'due' | 'new' | 'hard'
type Draft = Pick<Word, 'word' | 'partOfSpeech' | 'definition' | 'chinese' | 'example' | 'notes' | 'source'>

const emptyDraft = (): Draft => ({ word: '', partOfSpeech: '', definition: '', chinese: '', example: '', notes: '', source: localStorage.getItem('sat-study:last-word-source') ?? '' })

export function VocabPage() {
  const { words, saveWord, saveWords, deleteWord } = useStore()
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
    setLookup('查询中…')
    try {
      const res = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(w)}`)
      if (!res.ok) throw new Error('词典里没找到')
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
      setLookup(`查不到：${(e as Error).message}（可能没联网）`)
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
    alert(`导入了 ${parsed.length} 个新单词（重复的已跳过）`)
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
          <h1>单词本</h1>
          <p className="sub">
            共 {words.length} 个 · 新词 {words.filter((w) => w.srs.reps === 0).length} · 今天待复习 {words.filter((w) => isDue(w.srs) && w.srs.reps > 0).length}
          </p>
        </div>
        <button className="btn" onClick={() => setBulkOpen((v) => !v)}>
          批量导入
        </button>
      </div>

      {bulkOpen && (
        <div className="card">
          <div className="field-label">
            每行一个：<code>单词 | 中文 | 英文释义 | 例句</code>（也可以直接从 Excel 复制，用 Tab 分隔）。只写单词也行。
          </div>
          <textarea rows={8} value={bulk} onChange={(e) => setBulk(e.target.value)} placeholder={'ubiquitous | 无处不在的 | present everywhere\nmitigate | 减轻'} />
          <div className="modal-foot">
            <button className="btn" onClick={() => setBulkOpen(false)}>
              取消
            </button>
            <button className="btn primary" disabled={!bulk.trim()} onClick={importBulk}>
              导入
            </button>
          </div>
        </div>
      )}

      <div className="card word-form">
        <div className="word-form-grid">
          <label>
            单词 *
            <div className="row-gap">
              <input value={draft.word} onChange={(e) => set('word', e.target.value)} onKeyDown={(e) => e.key === 'Enter' && lookUp()} placeholder="输入后按回车查词典" autoFocus />
              <button className="btn small" onClick={lookUp} disabled={!draft.word.trim()}>
                查词典
              </button>
            </div>
            {lookup && <span className="hint">{lookup}</span>}
            {duplicate && <span className="hint warn">单词本里已经有这个词了</span>}
          </label>
          <label>
            词性
            <input value={draft.partOfSpeech} onChange={(e) => set('partOfSpeech', e.target.value)} placeholder="v. / adj. / n." />
          </label>
          <label>
            中文
            <input value={draft.chinese} onChange={(e) => set('chinese', e.target.value)} placeholder="中文意思" />
          </label>
          <label className="span3">
            英文释义
            <input value={draft.definition} onChange={(e) => set('definition', e.target.value)} />
          </label>
          <label className="span3">
            例句（最好用题目原句）
            <input value={draft.example} onChange={(e) => set('example', e.target.value)} />
          </label>
          <label>
            来源
            <input value={draft.source} onChange={(e) => set('source', e.target.value)} placeholder="如 10月北美A卷" />
          </label>
          <label className="span2">
            笔记
            <input value={draft.notes} onChange={(e) => set('notes', e.target.value)} placeholder="近义词、易混词、词根…" />
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
              取消编辑
            </button>
          )}
          <button className="btn primary" disabled={!draft.word.trim() || duplicate} onClick={save}>
            {editingId ? '保存修改' : '加入单词本'}
          </button>
        </div>
      </div>

      <div className="filters">
        <input className="search" placeholder="搜索单词或释义…" value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="seg">
          {(
            [
              ['all', '全部'],
              ['new', '新词'],
              ['due', '待复习'],
              ['hard', '易忘（忘过 2 次+）'],
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
              <span className={`due ${isDue(w.srs) && w.srs.reps > 0 ? 'now' : ''}`}>{dueLabel(w)}</span>
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
                编辑
              </button>
              <button className="btn small danger" onClick={() => confirm(`删除 ${w.word}？`) && deleteWord(w.id)}>
                删除
              </button>
            </div>
          </div>
        ))}
        {shown.length === 0 && <div className="empty">没有单词</div>}
      </div>
    </div>
  )
}

function dueLabel(w: Word) {
  if (w.srs.reps === 0) return '新词'
  const days = Math.ceil((w.srs.due - Date.now()) / 86400000)
  if (days <= 0) return '待复习'
  return `${days} 天后复习`
}

function abbreviate(pos: string) {
  return ({ noun: 'n.', verb: 'v.', adjective: 'adj.', adverb: 'adv.', preposition: 'prep.', conjunction: 'conj.' } as Record<string, string>)[pos] ?? pos
}
