import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { db } from './db'
import { buildPracticeItems, type PracticeImportSummary } from './importPractice'
import type { Mistake, Rating, Word } from './types'
import { review } from './srs'
import { seedMistakes, seedWords } from './seed'

const SEEDED_KEY = 'sat-study:seeded'

interface Backup {
  app: 'sat-study'
  version: 1
  exportedAt: string
  mistakes: Mistake[]
  words: Word[]
  /** Set on a practice-set file so the 错题 backup importer can refuse it. */
  kind?: 'wrong' | 'practice'
  questions?: unknown[]
  items?: unknown[]
}

interface StoreValue {
  ready: boolean
  mistakes: Mistake[]
  words: Word[]
  saveMistake: (m: Mistake) => Promise<void>
  saveMistakes: (ms: Mistake[]) => Promise<void>
  deleteMistake: (id: string) => Promise<void>
  saveWord: (w: Word) => Promise<void>
  saveWords: (ws: Word[]) => Promise<void>
  deleteWord: (id: string) => Promise<void>
  rateWord: (id: string, rating: Rating) => Promise<void>
  exportBackup: () => void
  importBackup: (file: File) => Promise<{ mistakes: number; practice: number; words: number }>
  importPracticeSet: (file: File) => Promise<PracticeImportSummary>
}

const StoreContext = createContext<StoreValue | null>(null)

const byNewest = <T extends { createdAt: number }>(a: T, b: T) => b.createdAt - a.createdAt

/** Module-level so StrictMode's double effect run can't seed twice. */
let initialLoad: Promise<[Mistake[], Word[]]> | null = null
function loadAll() {
  initialLoad ??= (async () => {
    let [ms, ws] = await Promise.all([db.getAll<Mistake>('mistakes'), db.getAll<Word>('words')])
    if (!localStorage.getItem(SEEDED_KEY) && ms.length === 0 && ws.length === 0) {
      ms = seedMistakes()
      ws = seedWords()
      await Promise.all([db.putMany('mistakes', ms), db.putMany('words', ws)])
    }
    localStorage.setItem(SEEDED_KEY, '1')
    return [ms.map((m) => ({ ...m, figures: m.figures ?? [] })), ws]
  })()
  return initialLoad
}

function normalizeBackupMistake(m: Mistake): Mistake {
  return {
    ...m,
    figures: m.figures ?? [],
    kind: m.kind === 'practice' ? 'practice' : 'wrong',
    setName: typeof m.setName === 'string' ? m.setName : undefined,
  }
}

function upsert<T extends { id: string; createdAt: number }>(list: T[], items: T[]): T[] {
  const map = new Map(list.map((x) => [x.id, x]))
  items.forEach((x) => map.set(x.id, x))
  return [...map.values()].sort(byNewest)
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false)
  const [mistakes, setMistakes] = useState<Mistake[]>([])
  const [words, setWords] = useState<Word[]>([])

  useEffect(() => {
    loadAll().then(([ms, ws]) => {
      setMistakes([...ms].sort(byNewest))
      setWords([...ws].sort(byNewest))
      setReady(true)
    })
  }, [])

  const saveMistakes = useCallback(async (items: Mistake[]) => {
    await db.putMany('mistakes', items)
    setMistakes((l) => upsert(l, items))
  }, [])
  const saveMistake = useCallback((m: Mistake) => saveMistakes([m]), [saveMistakes])
  const deleteMistake = useCallback(async (id: string) => {
    await db.delete('mistakes', id)
    setMistakes((l) => l.filter((x) => x.id !== id))
  }, [])

  const saveWords = useCallback(async (items: Word[]) => {
    await db.putMany('words', items)
    setWords((l) => upsert(l, items))
  }, [])
  const saveWord = useCallback((w: Word) => saveWords([w]), [saveWords])
  const deleteWord = useCallback(async (id: string) => {
    await db.delete('words', id)
    setWords((l) => l.filter((x) => x.id !== id))
  }, [])

  const rateWord = useCallback(
    async (id: string, rating: Rating) => {
      const w = words.find((x) => x.id === id)
      if (!w) return
      await saveWord({ ...w, srs: review(w.srs, rating), lapses: w.lapses + (rating === 'again' ? 1 : 0) })
    },
    [words, saveWord],
  )

  const exportBackup = useCallback(() => {
    const data: Backup = { app: 'sat-study', version: 1, exportedAt: new Date().toISOString(), mistakes, words }
    const blob = new Blob([JSON.stringify(data)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `sat-study-backup-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(a.href)
  }, [mistakes, words])

  const importBackup = useCallback(
    async (file: File) => {
      let data: Partial<Backup>
      try {
        data = JSON.parse(await file.text()) as Partial<Backup>
      } catch {
        throw new Error('文件不是有效的 JSON')
      }
      if (data.kind === 'practice' || ((data.questions || data.items) && !data.mistakes)) {
        throw new Error('这是题集文件。请点「导入题集」，这样不会记入错题本。')
      }
      if (data.app !== 'sat-study') throw new Error('这不是 sat-study 的备份文件')
      const ms = (data.mistakes ?? []).map(normalizeBackupMistake)
      const ws = data.words ?? []
      await Promise.all([saveMistakes(ms), saveWords(ws)])
      const practice = ms.filter((m) => m.kind === 'practice').length
      return { mistakes: ms.length - practice, practice, words: ws.length }
    },
    [saveMistakes, saveWords],
  )

  const importPracticeSet = useCallback(
    async (file: File) => {
      let raw: unknown
      try {
        raw = JSON.parse(await file.text())
      } catch {
        throw new Error('文件不是有效的 JSON')
      }
      const parsed = buildPracticeItems(raw, mistakes)
      if (parsed.added === 0 && parsed.duplicate === 0) {
        throw new Error('没有可导入的题目。每题至少要有文章或题干，以及正确答案。')
      }
      if (parsed.items.length) await saveMistakes(parsed.items)
      return parsed
    },
    [mistakes, saveMistakes],
  )

  const value = useMemo(
    () => ({
      ready,
      mistakes,
      words,
      saveMistake,
      saveMistakes,
      deleteMistake,
      saveWord,
      saveWords,
      deleteWord,
      rateWord,
      exportBackup,
      importBackup,
      importPracticeSet,
    }),
    [ready, mistakes, words, saveMistake, saveMistakes, deleteMistake, saveWord, saveWords, deleteWord, rateWord, exportBackup, importBackup, importPracticeSet],
  )

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
}

export function useStore() {
  const ctx = useContext(StoreContext)
  if (!ctx) throw new Error('useStore must be used inside StoreProvider')
  return ctx
}
