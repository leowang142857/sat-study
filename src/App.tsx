import { useEffect, useRef, useState } from 'react'
import { I18nProvider, LanguageToggle, useI18n } from './i18n'
import { importErrorDetail } from './messages'
import { StoreProvider, useStore } from './store'
import { usePracticeImport } from './components/PracticeImport'
import { MistakesPage } from './pages/MistakesPage'
import { SetsPage } from './pages/SetsPage'
import { PracticePage } from './pages/PracticePage'
import { VocabPage } from './pages/VocabPage'
import { FlashcardsPage } from './pages/FlashcardsPage'
import { StatsPage } from './pages/StatsPage'
import { isDue } from './srs'

const PAGE_IDS = ['mistakes', 'sets', 'practice', 'vocab', 'cards', 'stats'] as const
type PageId = (typeof PAGE_IDS)[number]

function readHash(): PageId {
  const h = location.hash.slice(1)
  return (PAGE_IDS.find((id) => id === h) ?? 'mistakes') as PageId
}

function Shell() {
  const { ready, words, exportBackup, importBackup } = useStore()
  const { t } = useI18n()
  const [page, setPage] = useState<PageId>(readHash)
  const [inExam, setInExam] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const setImport = usePracticeImport((r) => {
    location.hash = 'sets'
    alert(t.backup.practiceImport(r))
  })

  useEffect(() => {
    const onHash = () => setPage(readHash())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  const dueCount = words.filter((w) => isDue(w.srs)).length
  const labels: Record<PageId, string> = {
    mistakes: t.nav.mistakes,
    sets: t.nav.sets,
    practice: t.nav.practice,
    vocab: t.nav.vocab,
    cards: t.nav.cards,
    stats: t.nav.stats,
  }

  if (!ready) return <div className="loading">{t.loading}</div>

  return (
    <div className="app">
      {!inExam && (
        <header className="topnav">
          <div className="brand">SAT Study</div>
          <nav>
            {PAGE_IDS.map((id) => (
              <a key={id} href={`#${id}`} className={page === id ? 'active' : ''}>
                {labels[id]}
                {id === 'cards' && dueCount > 0 && <span className="badge">{dueCount}</span>}
              </a>
            ))}
          </nav>
          <div className="nav-actions">
            <LanguageToggle />
            <button className="btn ghost small" onClick={exportBackup} title={t.backup.exportTitle}>
              {t.backup.export}
            </button>
            <button className="btn ghost small" onClick={() => fileRef.current?.click()} title={t.backup.importTitle}>
              {t.backup.import}
            </button>
            <button className="btn ghost small" onClick={setImport.open} title={t.backup.importSetTitle}>
              {t.backup.importSet}
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
                  alert(r.practice ? t.backup.doneWithPractice(r.mistakes, r.practice, r.words) : t.backup.done(r.mistakes, r.words))
                } catch (err) {
                  alert(t.backup.failed(importErrorDetail(err, t)))
                }
              }}
            />
            {setImport.ui}
          </div>
        </header>
      )}
      <main className={inExam ? 'main exam-main' : 'main'}>
        {page === 'mistakes' && <MistakesPage />}
        {page === 'sets' && <SetsPage onExamChange={setInExam} />}
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
    <I18nProvider>
      <StoreProvider>
        <Shell />
      </StoreProvider>
    </I18nProvider>
  )
}
