import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { db } from './db'
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
  importBackup: (file: File) => Promise<{ mistakes: number; words: number }>
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
      const data = JSON.parse(await file.text()) as Partial<Backup>
      if (data.app !== 'sat-study') throw new Error('这不是 sat-study 的备份文件')
      const ms = (data.mistakes ?? []).map((m) => ({ ...m, figures: m.figures ?? [] }))
      const ws = data.words ?? []
      await Promise.all([saveMistakes(ms), saveWords(ws)])
      return { mistakes: ms.length, words: ws.length }
    },
    [saveMistakes, saveWords],
  )

  const value = useMemo(
    () => ({ ready, mistakes, words, saveMistake, saveMistakes, deleteMistake, saveWord, saveWords, deleteWord, rateWord, exportBackup, importBackup }),
    [ready, mistakes, words, saveMistake, saveMistakes, deleteMistake, saveWord, saveWords, deleteWord, rateWord, exportBackup, importBackup],
  )

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
}

export function useStore() {
  const ctx = useContext(StoreContext)
  if (!ctx) throw new Error('useStore must be used inside StoreProvider')
  return ctx
}
