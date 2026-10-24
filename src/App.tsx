import { useEffect, useRef, useState } from 'react'
import { StoreProvider, useStore } from './store'
import { MistakesPage } from './pages/MistakesPage'
import { PracticePage } from './pages/PracticePage'
import { VocabPage } from './pages/VocabPage'
import { FlashcardsPage } from './pages/FlashcardsPage'
import { StatsPage } from './pages/StatsPage'
import { isDue } from './srs'

const PAGES = [
  { id: 'mistakes', label: '错题本' },
  { id: 'practice', label: '重做练习' },
  { id: 'vocab', label: '单词本' },
  { id: 'cards', label: '闪卡复习' },
  { id: 'stats', label: '统计' },
] as const
type PageId = (typeof PAGES)[number]['id']

function readHash(): PageId {
  const h = location.hash.slice(1)
  return (PAGES.find((p) => p.id === h)?.id ?? 'mistakes') as PageId
}

function Shell() {
  const { ready, words, exportBackup, importBackup } = useStore()
  const [page, setPage] = useState<PageId>(readHash)
  const [inExam, setInExam] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const onHash = () => setPage(readHash())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  const dueCount = words.filter((w) => isDue(w.srs)).length

  if (!ready) return <div className="loading">加载中…</div>

  return (
    <div className="app">
      {!inExam && (
        <header className="topnav">
          <div className="brand">SAT Study</div>
          <nav>
            {PAGES.map((p) => (
              <a key={p.id} href={`#${p.id}`} className={page === p.id ? 'active' : ''}>
                {p.label}
                {p.id === 'cards' && dueCount > 0 && <span className="badge">{dueCount}</span>}
              </a>
            ))}
          </nav>
          <div className="nav-actions">
            <button className="btn ghost small" onClick={exportBackup} title="把所有错题和单词下载成一个 JSON 文件">
              导出备份
            </button>
            <button className="btn ghost small" onClick={() => fileRef.current?.click()}>
              导入备份
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
                  const r = await importBackup(f)
                  alert(`导入完成：${r.mistakes} 道错题，${r.words} 个单词`)
                } catch (err) {
                  alert(`导入失败：${(err as Error).message}`)
                }
              }}
            />
          </div>
        </header>
      )}
      <main className={inExam ? 'main exam-main' : 'main'}>
        {page === 'mistakes' && <MistakesPage />}
        {page === 'practice' && <PracticePage onExamChange={setInExam} />}
        {page === 'vocab' && <VocabPage />}
        {page === 'cards' && <FlashcardsPage />}
        {page === 'stats' && <StatsPage />}
      </main>
    </div>
  )
}

export default function App() {
  return (
    <StoreProvider>
      <Shell />
    </StoreProvider>
  )
}
