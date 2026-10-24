import { useEffect, useMemo, useState } from 'react'
import type { Rating, Word } from '../types'
import { isDue, previewInterval } from '../srs'
import { useStore } from '../store'

const NEW_PER_DAY_KEY = 'sat-study:new-per-day'
const RATINGS: { r: Rating; label: string; key: string }[] = [
  { r: 'again', label: '忘了', key: '1' },
  { r: 'hard', label: '模糊', key: '2' },
  { r: 'good', label: '记得', key: '3' },
  { r: 'easy', label: '很熟', key: '4' },
]

type Mode = 'en-zh' | 'zh-en'

export function FlashcardsPage() {
  const { words, rateWord } = useStore()
  const [newPerDay, setNewPerDay] = useState(() => Number(localStorage.getItem(NEW_PER_DAY_KEY)) || 20)
  const [mode, setMode] = useState<Mode>('en-zh')
  const [cram, setCram] = useState(false)
  const [flipped, setFlipped] = useState(false)
  const [done, setDone] = useState(0)
  const [cramQueue, setCramQueue] = useState<string[]>([])

  const queue = useMemo(() => {
    if (cram) return cramQueue.map((id) => words.find((w) => w.id === id)).filter((w): w is Word => !!w)
    const reviews = words.filter((w) => w.srs.reps > 0 && isDue(w.srs)).sort((a, b) => a.srs.due - b.srs.due)
    const fresh = words
      .filter((w) => w.srs.reps === 0 && isDue(w.srs))
      .sort((a, b) => a.createdAt - b.createdAt)
      .slice(0, Math.max(0, newPerDay))
    return [...reviews, ...fresh]
  }, [words, newPerDay, cram, cramQueue])

  const card = queue[0]

  async function rate(r: Rating) {
    if (!card) return
    if (cram) {
      setCramQueue((q) => (r === 'again' ? [...q.slice(1), q[0]] : q.slice(1)))
    } else {
      await rateWord(card.id, r)
    }
    setDone((d) => d + 1)
    setFlipped(false)
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === 'INPUT') return
      if (e.key === ' ') {
        e.preventDefault()
        setFlipped((f) => !f)
      } else if (flipped) {
        const hit = RATINGS.find((x) => x.key === e.key)
        if (hit) rate(hit.r)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  return (
    <div className="page narrow">
      <div className="page-head">
        <div>
          <h1>闪卡复习</h1>
          <p className="sub">{cram ? `自由练习 · 剩 ${queue.length} 张` : `今天还剩 ${queue.length} 张 · 已复习 ${done} 张`}</p>
        </div>
        <div className="row-gap">
          <div className="seg">
            <button className={mode === 'en-zh' ? 'on' : ''} onClick={() => setMode('en-zh')}>
              英 → 中
            </button>
            <button className={mode === 'zh-en' ? 'on' : ''} onClick={() => setMode('zh-en')}>
              中 → 英
            </button>
          </div>
          <label className="check">
            每天新词
            <input
              type="number"
              className="num"
              min={0}
              value={newPerDay}
              onChange={(e) => {
                const v = Math.max(0, +e.target.value || 0)
                setNewPerDay(v)
                localStorage.setItem(NEW_PER_DAY_KEY, String(v))
              }}
            />
          </label>
        </div>
      </div>

      {card ? (
        <>
          <div className={`flashcard ${flipped ? 'flipped' : ''}`} onClick={() => setFlipped((f) => !f)}>
            {mode === 'en-zh' || flipped ? (
              <div className="fc-word">
                {card.word} {card.partOfSpeech && <span className="pos">{card.partOfSpeech}</span>}
              </div>
            ) : (
              <div className="fc-prompt">{card.chinese || card.definition || '（没有中文释义，翻面看答案）'}</div>
            )}
            {mode === 'zh-en' && !flipped && card.example && <div className="fc-example muted">{blankOut(card.example, card.word)}</div>}
            {flipped ? (
              <div className="fc-back">
                {card.chinese && <div className="fc-zh">{card.chinese}</div>}
                {card.definition && <div className="fc-def">{card.definition}</div>}
                {card.example && <div className="fc-example">“{card.example}”</div>}
                {card.notes && <div className="fc-notes">{card.notes}</div>}
              </div>
            ) : (
              <div className="fc-hint">点击或按空格翻面</div>
            )}
          </div>
          {flipped && (
            <div className="rating-row">
              {RATINGS.map(({ r, label, key }) => (
                <button key={r} className={`rate-btn ${r}`} onClick={() => rate(r)}>
                  <b>{label}</b>
                  <span>{cram ? key : previewInterval(card.srs, r)}</span>
                </button>
              ))}
            </div>
          )}
        </>
      ) : (
        <div className="card done-card">
          <h2>🎉 {cram ? '这一轮练完了' : '今天的单词复习完了'}</h2>
          <p className="sub">{words.length === 0 ? '先去单词本加几个单词吧。' : '不想停的话，可以自由练习全部单词（不影响复习计划）。'}</p>
          {words.length > 0 && (
            <button
              className="btn primary"
              onClick={() => {
                setCram(true)
                setCramQueue([...words].sort(() => Math.random() - 0.5).map((w) => w.id))
              }}
            >
              自由练习全部 {words.length} 个
            </button>
          )}
        </div>
      )}
      {cram && (
        <button className="btn ghost" onClick={() => setCram(false)}>
          ← 回到今日复习
        </button>
      )}
      <p className="hint center">快捷键：空格翻面，1 忘了 · 2 模糊 · 3 记得 · 4 很熟</p>
    </div>
  )
}

function blankOut(sentence: string, word: string) {
  const stem = word.slice(0, Math.max(3, word.length - 2))
  return sentence.replace(new RegExp(`\\b${stem.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\w*`, 'gi'), '_____')
}
